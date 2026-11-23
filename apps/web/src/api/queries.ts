import {
  FoodListResponse,
  OrganizerListResponse,
  RECIPES_PER_PAGE,
  Recipe,
  RecipeListResponse,
  type RecipeSort,
} from "@recipeflare/schema";
import {
  keepPreviousData,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, api, SignedOutError } from "./client";

/**
 * The app's cache of what the API has said. A request that failed because the
 * session ran out, or because the API refused it, is not tried again: the
 * answer would be the same. One that never arrived is tried once more.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failures, error) =>
          !(error instanceof SignedOutError) && !(error instanceof ApiError) && failures < 1,
      },
    },
  });
}

/** What the list is asked for. Categories, tags and tools by slug; foods by ID. */
export type RecipeListRequest = {
  q: string;
  category: string | null;
  tags: string[];
  tools: string[];
  foodIds: string[];
  sort: RecipeSort;
};

function listPath(request: RecipeListRequest, page: number): string {
  const params = new URLSearchParams();
  if (request.q) {
    params.set("q", request.q);
  }
  if (request.category) {
    params.set("category", request.category);
  }
  if (request.tags.length > 0) {
    params.set("tags", request.tags.join(","));
  }
  if (request.tools.length > 0) {
    params.set("tools", request.tools.join(","));
  }
  if (request.foodIds.length > 0) {
    params.set("foods", request.foodIds.join(","));
  }
  params.set("sort", request.sort);
  params.set("page", String(page));
  params.set("perPage", String(RECIPES_PER_PAGE));
  return `/recipes?${params}`;
}

/**
 * The recipe list, thirty at a time. While a new search is on its way the
 * previous results stay on screen, so the list does not blink as someone types.
 */
export function useRecipeList(request: RecipeListRequest, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["recipes", "list", request],
    queryFn: ({ pageParam, signal }) =>
      api(listPath(request, pageParam), { schema: RecipeListResponse, signal }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.perPage < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Every category, tag and tool, with how many recipes use each. */
export function useOrganizers() {
  return useQuery({
    queryKey: ["organizers"],
    queryFn: ({ signal }) => api("/organizers", { schema: OrganizerListResponse, signal }),
    select: (data) => data.items,
  });
}

/** Every food, with how many recipes use each. */
export function useFoods() {
  return useQuery({
    queryKey: ["foods"],
    queryFn: ({ signal }) => api("/foods", { schema: FoodListResponse, signal }),
    select: (data) => data.items,
  });
}

/** One recipe, by its slug or its ID. */
export function useRecipe(idOrSlug: string) {
  return useQuery({
    queryKey: ["recipes", "one", idOrSlug],
    queryFn: ({ signal }) =>
      api(`/recipes/${encodeURIComponent(idOrSlug)}`, { schema: Recipe, signal }),
  });
}

/**
 * Deletes a recipe. Afterwards nothing the cache holds about recipes can be
 * trusted: the lists are fetched again, and the recipe itself is forgotten.
 */
export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recipe: { id: string; slug: string }) =>
      api(`/recipes/${recipe.id}`, { method: "DELETE" }),
    onSuccess: (_nothing, recipe) => {
      queryClient.removeQueries({ queryKey: ["recipes", "one", recipe.slug] });
      queryClient.removeQueries({ queryKey: ["recipes", "one", recipe.id] });
      // The use counts on organizers and foods have changed too.
      return queryClient.invalidateQueries();
    },
  });
}
