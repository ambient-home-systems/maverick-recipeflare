import type { ImportReport, ImportRun } from "../api";
import { checkDraft, RecipeDraft } from "../draft";
import type { ImportJob } from "../import-job";
import type { ImportReview, ReviewCount } from "../review";
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
Zest of 1 lemon

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
        // The rules cannot read this one; a model did, and each part is in the line.
        { originalText: "Zest of 1 lemon", quantity: 1, foodName: "lemon", note: "Zest of" },
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
  // A model's guesses among the household's own. Review offers them; none is chosen.
  suggestedCategories: ["Dessert"],
  suggestedTags: ["Family favorite", "Holiday"],
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

/** Text in another language, as a cook might paste it from a relative's message. Invented. */
export const pastedKartoffelsuppe = `Kartoffelsuppe

500 g Kartoffeln, geschält
1 Zwiebel, fein gehackt
1,5 l Gemüsebrühe

Die Zwiebel in Butter anschwitzen. Kartoffeln und Brühe dazugeben und 20 Minuten kochen lassen.
Mit Salz und Pfeffer abschmecken.`;

const kartoffelsuppeDraft = RecipeDraft.parse({
  title: "Kartoffelsuppe",
  ingredientSections: [
    {
      title: null,
      items: [
        { originalText: "500 g Kartoffeln, geschält" },
        { originalText: "1 Zwiebel, fein gehackt" },
        { originalText: "1,5 l Gemüsebrühe" },
      ],
    },
  ],
  stepSections: [
    {
      steps: [
        {
          text: "Die Zwiebel in Butter anschwitzen. Kartoffeln und Brühe dazugeben und 20 Minuten kochen lassen.",
        },
        { text: "Mit Salz und Pfeffer abschmecken." },
      ],
    },
  ],
});

/** Written up by a model from text that is not in English. Review offers to translate it. */
export const importForeign: ImportJob = {
  ...base,
  kind: "text",
  id: fixtureId(IMPORT_JOB_GROUP, 9),
  status: "needs_review",
  stage: null,
  sourceUrl: null,
  result: {
    draft: kartoffelsuppeDraft,
    issues: checkDraft(kartoffelsuppeDraft),
    sourceText: pastedKartoffelsuppe,
    readBy: "ai",
  },
  attempts: 1,
  createdAt: "2026-11-23T10:05:00.000Z",
  updatedAt: "2026-11-23T10:05:20.000Z",
  finishedAt: "2026-11-23T10:05:20.000Z",
};

const cardBase = { ...base, kind: "photo", sourceUrl: null } as const;

/**
 * A sitting of four cards on its way in: one being read, one being written
 * up, one ready, and one whose photo could not be read. Newest first, each
 * with its place in the sitting.
 */
export const fixtureCardImports: ImportJob[] = [
  {
    ...cardBase,
    id: fixtureId(IMPORT_JOB_GROUP, 5),
    card: 4,
    status: "running",
    stage: "read",
    attempts: 1,
    createdAt: "2026-11-23T10:30:40.000Z",
    updatedAt: "2026-11-23T10:30:45.000Z",
  },
  {
    ...cardBase,
    id: fixtureId(IMPORT_JOB_GROUP, 6),
    card: 3,
    status: "running",
    stage: "build",
    attempts: 0,
    createdAt: "2026-11-23T10:30:30.000Z",
    updatedAt: "2026-11-23T10:30:50.000Z",
  },
  {
    ...cardBase,
    id: fixtureId(IMPORT_JOB_GROUP, 7),
    card: 2,
    status: "needs_review",
    stage: "build",
    result: {
      draft: lemonBarsDraft,
      issues: checkDraft(lemonBarsDraft),
      sourceText: pastedLemonBars,
      readBy: "ai",
    },
    attempts: 1,
    createdAt: "2026-11-23T10:30:20.000Z",
    updatedAt: "2026-11-23T10:31:10.000Z",
    finishedAt: "2026-11-23T10:31:10.000Z",
  },
  {
    ...cardBase,
    id: fixtureId(IMPORT_JOB_GROUP, 8),
    card: 1,
    status: "failed",
    stage: "read",
    error: { code: "unreadable", message: "Nothing could be read from the photo." },
    attempts: 1,
    createdAt: "2026-11-23T10:30:10.000Z",
    updatedAt: "2026-11-23T10:30:35.000Z",
    finishedAt: "2026-11-23T10:30:35.000Z",
  },
];

/** Newest first, as the list shows them. */
export const fixtureImportJobs: ImportJob[] = [importRunning, importNeedsReview, importFailed];

