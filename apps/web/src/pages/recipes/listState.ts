/**
 * What the recipe list is showing: the search text, the filters and the sort.
 * It lives in the page address, so the back button and a shared link restore it.
 */
export const LIST_SORTS = ["match", "changed", "newest", "title"] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export const SORT_LABELS: Record<ListSort, string> = {
  match: "Best match",
  changed: "Recently changed",
  newest: "Newest",
  title: "Title A to Z",
};

export type ListState = {
  /** The search text as typed. */
  q: string;
  /** The category divider that is open, by slug. Null is "All". */
  category: string | null;
  /** Tags, tools and foods, by slug. A recipe must have every one. */
  tags: string[];
  tools: string[];
  foods: string[];
  /** Null leaves the choice to the list: best match while searching, else recently changed. */
  sort: ListSort | null;
};

/** The same state as it is written in the address. Anything at its default is left out. */
export type ListSearch = {
  q?: string;
  category?: string;
  tags?: string;
  tools?: string;
  foods?: string;
  sort?: ListSort;
};

export const EMPTY_LIST_STATE: ListState = {
  q: "",
  category: null,
  tags: [],
  tools: [],
  foods: [],
  sort: null,
};

/** The router reads `q=12` as a number and `q=true` as a boolean; put the text back. */
const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value).trim()
    : "";

const list = (value: unknown): string[] => [
  ...new Set(
    text(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];

export function parseListSearch(search: Record<string, unknown>): ListState {
  const sort = text(search.sort);
  return {
    q: text(search.q).slice(0, 100),
    category: text(search.category) || null,
    tags: list(search.tags),
    tools: list(search.tools),
    foods: list(search.foods),
    sort: (LIST_SORTS as readonly string[]).includes(sort) ? (sort as ListSort) : null,
  };
}

export function toListSearch(state: ListState): ListSearch {
  const search: ListSearch = {};
  if (state.q.trim()) {
    search.q = state.q.trim();
  }
  if (state.category) {
    search.category = state.category;
  }
  if (state.tags.length > 0) {
    search.tags = state.tags.join(",");
  }
  if (state.tools.length > 0) {
    search.tools = state.tools.join(",");
  }
  if (state.foods.length > 0) {
    search.foods = state.foods.join(",");
  }
  if (state.sort && state.sort !== defaultSort(state.q)) {
    search.sort = state.sort;
  }
  return search;
}

/** Best match is the default while searching, and is only offered then. */
export function defaultSort(q: string): ListSort {
  return q.trim() ? "match" : "changed";
}

/** The sort in force, which is never "best match" without something to match. */
export function effectiveSort(state: Pick<ListState, "q" | "sort">): ListSort {
  if (!state.sort || (state.sort === "match" && !state.q.trim())) {
    return defaultSort(state.q);
  }
  return state.sort;
}

/** How many tag, tool and food filters are on. The category is a divider, not a filter. */
export function filterCount(state: ListState): number {
  return state.tags.length + state.tools.length + state.foods.length;
}

/** True when the list is narrowed by anything at all. */
export function isNarrowed(state: ListState): boolean {
  return state.q.trim() !== "" || state.category !== null || filterCount(state) > 0;
}
