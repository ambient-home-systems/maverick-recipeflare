import { type RecipeSort, slugify } from "@recipeflare/schema";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useMemo } from "react";
import { assetUrl } from "../api/assets";
import { UnreachableError } from "../api/client";
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
import { listOffline, recipesOnDevice } from "./recipes/offlineList";
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

  // With no connection, or no way through to the server and nothing fetched
  // yet, the list is answered from the recipes copied to this device.
  const queryClient = useQueryClient();
  const restoring = useIsRestoring();
  const fromDevice = !online || (list.error instanceof UnreachableError && !list.data);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the request is compared by what it asks for
  const local = useMemo(() => {
    // Not before the device's copy has been read back: until then there is nothing to answer from.
    if (!fromDevice || restoring) {
      return null;
    }
    const copies = recipesOnDevice(queryClient);
    // A device with no copies has nothing to answer from, which is not the same as no recipes.
    return copies.length === 0
      ? null
      : { items: listOffline(copies, request), librarySize: copies.length };
  }, [fromDevice, restoring, queryClient, JSON.stringify(request)]);

  // The whole library's size, which the list's first page also reports.
  const first = list.data?.pages[0];
  const recipes = local
    ? local.items
    : list.data
      ? list.data.pages.flatMap((page) => page.items)
      : null;

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
      total={local ? local.items.length : first?.total}
      libraryCount={local ? local.librarySize : first ? first.libraryTotal : null}
      hasMore={!local && list.hasNextPage}
      loadingMore={list.isFetchingNextPage}
      onLoadMore={() => void list.fetchNextPage()}
      failed={
        // Waiting for a connection with nothing to show is a failure to load, said as one.
        (list.isError || (list.fetchStatus === "paused" && !list.data && !restoring)) &&
        !signedOut &&
        !local
      }
      onRetry={() => void list.refetch()}
      signedOut={signedOut}
      offline={!online || local !== null}
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
