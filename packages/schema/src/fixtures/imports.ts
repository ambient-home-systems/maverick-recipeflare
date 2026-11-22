import { checkDraft, RecipeDraft } from "../draft";
import type { ImportJob } from "../import-job";
import { fixtureId, IMPORT_JOB_GROUP } from "./lists";

/**
 * Three imports from a link, one in each state the list has to show. The
 * addresses are on example.com and the draft is invented.
 */

const base = {
  kind: "url",
  result: null,
  error: null,
  recipeId: null,
  finishedAt: null,
} as const;

const cornbreadDraft = RecipeDraft.parse({
  title: "Skillet Cornbread",
  servings: 8,
  totalTimeSeconds: 35 * 60,
  sourceName: "Example Kitchen",
  sourceUrl: "https://recipes.example.com/skillet-cornbread",
  imageUrl: "https://recipes.example.com/images/skillet-cornbread.jpg",
  // Dinner and Weeknight are the household's own; the other two are not, and are only offered.
  suggestedCategories: ["Dinner", "Bread"],
  suggestedTags: ["Weeknight", "Comfort food"],
  ingredientSections: [
    {
      items: [
        { originalText: "1 cup cornmeal", quantity: 1, unitName: "cup", foodName: "cornmeal" },
        { originalText: "1 cup flour", quantity: 1, unitName: "cup", foodName: "flour" },
        { originalText: "1 cup buttermilk", quantity: 1, unitName: "cup", foodName: "buttermilk" },
        { originalText: "a knob of butter for the pan" },
      ],
    },
  ],
});

/** Still being read. */
export const importRunning: ImportJob = {
  ...base,
  id: fixtureId(IMPORT_JOB_GROUP, 1),
  status: "running",
  stage: "fetch",
  sourceUrl: "https://baking.example.com/recipes/overnight-oat-bread",
  attempts: 1,
  createdAt: "2026-11-22T09:20:00.000Z",
  updatedAt: "2026-11-22T09:20:05.000Z",
};

/** Read, and waiting for a person. The page had no steps, which review will flag. */
export const importNeedsReview: ImportJob = {
  ...base,
  id: fixtureId(IMPORT_JOB_GROUP, 2),
  status: "needs_review",
  stage: null,
  sourceUrl: "https://recipes.example.com/skillet-cornbread",
  result: { draft: cornbreadDraft, issues: checkDraft(cornbreadDraft) },
  attempts: 1,
  createdAt: "2026-11-22T09:12:00.000Z",
  updatedAt: "2026-11-22T09:12:20.000Z",
  finishedAt: "2026-11-22T09:12:20.000Z",
};

/** Refused by the site. It can be tried again from its row. */
export const importFailed: ImportJob = {
  ...base,
  id: fixtureId(IMPORT_JOB_GROUP, 3),
  status: "failed",
  stage: null,
  sourceUrl: "https://dinner.example.com/weeknight/sheet-pan-sausages",
  error: { code: "blocked", message: "The site blocked the request." },
  attempts: 3,
  createdAt: "2026-11-22T08:55:00.000Z",
  updatedAt: "2026-11-22T08:56:30.000Z",
  finishedAt: "2026-11-22T08:56:30.000Z",
};

/** Newest first, as the list shows them. */
export const fixtureImportJobs: ImportJob[] = [importRunning, importNeedsReview, importFailed];
