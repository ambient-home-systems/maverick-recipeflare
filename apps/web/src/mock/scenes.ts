import { type ListSearch, parseListSearch, toListSearch } from "../pages/recipes/listState";

/**
 * The states of the recipe list that sample data alone cannot reach. This file
 * is loaded with the router, so it must not import fixtures.
 */
export const LIST_SCENES = ["library", "imports", "loading", "first-run", "offline"] as const;
export type ListScene = (typeof LIST_SCENES)[number];

export const SCENE_LABELS: Record<ListScene, string> = {
  library: "Library",
  imports: "Imports",
  loading: "Loading",
  "first-run": "First run",
  offline: "Offline",
};

export type MockListSearch = ListSearch & { scene?: ListScene };

export function parseScene(value: unknown): ListScene {
  return (LIST_SCENES as readonly unknown[]).includes(value) ? (value as ListScene) : "library";
}

/** Tidies the address of the mock list: the list's own state, and the scene if it is not the default. */
export function validateMockListSearch(raw: Record<string, unknown>): MockListSearch {
  const scene = parseScene(raw.scene);
  return { ...toListSearch(parseListSearch(raw)), ...(scene === "library" ? {} : { scene }) };
}

export function validateMockAddSearch(raw: Record<string, unknown>): { scene?: "offline" } {
  return raw.scene === "offline" ? { scene: "offline" } : {};
}
