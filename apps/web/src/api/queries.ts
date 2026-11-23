import {
  FoodListResponse,
  ImportDetail,
  ImportJob,
  ImportListResponse,
  LabelListResponse,
  OrganizerListResponse,
  RECIPES_PER_PAGE,
  Recipe,
  RecipeListResponse,
  type RecipeSort,
  UnitListResponse,
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
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failures, error) =>
          !(error instanceof SignedOutError) && !(error instanceof ApiError) && failures < 1,
      },
    },
  });
  // Recipes and the household's lists are the device's copy for offline use,
  // so they are never dropped for being unused. A recipe that is gone is
  // dropped by the copy itself (`sync.ts`).
  client.setQueryDefaults(["recipes", "one"], { gcTime: Number.POSITIVE_INFINITY });
  client.setQueryDefaults(["lists"], { gcTime: Number.POSITIVE_INFINITY });
  return client;
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
    queryKey: ["lists", "organizers"],
    queryFn: ({ signal }) => api("/organizers", { schema: OrganizerListResponse, signal }),
    select: (data) => data.items,
  });
}

/** Every food, with how many recipes use each. */
export function useFoods() {
  return useQuery({
    queryKey: ["lists", "foods"],
    queryFn: ({ signal }) => api("/foods", { schema: FoodListResponse, signal }),
    select: (data) => data.items,
  });
}

/** Every unit, with how many recipes use each. */
export function useUnits() {
  return useQuery({
    queryKey: ["lists", "units"],
    queryFn: ({ signal }) => api("/units", { schema: UnitListResponse, signal }),
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

/** Every label, in the household's own order, with how many foods have each. */
export function useLabels() {
  return useQuery({
    queryKey: ["lists", "labels"],
    queryFn: ({ signal }) => api("/labels", { schema: LabelListResponse, signal }),
    select: (data) => data.items,
  });
}

/** A change to one of the household's lists: an entry added, changed or deleted. */
export type ListChange = {
  list: "organizers" | "foods" | "units" | "labels";
  method: "POST" | "PUT" | "DELETE";
  /** The entry changed or deleted. Left out when adding. */
  id?: string;
  body?: unknown;
};

/**
 * Changes one of the lists. A name shows on every recipe that uses it, and the
 * use counts follow recipes, so afterwards everything the cache holds is fetched again.
 */
export function useChangeList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: ListChange) =>
      api(`/${change.list}${change.id ? `/${change.id}` : ""}`, {
        method: change.method,
        body: change.body,
      }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/** How often the list asks after imports while one is still being read. */
export const IMPORT_POLL_MS = 2000;

const isWorking = (job: ImportJob) => job.status === "queued" || job.status === "running";

/**
 * The imports a person still has to wait for or deal with. While any is being
 * read the list is asked for again every two seconds, so its progress shows
 * without a reload; once none is, the asking stops.
 */
export function useImports() {
  return useQuery({
    queryKey: ["imports"],
    queryFn: ({ signal }) => api("/imports", { schema: ImportListResponse, signal }),
    select: (data) => data.items,
    refetchInterval: (query) => (query.state.data?.items.some(isWorking) ? IMPORT_POLL_MS : false),
  });
}

/** One import, with the recipe the household already has from the same link, for review. */
export function useImport(id: string) {
  return useQuery({
    queryKey: ["imports", "one", id],
    queryFn: ({ signal }) => api(`/imports/${id}`, { schema: ImportDetail, signal }),
  });
}

/** What an import starts from: a link, a page a browser sent, or text pasted in. */
export type StartImport =
  // With `page`, the cook's browser has already read the page and the server does not fetch it.
  | { kind: "url"; url: string; page?: { siteName: string | null; blocks: string[] } }
  | { kind: "text"; text: string };

/** Starts an import. The list shows it from then on. */
export function useStartImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: StartImport) =>
      api("/imports", { method: "POST", body: request, schema: ImportJob }),
    onSuccess: (job) => {
      // The row is there the moment the list opens, without waiting for a fetch.
      queryClient.setQueryData<ImportListResponse>(["imports"], (now) => ({
        items: [job, ...(now?.items ?? []).filter((item) => item.id !== job.id)],
      }));
      return queryClient.invalidateQueries({ queryKey: ["imports"] });
    },
  });
}

/** Tries a failed import again, or removes an import. Either way the imports are fetched again. */
export function useChangeImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: { id: string; action: "retry" | "remove" }) =>
      change.action === "retry"
        ? api(`/imports/${change.id}/retry`, { method: "POST", schema: ImportJob })
        : api(`/imports/${change.id}`, { method: "DELETE" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["imports"] }),
  });
}
