import type { ImportJob, RecipeSummary } from "@recipeflare/schema";
import { Link } from "@tanstack/react-router";
import { ArrowDownUp, ChevronDown, CloudOff, Link2, ListFilter, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "../../ui/Button";
import { RemovableChip } from "../../ui/Chip";
import { type DividerTab, DividerTabs } from "../../ui/DividerTabs";
import { EmptyState, Notice } from "../../ui/Notice";
import { Page } from "../../ui/Page";
import { RecipeRow, RecipeRowSkeleton, type RowLink } from "../../ui/RecipeRow";
import type { Stock } from "../../ui/stock";
import { FilterSheet, type ListOption } from "./FilterSheet";
import { ImportRow } from "./ImportRow";
import {
  EMPTY_LIST_STATE,
  effectiveSort,
  filterCount,
  isNarrowed,
  type ListSort,
  type ListState,
  SORT_LABELS,
} from "./listState";
import { SearchField } from "./SearchField";

export type ListCategory = ListOption & { stock: Stock };

/** Where the screen's own links lead. The mock harness points them at mock screens. */
export type ListLinks = {
  newRecipe: "/add" | "/mock/new";
  importLink: "/add" | "/mock/add";
};

type RecipeListScreenProps = {
  state: ListState;
  onChange: (next: ListState) => void;
  categories: ListCategory[];
  tags: ListOption[];
  tools: ListOption[];
  foods: ListOption[];
  /** The recipes that match, in order. Null while they load. */
  recipes: RecipeSummary[] | null;
  /** How many recipes the household has in all. Zero is the first run. Null while loading. */
  libraryCount: number | null;
  /** Imports that still need a person, newest first. */
  imports?: ImportJob[];
  /** True when the device has no connection and the list is the copy saved on it. */
  offline?: boolean;
  links: ListLinks;
  /** Where a row leads. Without it rows are not links. */
  recipeLink?: (recipe: RecipeSummary) => RowLink | undefined;
  thumbnailFor?: (recipe: RecipeSummary) => string | undefined;
  onReviewImport?: (job: ImportJob) => void;
  onRetryImport?: (job: ImportJob) => void;
  onRemoveImport?: (job: ImportJob) => void;
};

const ALL = "all";
const PANEL = "recipe-stack";
const SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"];
const LINK_BUTTON =
  "transition-rf inline-flex min-h-touch items-center justify-center gap-2 rounded-md px-5 font-semibold no-underline";

const plural = (n: number) => `${n} ${n === 1 ? "recipe" : "recipes"}`;

function SortSelect({ state, onChange }: { state: ListState; onChange: (sort: ListSort) => void }) {
  const id = useId();
  const searching = state.q.trim() !== "";
  const sorts: ListSort[] = searching
    ? ["match", "changed", "newest", "title"]
    : ["changed", "newest", "title"];
  return (
    <div className="relative min-w-[min(11rem,100%)] flex-1 md:max-w-64">
      <label htmlFor={id} className="sr-only">
        Sort by
      </label>
      <select
        id={id}
        value={effectiveSort(state)}
        onChange={(event) => onChange(event.target.value as ListSort)}
        className="transition-rf min-h-touch w-full appearance-none rounded-md border border-rule-strong bg-surface py-0 pr-9 pl-10 text-base font-semibold text-ink hover:bg-surface-sunk"
      >
        {sorts.map((sort) => (
          <option key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </option>
        ))}
      </select>
      {/* Says that this control sorts, since its label is read out but not shown. */}
      <ArrowDownUp
        aria-hidden="true"
        size="1.25rem"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      />
      <ChevronDown
        aria-hidden="true"
        size="1.25rem"
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
      />
    </div>
  );
}

/** Says what was asked for when nothing matches it. */
function nothingMatches(state: ListState, category: ListCategory | undefined): string {
  const q = state.q.trim();
  const filters = filterCount(state);
  const where = category ? ` under ${category.name}` : "";
  if (q && filters > 0) {
    return `Nothing${where} matches “${q}” with ${filters === 1 ? "that filter" : "those filters"}.`;
  }
  if (q) {
    return `Nothing${where} matches “${q}”. Search looks at titles, ingredients, tags and who a recipe is from.`;
  }
  return `No recipe${where} has ${filters === 1 ? "that filter" : "all of those filters"}.`;
}

/**
 * The recipe list: the app's home. Search sits in the header, categories are
 * the dividers over the stack, and tags, tools and foods narrow it from the
 * filter sheet. The screen is given its data; it fetches nothing itself.
 */
export function RecipeListScreen({
  state,
  onChange,
  categories,
  tags,
  tools,
  foods,
  recipes,
  libraryCount,
  imports = [],
  offline = false,
  links,
  recipeLink,
  thumbnailFor,
  onReviewImport,
  onRetryImport,
  onRemoveImport,
}: RecipeListScreenProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loading = recipes === null;
  const firstRun = libraryCount === 0;
  const narrowed = isNarrowed(state);
  const filters = filterCount(state);

  const category = categories.find((c) => c.key === state.category);
  const stockBySlug = new Map(categories.map((c) => [c.key, c.stock]));
  const tabs: DividerTab[] = [
    { id: ALL, label: "All", stock: "plain" },
    ...categories.map((c) => ({ id: c.key, label: c.name, stock: c.stock })),
  ];
  const selectedTab = category ? category.key : ALL;

  const chips = [
    ...state.tags.map((key) => ({ kind: "tags" as const, key, from: tags })),
    ...state.tools.map((key) => ({ kind: "tools" as const, key, from: tools })),
    ...state.foods.map((key) => ({ kind: "foods" as const, key, from: foods })),
  ].map((chip) => ({
    ...chip,
    name: chip.from.find((option) => option.key === chip.key)?.name ?? chip.key,
  }));

  let count = "";
  if (!loading && !firstRun) {
    count =
      narrowed && libraryCount !== null && !category
        ? `${recipes.length} of ${libraryCount}`
        : plural(recipes.length);
  }

  const showImports = imports.length > 0 && !narrowed && !offline;

  return (
    <>
      {firstRun ? null : (
        <div className="shell-band bg-shell px-4 pb-3 md:bg-transparent md:px-6 md:pt-6 md:pb-0">
          <SearchField value={state.q} onSearch={(q) => onChange({ ...state, q })} />
        </div>
      )}

      {firstRun ? null : (
        <DividerTabs
          label="Categories"
          tabs={tabs}
          selectedId={selectedTab}
          onSelect={(id) => onChange({ ...state, category: id === ALL ? null : id })}
          panelId={PANEL}
        />
      )}

      <Page
        id={PANEL}
        labelledBy={firstRun ? undefined : `divider-${selectedTab}`}
        joined={!firstRun}
        title={category ? category.name : firstRun ? "Recipes" : "All recipes"}
        aside={loading ? "Loading" : count}
      >
        <p className="sr-only" role="status">
          {loading ? "Loading recipes" : firstRun ? "" : `${plural(recipes.length)} listed`}
        </p>

        {offline ? (
          <Notice icon={<CloudOff aria-hidden="true" size="1.125rem" className="flex-none" />}>
            You are offline. These are the recipes saved on this device.
          </Notice>
        ) : null}

        {firstRun ? null : (
          <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-2.5">
            <Button
              variant="quiet"
              className="flex-none"
              icon={<ListFilter aria-hidden="true" size="1.25rem" />}
              aria-haspopup="dialog"
              onClick={() => setFiltersOpen(true)}
            >
              {filters > 0 ? `Filters: ${filters}` : "Filter"}
            </Button>
            <SortSelect state={state} onChange={(sort) => onChange({ ...state, sort })} />
          </div>
        )}

        {chips.length > 0 ? (
          <ul
            aria-label="Filters in use"
            className="flex flex-wrap gap-2 border-b border-rule px-4 py-2.5"
          >
            {chips.map((chip) => (
              <li key={`${chip.kind}-${chip.key}`}>
                <RemovableChip
                  label={chip.name}
                  onRemove={() =>
                    onChange({
                      ...state,
                      [chip.kind]: state[chip.kind].filter((k) => k !== chip.key),
                    })
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}

        {showImports ? (
          <ul aria-label="Imports" className="bg-surface-sunk">
            {imports.map((job) => (
              <ImportRow
                key={job.id}
                job={job}
                onReview={onReviewImport}
                onRetry={onRetryImport}
                onRemove={onRemoveImport}
              />
            ))}
          </ul>
        ) : null}

        {loading ? (
          <ul aria-hidden="true">
            {SKELETON_ROWS.map((row) => (
              <RecipeRowSkeleton key={row} />
            ))}
          </ul>
        ) : firstRun ? (
          <EmptyState
            title="No recipes yet"
            actions={
              offline ? null : (
                <>
                  <Link
                    to={links.newRecipe}
                    className={`${LINK_BUTTON} bg-red-fill text-on-red hover:bg-red-fill-press`}
                  >
                    <Plus aria-hidden="true" size="1.25rem" />
                    Type a recipe
                  </Link>
                  <Link
                    to={links.importLink}
                    className={`${LINK_BUTTON} border border-rule-strong bg-surface text-ink hover:bg-surface-sunk`}
                  >
                    <Link2 aria-hidden="true" size="1.25rem" />
                    Import from a link
                  </Link>
                </>
              )
            }
          >
            Your recipes will be listed here, most recently changed first. Type one in from a card,
            or bring one in from a web page.
          </EmptyState>
        ) : recipes.length === 0 ? (
          state.q.trim() === "" && filters === 0 && category ? (
            <EmptyState title={`Nothing is filed under ${category.name} yet`}>
              A recipe appears here once it is given this category.
            </EmptyState>
          ) : (
            <EmptyState
              title="No recipes match"
              actions={
                <Button variant="quiet" onClick={() => onChange(EMPTY_LIST_STATE)}>
                  Clear search and filters
                </Button>
              }
            >
              {nothingMatches(state, category)}
            </EmptyState>
          )
        ) : (
          <ul aria-label="Recipes">
            {recipes.map((recipe) => (
              <RecipeRow
                key={recipe.id}
                recipe={recipe}
                stock={stockBySlug.get(recipe.categories[0]?.slug ?? "") ?? "plain"}
                link={recipeLink?.(recipe)}
                thumbnailUrl={thumbnailFor?.(recipe)}
                showCategory={!category}
              />
            ))}
          </ul>
        )}
      </Page>

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        state={state}
        onChange={onChange}
        tags={tags}
        tools={tools}
        foods={foods}
        resultCount={loading ? null : recipes.length}
      />
    </>
  );
}
