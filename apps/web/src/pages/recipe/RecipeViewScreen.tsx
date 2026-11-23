import {
  type Asset,
  formatIngredient,
  type Ingredient,
  ingredientAmount,
  isScalable,
  type Recipe,
} from "@recipeflare/schema";
import { Link } from "@tanstack/react-router";
import { ChefHat, ChevronDown, CloudOff, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/Button";
import { LinkChip } from "../../ui/Chip";
import { type DividerLink, DividerLinks } from "../../ui/DividerTabs";
import { Mark } from "../../ui/Field";
import { EmptyState, Notice } from "../../ui/Notice";
import { Page } from "../../ui/Page";
import { SectionHead } from "../../ui/SectionHead";
import { Sheet } from "../../ui/Sheet";
import type { Stock } from "../../ui/stock";
import { PhotoViewer, type ViewerPhoto } from "./PhotoViewer";
import {
  isTitleOnly,
  linkHost,
  notScaledLabel,
  nutritionFacts,
  recipeFacts,
  SCALE_DONE,
  type Scale,
} from "./recipeFacts";
import { ScaleControl } from "./ScaleControl";

type RecipeViewScreenProps = {
  /** The recipe. Null while it loads, or when `problem` says why there is none. */
  recipe: Recipe | null;
  /** Why there is no recipe to show: the address leads nowhere, or loading failed. */
  problem?: "missing" | "error";
  onRetry?: () => void;
  scale: Scale;
  onScale: (scale: Scale) => void;
  /** The divider colour of a category, by its slug. */
  stockFor: (categorySlug: string) => Stock;
  /** The address of a photo at thumbnail or full size. */
  photoUrl: (asset: Asset, size: "thumb" | "full") => string | undefined;
  /** True when the device has no connection and this is the copy saved on it. */
  offline?: boolean;
  /** Where the list lives. The mock harness points it at the mock list. */
  listTo: "/mock/list";
  onCook?: (recipe: Recipe) => void;
  onEdit?: (recipe: Recipe) => void;
  /** Called once the cook has confirmed. */
  onDelete?: (recipe: Recipe) => void;
};

const ALL: DividerLink = { key: "all", label: "All recipes", stock: "plain" };
const SKELETON_LINES = ["a", "b", "c", "d", "e", "f", "g"];

/** A title inside a part: "For the gravy". */
function SubHead({ title }: { title: string }) {
  return <h3 className="border-t border-rule px-4 pt-3 pb-1 text-base font-bold">{title}</h3>;
}

/** An ingredient line with its amount set heavier, so a glance down the list finds the numbers. */
function IngredientText({ item, scale }: { item: Ingredient; scale: number }) {
  const text = formatIngredient(item, { scale });
  const amount = ingredientAmount(item, { scale });
  return (
    <span>
      {amount ? <span className="font-semibold">{amount}</span> : null}
      {text.slice(amount.length)}
    </span>
  );
}

type Viewing = { group: "photos" | "original"; index: number } | null;

/**
 * One recipe, for reading: what it needs, what to do, and where it came from.
 * The screen is given the recipe; it fetches nothing itself.
 */
export function RecipeViewScreen({
  recipe,
  problem,
  onRetry,
  scale,
  onScale,
  stockFor,
  photoUrl,
  offline = false,
  listTo,
  onCook,
  onEdit,
  onDelete,
}: RecipeViewScreenProps) {
  const [viewing, setViewing] = useState<Viewing>(null);
  const [confirming, setConfirming] = useState(false);

  if (!recipe) {
    return (
      <>
        <DividerLinks label="Back to" to={listTo} links={[ALL]} />
        {problem === "missing" ? (
          <Page joined title="Not found">
            <EmptyState
              title="This recipe is not here"
              actions={
                <Link
                  to={listTo}
                  className="transition-rf inline-flex min-h-touch items-center rounded-md border border-rule-strong bg-surface px-5 font-semibold text-ink no-underline hover:bg-surface-sunk"
                >
                  All recipes
                </Link>
              }
            >
              It may have been renamed or deleted. Its address changes when its title does.
            </EmptyState>
          </Page>
        ) : problem === "error" ? (
          <Page joined title="Recipe">
            <Notice problem>The recipe could not be loaded.</Notice>
            <div className="px-4 py-6">
              <p className="max-w-[38ch]">
                Check the connection and try again. Your recipes are not affected.
              </p>
              <Button variant="quiet" className="mt-5" onClick={onRetry}>
                Try again
              </Button>
            </div>
          </Page>
        ) : (
          <Page joined title="Loading">
            <p className="sr-only" role="status">
              Loading the recipe
            </p>
            {/* The page's own shape in outline, so the recipe does not jump as it arrives. */}
            <div aria-hidden="true" data-testid="recipe-skeleton">
              <div className="grid gap-2 px-4 py-4">
                <span className="skeleton h-4 w-4/5" />
                <span className="skeleton h-4 w-3/5" />
              </div>
              <div className="flex overflow-hidden">
                {["a", "b", "c"].map((cell) => (
                  <div
                    key={cell}
                    className="-mr-px grid flex-1 gap-2 border-t border-r border-rule px-4 py-2.5"
                  >
                    <span className="skeleton h-3 w-10" />
                    <span className="skeleton h-4 w-16" />
                  </div>
                ))}
              </div>
              <div className="border-t border-rule bg-surface-sunk px-4 py-3.5">
                <span className="skeleton block h-4 w-28" />
              </div>
              {SKELETON_LINES.map((line, index) => (
                <div key={line} className="border-t border-rule px-4 py-3">
                  <span
                    className={`skeleton block h-4 ${index % 3 === 0 ? "w-2/5" : index % 3 === 1 ? "w-3/5" : "w-1/2"}`}
                  />
                </div>
              ))}
            </div>
          </Page>
        )}
      </>
    );
  }

  const dividers: DividerLink[] = [
    ALL,
    ...recipe.categories.map((category) => ({
      key: category.id,
      label: category.name,
      stock: stockFor(category.slug),
      category: category.slug,
    })),
  ];

  const byPosition = [...recipe.assets].sort((a, b) => a.position - b.position);
  const toViewer = (assets: Asset[], what: string): ViewerPhoto[] =>
    assets.flatMap((asset, index) => {
      const url = photoUrl(asset, "full");
      const alt = assets.length > 1 ? `${what}, ${index + 1} of ${assets.length}` : what;
      return url ? [{ id: asset.id, url, alt }] : [];
    });
  const photoAssets = byPosition.filter((a) => a.role === "cover" || a.role === "photo");
  const originalAssets = byPosition.filter((a) => a.role === "original");
  const groups = {
    photos: { title: "Photos", photos: toViewer(photoAssets, `Photo of ${recipe.title}`) },
    original: {
      title: "Original card",
      photos: toViewer(originalAssets, `The original card for ${recipe.title}`),
    },
  };
  const thumbs = [
    {
      group: "photos" as const,
      asset: photoAssets[0],
      name: "Photos",
      detail: photoAssets.length === 1 ? "1 photo" : `${photoAssets.length} photos`,
    },
    {
      group: "original" as const,
      asset: originalAssets[0],
      name: "Original card",
      detail: originalAssets.length === 1 ? "1 photo" : `${originalAssets.length} photos`,
    },
  ].flatMap((thumb) => {
    const url = thumb.asset ? photoUrl(thumb.asset, "thumb") : undefined;
    return url ? [{ ...thumb, url }] : [];
  });

  const facts = recipeFacts(recipe, scale);
  const nutrition = nutritionFacts(recipe.nutrition);
  const host = linkHost(recipe.sourceUrl);
  const hasIngredients = recipe.ingredientSections.some((section) => section.items.length > 0);
  const hasSteps = recipe.stepSections.some((section) => section.steps.length > 0);
  const scaled = scale !== 1;
  const unscaled = recipe.ingredientSections
    .flatMap((section) => section.items)
    .filter((item) => !isScalable(item)).length;
  const canCook = hasIngredients || hasSteps;
  const titleOnly = isTitleOnly(recipe);
  const open = viewing ? groups[viewing.group] : null;

  return (
    <>
      <DividerLinks label="Filed under" to={listTo} links={dividers} />
      <Page joined title={recipe.title}>
        {offline ? (
          <Notice icon={<CloudOff aria-hidden="true" size="1.125rem" className="flex-none" />}>
            You are offline. This is the copy saved on this device; editing and deleting need a
            connection.
          </Notice>
        ) : null}

        {titleOnly ? (
          <EmptyState title="Only a title so far">
            The ingredients and steps can be added when the card is to hand. Edit opens the recipe
            for that.
          </EmptyState>
        ) : null}

        {recipe.description || recipe.sourceName || host || thumbs.length > 0 ? (
          <div className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_auto] md:gap-6">
            <div className="min-w-0">
              {recipe.description ? <p className="max-w-[60ch]">{recipe.description}</p> : null}
              {recipe.sourceName || host ? (
                <p
                  className={`flex flex-wrap items-center gap-x-2 ${recipe.description ? "mt-2" : ""}`}
                >
                  {recipe.sourceName ? (
                    <span>
                      From <span className="font-semibold">{recipe.sourceName}</span>
                    </span>
                  ) : null}
                  {host && recipe.sourceUrl ? (
                    <a
                      href={recipe.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-touch items-center gap-1.5 font-semibold"
                    >
                      {host}
                      <ExternalLink aria-hidden="true" size="1rem" />
                      <span className="sr-only">(opens the original page)</span>
                    </a>
                  ) : null}
                </p>
              ) : null}
            </div>
            {thumbs.length > 0 ? (
              <ul className="flex flex-wrap gap-x-5 gap-y-3 md:flex-nowrap md:gap-4">
                {thumbs.map((thumb) => (
                  <li key={thumb.group}>
                    <button
                      type="button"
                      onClick={() => setViewing({ group: thumb.group, index: 0 })}
                      className="group flex min-h-touch items-center gap-3 rounded-sm text-left md:block"
                    >
                      <img
                        src={thumb.url}
                        alt=""
                        width={96}
                        height={96}
                        className="transition-rf size-16 flex-none rounded-sm border border-rule bg-skeleton object-cover group-hover:border-rule-strong md:size-24"
                      />
                      <span className="block md:mt-1">
                        <span className="block text-sm font-semibold">{thumb.name}</span>
                        <span className="block text-sm">{thumb.detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {facts.length > 0 ? (
          <dl className="flex flex-wrap overflow-hidden" aria-label="At a glance">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="-mr-px flex-1 basis-[6.5rem] border-t border-r border-rule px-4 py-2"
              >
                <dt className="text-sm">{fact.label}</dt>
                {/* A number stays with its unit: "2 hr" and "30 min" may part, "30" and "min" may not. */}
                <dd className="text-lg font-semibold leading-tight">
                  {fact.value.replace(/(\d) (hr|min)\b/g, "$1\u00a0$2")}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {/* On a wide card, such as a tablet on its side, the ingredients stay beside the steps. */}
        <div className="@container">
          <div
            className={
              hasIngredients && hasSteps
                ? "@[44rem]:grid @[44rem]:grid-cols-[23rem_minmax(0,1fr)]"
                : undefined
            }
          >
            {hasIngredients ? (
              <section
                aria-labelledby="ingredients-heading"
                className="@[44rem]:border-r @[44rem]:border-rule"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-rule bg-surface-sunk px-4 py-2">
                  <h2 id="ingredients-heading" className="text-lg font-bold">
                    Ingredients
                  </h2>
                  <ScaleControl scale={scale} onScale={onScale} />
                </div>
                {scaled ? (
                  <p className="border-t border-rule px-4 py-2 text-sm" role="status">
                    <span className="font-semibold">{SCALE_DONE[scale]}.</span>{" "}
                    {unscaled > 0
                      ? `${unscaled} ${unscaled === 1 ? "line is" : "lines are"} shown as written and ${unscaled === 1 ? "was" : "were"} not changed; work ${unscaled === 1 ? "that one" : "those"} out yourself. `
                      : ""}
                    Amounts in the steps are not changed.
                  </p>
                ) : null}
                {recipe.ingredientSections.map((section, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: sections have no ID and do not reorder here
                  <div key={index}>
                    {section.title ? <SubHead title={section.title} /> : null}
                    <ul>
                      {section.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-baseline gap-x-2 border-t border-rule px-4 py-2"
                        >
                          <IngredientText item={item} scale={scale} />
                          {scaled && !isScalable(item) ? (
                            <Mark>{notScaledLabel(scale)}</Mark>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null}

            {hasSteps ? (
              <section aria-labelledby="steps-heading">
                {/* Beside the ingredients, the band is as tall as theirs, which holds the scale switch. */}
                <div className="border-t border-rule bg-surface-sunk px-4 py-2 @[44rem]:flex @[44rem]:min-h-[4.375rem] @[44rem]:items-center">
                  <h2 id="steps-heading" className="text-lg font-bold">
                    Steps
                  </h2>
                </div>
                {recipe.stepSections.map((section, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: sections have no ID and do not reorder here
                  <div key={index}>
                    {section.title ? <SubHead title={section.title} /> : null}
                    <ol>
                      {section.steps.map((step, number) => (
                        <li key={step.id} className="flex gap-3 border-t border-rule px-4 py-3">
                          <span
                            aria-hidden="true"
                            className="w-6 flex-none text-lg font-bold leading-snug"
                          >
                            {number + 1}
                          </span>
                          <span className="sr-only">Step {number + 1}.</span>
                          <p className="min-w-0 max-w-[62ch] leading-normal">{step.text}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        </div>

        {recipe.notes.length > 0 ? (
          <section aria-label="Notes">
            <SectionHead title="Notes" />
            {recipe.notes.map((note) => (
              <div key={note.id} className="border-t border-rule px-4 py-3">
                {note.title ? <h3 className="font-semibold">{note.title}</h3> : null}
                <p className="max-w-[62ch]">{note.text}</p>
              </div>
            ))}
          </section>
        ) : null}

        {nutrition.length > 0 ? (
          <details className="group border-t border-rule">
            <summary className="transition-rf flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 bg-surface-sunk px-4 text-lg font-bold hover:bg-surface [&::-webkit-details-marker]:hidden">
              Nutrition
              <ChevronDown
                aria-hidden="true"
                size="1.25rem"
                className="transition-rf group-open:rotate-180"
              />
            </summary>
            <dl>
              {nutrition.map((fact) => (
                <div
                  key={fact.label}
                  className="flex items-baseline justify-between gap-4 border-t border-rule px-4 py-2"
                >
                  <dt>{fact.label}</dt>
                  <dd className="font-semibold">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}

        {recipe.tags.length > 0 || recipe.tools.length > 0 ? (
          <div className="grid gap-3 border-t border-rule px-4 py-4">
            {recipe.tags.length > 0 ? (
              <div>
                <h2 className="mb-1.5 text-sm font-semibold">Tags</h2>
                <ul className="flex flex-wrap gap-2">
                  {recipe.tags.map((tag) => (
                    <li key={tag.id}>
                      <LinkChip label={tag.name} to={listTo} search={{ tags: tag.slug }} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {recipe.tools.length > 0 ? (
              <div>
                <h2 className="mb-1.5 text-sm font-semibold">Tools</h2>
                <ul className="flex flex-wrap gap-2">
                  {recipe.tools.map((tool) => (
                    <li key={tool.id}>
                      <LinkChip label={tool.name} to={listTo} search={{ tools: tool.slug }} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="border-t border-rule px-4 py-4">
          <Button
            variant="quiet"
            icon={<Trash2 aria-hidden="true" size="1.25rem" />}
            disabled={offline}
            onClick={() => setConfirming(true)}
          >
            Delete recipe
          </Button>
        </div>

        {/* The screen's main actions stay within reach of a thumb, above the navigation. */}
        {/* It sticks only on a screen tall enough to spare the room: not on a phone held sideways, nor with very large text. */}
        <div className="bottom-[var(--rf-nav-height)] z-[5] flex flex-wrap gap-2 border-t border-rule-strong bg-surface px-4 py-2.5 [@media(min-height:36rem)]:sticky">
          {canCook ? (
            <Button
              className="flex-1 md:flex-none md:px-10"
              icon={<ChefHat aria-hidden="true" size="1.25rem" />}
              onClick={() => onCook?.(recipe)}
            >
              Cook
            </Button>
          ) : null}
          <Button
            // With nothing to cook from, Edit is what the screen is for.
            variant={canCook ? "quiet" : "primary"}
            className={canCook ? "" : "flex-1 md:flex-none md:px-10"}
            icon={<Pencil aria-hidden="true" size="1.25rem" />}
            disabled={offline}
            onClick={() => onEdit?.(recipe)}
          >
            Edit
          </Button>
        </div>
      </Page>

      <PhotoViewer
        title={open?.title ?? ""}
        photos={open?.photos ?? []}
        index={viewing?.index ?? null}
        onIndex={(index) => setViewing((now) => (now ? { ...now, index } : now))}
        onClose={() => setViewing(null)}
      />

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this recipe?"
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              icon={<Trash2 aria-hidden="true" size="1.25rem" />}
              onClick={() => {
                setConfirming(false);
                onDelete?.(recipe);
              }}
            >
              Delete recipe
            </Button>
          </>
        }
      >
        <p className="px-4 py-4">
          <span className="font-semibold">{recipe.title}</span>
          {recipe.assets.length > 0 ? " and its photos" : ""} will be deleted for everyone in the
          household. This cannot be undone.
        </p>
      </Sheet>
    </>
  );
}
