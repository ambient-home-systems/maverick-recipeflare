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
  result: {
    draft: cornbreadDraft,
    issues: checkDraft(cornbreadDraft),
    sourceText: null,
    readBy: "structured-data",
  },
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
  error: { code: "blocked", message: "The site does not let apps read its pages." },
  attempts: 3,
  createdAt: "2026-11-22T08:55:00.000Z",
  updatedAt: "2026-11-22T08:56:30.000Z",
  finishedAt: "2026-11-22T08:56:30.000Z",
};

/** Text as a cook might paste it from a message: invented, with a smudge and a missing time. */
export const pastedLemonBars = `Lemon Bars (from the church cookbook)

Makes 16

For the base:
1 cup flour
1/2 cup butter, cold
1/4 cup powdered sugar

For the top:
2 eggs
1 cup sugar
3 tbsp lemon juice
2 tbsp flour
1/2 tsp baking powdr

Rub the butter into the flour and powdered sugar and press into an 8 inch pan.
Bake at 350 until pale gold, about 15 minutes.
Beat the eggs with everything else for the top and pour over the hot base.
Bake again until set. Cool before cutting.`;

const lemonBarsDraft = RecipeDraft.parse({
  title: "Lemon Bars",
  yieldQuantity: 16,
  sourceName: "the church cookbook",
  ingredientSections: [
    {
      title: "For the base",
      items: [
        { originalText: "1 cup flour" },
        { originalText: "1/2 cup butter, cold" },
        { originalText: "1/4 cup powdered sugar" },
      ],
    },
    {
      title: "For the top",
      items: [
        { originalText: "2 eggs" },
        { originalText: "1 cup sugar" },
        { originalText: "3 tbsp lemon juice" },
        { originalText: "2 tbsp flour" },
        { originalText: "1/2 tsp baking powder" },
      ],
    },
  ],
  stepSections: [
    {
      steps: [
        {
          text: "Rub the butter into the flour and powdered sugar and press into an 8 inch pan.",
        },
        { text: "Bake at 350 until pale gold, about 15 minutes." },
        { text: "Beat the eggs with everything else for the top and pour over the hot base." },
        { text: "Bake again until set. Cool before cutting." },
      ],
    },
  ],
  doubts: [
    {
      where: "ingredient:7",
      why: 'Has a word that is not in the text: "powder".',
    },
    { where: "step:3", why: "The text does not say how long to bake the second time." },
  ],
});

/** Made by a model from pasted text, and waiting for a person. Two things are in doubt. */
export const importPastedText: ImportJob = {
  ...base,
  kind: "text",
  id: fixtureId(IMPORT_JOB_GROUP, 4),
  status: "needs_review",
  stage: null,
  sourceUrl: null,
  result: {
    draft: lemonBarsDraft,
    issues: checkDraft(lemonBarsDraft),
    sourceText: pastedLemonBars,
    readBy: "ai",
  },
  attempts: 1,
  createdAt: "2026-11-23T10:02:00.000Z",
  updatedAt: "2026-11-23T10:02:40.000Z",
  finishedAt: "2026-11-23T10:02:40.000Z",
};

/** Newest first, as the list shows them. */
export const fixtureImportJobs: ImportJob[] = [importRunning, importNeedsReview, importFailed];
