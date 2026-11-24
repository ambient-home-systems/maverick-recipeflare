import { parseScale } from "../pages/recipe/recipeFacts";
import { type ListSearch, parseListSearch, toListSearch } from "../pages/recipes/listState";

/**
 * The states of the recipe list that sample data alone cannot reach. This file
 * is loaded with the router, so it must not import fixtures.
 */
export const LIST_SCENES = [
  "library",
  "imports",
  "cards",
  "loading",
  "first-run",
  "offline",
] as const;
export type ListScene = (typeof LIST_SCENES)[number];

export const SCENE_LABELS: Record<ListScene, string> = {
  library: "Library",
  imports: "Imports",
  cards: "Cards coming in",
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

/** The states of the recipe view that a fixture recipe alone cannot reach. */
export const RECIPE_SCENES = ["view", "loading", "offline", "error"] as const;
export type RecipeScene = (typeof RECIPE_SCENES)[number];

export const RECIPE_SCENE_LABELS: Record<RecipeScene, string> = {
  view: "Recipe",
  loading: "Loading",
  offline: "Offline",
  error: "Could not load",
};

export type MockRecipeSearch = { scale?: 0.5 | 2 | 3; scene?: Exclude<RecipeScene, "view"> };

/** Tidies the address of a mock recipe: the scale, and the scene, when they are not the defaults. */
export function validateMockRecipeSearch(raw: Record<string, unknown>): MockRecipeSearch {
  const scale = parseScale(raw.scale);
  const scene = (RECIPE_SCENES as readonly unknown[]).includes(raw.scene)
    ? (raw.scene as RecipeScene)
    : "view";
  return {
    ...(scale === 1 ? {} : { scale }),
    ...(scene === "view" ? {} : { scene }),
  };
}

/** States of the editor that cannot be reached by typing alone, or are slow to reach. */
export const EDITOR_SCENES = ["editing", "problems", "leaving", "conflict"] as const;
export type EditorScene = (typeof EDITOR_SCENES)[number];
export const EDITOR_SCENE_LABELS: Record<EditorScene, string> = {
  editing: "Editing",
  problems: "Problems",
  leaving: "Leaving",
  conflict: "Changed elsewhere",
};

export function validateMockEditorSearch(raw: Record<string, unknown>): {
  scene?: Exclude<EditorScene, "editing">;
} {
  const scene = (EDITOR_SCENES as readonly unknown[]).includes(raw.scene)
    ? (raw.scene as EditorScene)
    : "editing";
  return scene === "editing" ? {} : { scene };
}

export const REVIEW_SCENES = ["link", "duplicate", "pasted", "foreign", "card"] as const;
export type ReviewScene = (typeof REVIEW_SCENES)[number];
export const REVIEW_SCENE_LABELS: Record<ReviewScene, string> = {
  link: "From a link",
  duplicate: "Link already saved",
  pasted: "From pasted text",
  foreign: "In another language",
  card: "From a card (Phase 2)",
};

export function validateMockReviewSearch(raw: Record<string, unknown>): {
  scene?: Exclude<ReviewScene, "link">;
} {
  const scene = (REVIEW_SCENES as readonly unknown[]).includes(raw.scene)
    ? (raw.scene as ReviewScene)
    : "link";
  return scene === "link" ? {} : { scene };
}

/** States of cook mode that depend on the device and the connection, not on the recipe. */
export const COOK_SCENES = ["cooking", "offline", "signed-out", "no-screen-lock"] as const;
export type CookScene = (typeof COOK_SCENES)[number];
export const COOK_SCENE_LABELS: Record<CookScene, string> = {
  cooking: "Cooking",
  offline: "Offline",
  "signed-out": "Signed out",
  "no-screen-lock": "Screen cannot stay on",
};

export type MockCookSearch = { scale?: 0.5 | 2 | 3; scene?: Exclude<CookScene, "cooking"> };

export function validateMockCookSearch(raw: Record<string, unknown>): MockCookSearch {
  const scale = parseScale(raw.scale);
  const scene = (COOK_SCENES as readonly unknown[]).includes(raw.scene)
    ? (raw.scene as CookScene)
    : "cooking";
  return {
    ...(scale === 1 ? {} : { scale }),
    ...(scene === "cooking" ? {} : { scene }),
  };
}

export function validateMockAddSearch(raw: Record<string, unknown>): { scene?: "offline" } {
  return raw.scene === "offline" ? { scene: "offline" } : {};
}

/** The import report as its states: what the owner sees on staging, what everyone else sees, and the rest. */
export const REPORT_SCENES = ["owner", "plain", "empty", "loading", "failed", "offline"] as const;
export type ReportScene = (typeof REPORT_SCENES)[number];
export const REPORT_SCENE_LABELS: Record<ReportScene, string> = {
  owner: "With comparing on",
  plain: "Without comparing",
  empty: "Nothing saved yet",
  loading: "Loading",
  failed: "Could not load",
  offline: "Offline",
};

export function validateMockReportSearch(raw: Record<string, unknown>): {
  scene?: Exclude<ReportScene, "owner">;
} {
  const scene = (REPORT_SCENES as readonly unknown[]).includes(raw.scene)
    ? (raw.scene as ReportScene)
    : "owner";
  return scene === "owner" ? {} : { scene };
}

/** States of photographing cards that a camera alone cannot reach, or is slow to reach. */
export const CAPTURE_SCENES = [
  "sitting",
  "empty",
  "twelve",
  "sending",
  "stopped",
  "offline",
] as const;
export type CaptureScene = (typeof CAPTURE_SCENES)[number];
export const CAPTURE_SCENE_LABELS: Record<CaptureScene, string> = {
  sitting: "Mid-sitting",
  empty: "No cards yet",
  twelve: "Twelve cards",
  sending: "Sending",
  stopped: "Sending stopped",
  offline: "Offline",
};

export function validateMockCaptureSearch(raw: Record<string, unknown>): {
  scene?: Exclude<CaptureScene, "sitting">;
} {
  const scene = (CAPTURE_SCENES as readonly unknown[]).includes(raw.scene)
    ? (raw.scene as CaptureScene)
    : "sitting";
  return scene === "sitting" ? {} : { scene };
}
