import { type RecipeSort, slugify } from "@recipeflare/schema";
import { getRouteApi } from "@tanstack/react-router";
import { useMemo } from "react";
import { assetUrl } from "../api/assets";
import {
  type RecipeListRequest,
  useChangeImport,
  useFoods,
  useImports,
  useOrganizers,
  useRecipeList,
} from "../api/queries";
import { useSignedOut } from "../api/session";
import { useOnline } from "../api/useOnline";
import type { Stock } from "../ui/stock";
import type { ListOption } from "./recipes/FilterSheet";
import { effectiveSort, type ListState, parseListSearch, toListSearch } from "./recipes/listState";
import { type ListCategory, RecipeListScreen } from "./recipes/RecipeListScreen";

const route = getRouteApi("/");

/** Most used first, then by name: the order the filter sheet offers its choices in. */
const byUse = (
  a: { recipeCount: number; name: string },
  b: { recipeCount: number; name: string },
) => b.recipeCount - a.recipeCount || a.name.localeCompare(b.name);

/**
 * The recipe list on the household's own recipes. This is the container: it
 * reads what is asked for from the page address, fetches it, and hands the
 * screen its data. The screen itself fetches nothing.
 */
export function RecipesPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const online = useOnline();
  const signedOut = useSignedOut();
  const state = parseListSearch(search);

  const organizers = useOrganizers();
  const foods = useFoods();
  const imports = useImports();
  const changeImport = useChangeImport();

  const lists = useMemo(() => {
    const entries = organizers.data ?? [];
    const options = (kind: string): ListOption[] =>
      entries
        .filter((entry) => entry.kind === kind)
        .sort(byUse)
        .map((entry) => ({ key: entry.slug, name: entry.name }));
    const categories: ListCategory[] = entries
      .filter((entry) => entry.kind === "category")
      .map((entry) => ({
        key: entry.slug,
        name: entry.name,
        stock: (entry.color ?? "plain") satisfies Stock,
      }));
    // A food is named in the address by its name as a slug, which reads better than its ID.
    const foodEntries = [...(foods.data ?? [])].sort(byUse);
    return {
      categories,
      tags: options("tag"),
      tools: options("tool"),
      foods: foodEntries.map((food) => ({ key: slugify(food.name), name: food.name })),
      foodIdBySlug: new Map(foodEntries.map((food) => [slugify(food.name), food.id])),
    };
  }, [organizers.data, foods.data]);

  // The API takes foods by ID. A food in the address that the household no
  // longer has is sent as it stands, so it matches nothing, as it should.
  const request: RecipeListRequest = {
    q: state.q,
    category: state.category,
    tags: state.tags,
    tools: state.tools,
    foodIds: state.foods.map((slug) => lists.foodIdBySlug.get(slug) ?? slug),
    sort: effectiveSort(state) satisfies RecipeSort,
  };
  // With a food filter on, wait for the foods, so the first request is the right one.
  const ready = state.foods.length === 0 || foods.data !== undefined || foods.isError;
  const list = useRecipeList(request, ready);

  // The whole library's size, which the list's first page also reports.
  const first = list.data?.pages[0];
  const recipes = list.data ? list.data.pages.flatMap((page) => page.items) : null;

  const change = (next: ListState) => navigate({ search: toListSearch(next), replace: true });

  return (
    <RecipeListScreen
      state={state}
      onChange={change}
      categories={lists.categories}
      tags={lists.tags}
      tools={lists.tools}
      foods={lists.foods}
      recipes={recipes}
      total={first?.total}
      libraryCount={first ? first.libraryTotal : null}
      hasMore={list.hasNextPage}
      loadingMore={list.isFetchingNextPage}
      onLoadMore={() => void list.fetchNextPage()}
      failed={list.isError && !signedOut}
      onRetry={() => void list.refetch()}
      signedOut={signedOut}
      offline={!online}
      imports={imports.data ?? []}
      onReviewImport={(job) => void navigate({ to: "/imports/$id/review", params: { id: job.id } })}
      onRetryImport={(job) => changeImport.mutate({ id: job.id, action: "retry" })}
      onRemoveImport={(job) => changeImport.mutate({ id: job.id, action: "remove" })}
      links={{ newRecipe: "/recipes/new", importLink: "/add" }}
      recipeLink={(recipe) => ({ to: "/recipes/$slug", params: { slug: recipe.slug } })}
      thumbnailFor={(recipe) => (recipe.cover ? assetUrl(recipe.cover, "thumb") : undefined)}
    />
  );
}