const untouched = (same: number): ReviewCount => ({
  same,
  moved: 0,
  changed: 0,
  added: 0,
  removed: 0,
});

const review = (profile: string | null, changes: Partial<ImportReview> = {}): ImportReview => ({
  profile,
  titleChanged: false,
  ingredients: untouched(8),
  steps: untouched(5),
  amounts: { changed: 0, unflagged: 0 },
  at: "2026-11-24T09:00:00.000Z",
  ...changes,
});

const compared = (number: number, profile: string, run: Partial<ImportRun> = {}): ImportRun => ({
  id: fixtureId(IMPORT_JOB_GROUP, number),
  profile,
  status: "compared",
  review: review(profile),
  error: null,
  milliseconds: 21_000,
  ...run,
});

/**
 * The import report, with one import in each state the page has to show: an
 * amount corrected without a warning, a card still being run again, a run that
 * failed, a link no model read, and an import saved before the record was
 * kept. The numbers are invented; the titles are the invented fixture recipes'.
 */
export const fixtureImportReport: ImportReport = {
  compareWith: ["standard", "gemma", "qwen"],
  cards: [
    {
      id: fixtureId(IMPORT_JOB_GROUP, 20),
      kind: "photo",
      card: 4,
      title: "Cardamom Sugar Cookies",
      slug: "cardamom-sugar-cookies",
      savedAt: "2026-11-24T09:12:00.000Z",
      profile: "standard",
      status: "completed",
      review: review("standard", {
        ingredients: { same: 7, moved: 0, changed: 1, added: 0, removed: 0 },
        amounts: { changed: 1, unflagged: 1 },
      }),
      error: null,
      milliseconds: 24_500,
      comparisons: [
        compared(21, "gemma", {
          review: review("gemma", {
            ingredients: { same: 6, moved: 0, changed: 2, added: 0, removed: 0 },
            steps: { same: 3, moved: 1, changed: 0, added: 0, removed: 1 },
          }),
          milliseconds: 11_200,
        }),
        compared(22, "qwen", { milliseconds: 96_000 }),
      ],
    },
    {
      id: fixtureId(IMPORT_JOB_GROUP, 23),
      kind: "photo",
      card: 3,
      title: "Lemony Red Lentil Soup",
      slug: "lemony-red-lentil-soup",
      savedAt: "2026-11-24T09:08:00.000Z",
      profile: "standard",
      status: "completed",
      review: review("standard"),
      error: null,
      milliseconds: 19_800,
      comparisons: [
        compared(24, "gemma", {
          review: review("gemma", {
            ingredients: { same: 7, moved: 0, changed: 1, added: 0, removed: 0 },
            steps: { same: 4, moved: 0, changed: 1, added: 0, removed: 0 },
          }),
          milliseconds: 9_400,
        }),
        compared(25, "qwen", { status: "running", review: null, milliseconds: 6_000 }),
      ],
    },
    {
      id: fixtureId(IMPORT_JOB_GROUP, 26),
      kind: "text",
      title: "Sunday Beef and Bean Chili",
      slug: "sunday-beef-and-bean-chili",
      savedAt: "2026-11-23T18:40:00.000Z",
      profile: "standard",
      status: "completed",
      review: review("standard", {
        titleChanged: true,
        ingredients: { same: 9, moved: 0, changed: 2, added: 1, removed: 0 },
        steps: { same: 4, moved: 0, changed: 1, added: 0, removed: 1 },
      }),
      error: null,
      milliseconds: 14_000,
      comparisons: [
        compared(27, "gemma", {
          status: "failed",
          review: null,
          error: { code: "ai_unavailable", message: "The model took too long to answer." },
          milliseconds: 90_000,
        }),
      ],
    },
    {
      id: fixtureId(IMPORT_JOB_GROUP, 28),
      kind: "url",
      title: "Buttermilk Pancakes",
      slug: "buttermilk-pancakes",
      savedAt: "2026-11-23T12:05:00.000Z",
      profile: null,
      status: "completed",
      review: review(null),
      error: null,
      milliseconds: 0,
      comparisons: [],
    },
    {
      id: fixtureId(IMPORT_JOB_GROUP, 29),
      kind: "photo",
      card: 1,
      title: "Cinnamon Toast",
      slug: null,
      savedAt: "2026-11-22T16:30:00.000Z",
      profile: "standard",
      status: "completed",
      review: null,
      error: null,
      milliseconds: 31_000,
      comparisons: [],
    },
  ],
};
