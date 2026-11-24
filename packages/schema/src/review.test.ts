import { describe, expect, it } from "vitest";
import { RecipeDraft } from "./draft";
import { compareWithDraft, reviewChanges, type SavedText } from "./review";

/**
 * The record of a review, held against changes counted by hand. Each test
 * says what the cook did, and the counts are what a person would write down.
 * The recipes are invented.
 */

const draft = (changes: object = {}) =>
  RecipeDraft.parse({
    title: "Lemon Bars",
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
        items: [{ originalText: "2 eggs" }, { originalText: "1 cup sugar" }],
      },
    ],
    stepSections: [
      {
        title: null,
        steps: [
          { text: "Rub the butter into the flour and press into a pan." },
          { text: "Bake until pale gold." },
          { text: "Beat the eggs with the sugar and pour over the base." },
          { text: "Bake again until set." },
        ],
      },
    ],
    ...changes,
  });

/** The recipe a cook saves: the draft's own words unless a test says otherwise. */
const saved = (lines?: string[], steps?: string[], title = "Lemon Bars"): SavedText => ({
  title,
  ingredientSections: [
    {
      items: (
        lines ?? [
          "1 cup flour",
          "1/2 cup butter, cold",
          "1/4 cup powdered sugar",
          "2 eggs",
          "1 cup sugar",
        ]
      ).map((originalText) => ({ originalText })),
    },
  ],
  stepSections: [
    {
      steps: (
        steps ?? [
          "Rub the butter into the flour and press into a pan.",
          "Bake until pale gold.",
          "Beat the eggs with the sugar and pour over the base.",
          "Bake again until set.",
        ]
      ).map((text) => ({ text })),
    },
  ],
});

const none = { moved: 0, changed: 0, added: 0, removed: 0 };

describe("a draft saved as it was read", () => {
  it("counts nothing", () => {
    const review = compareWithDraft(draft(), saved());

    expect(review).toEqual({
      titleChanged: false,
      ingredients: { same: 5, ...none },
      steps: { same: 4, ...none },
      amounts: { changed: 0, unflagged: 0 },
    });
    expect(reviewChanges(review)).toBe(0);
  });

  it("does not count spaces, or the sections the lines are in", () => {
    const review = compareWithDraft(
      draft({ title: "  Lemon   Bars " }),
      saved([
        "1 cup  flour ",
        "1/2 cup butter, cold",
        "1/4 cup powdered sugar",
        "2 eggs",
        "1 cup sugar",
      ]),
    );

    expect(reviewChanges(review)).toBe(0);
    expect(review.titleChanged).toBe(false);
  });
});

describe("what a cook changed", () => {
  it("counts a corrected word as one changed line", () => {
    // "floor" on the card's reading, put right.
    const review = compareWithDraft(
      draft({
        ingredientSections: [
          { title: null, items: [{ originalText: "1 cup floor" }, { originalText: "2 eggs" }] },
        ],
      }),
      saved(["1 cup flour", "2 eggs"]),
    );

    expect(review.ingredients).toEqual({ same: 1, moved: 0, changed: 1, added: 0, removed: 0 });
    // The figures are as they were: only the word changed.
    expect(review.amounts).toEqual({ changed: 0, unflagged: 0 });
    expect(reviewChanges(review)).toBe(1);
  });

  it("counts a line the draft missed as added, and one it invented as removed", () => {
    // The cook typed in the salt, and took out the sugar the card never had.
    const review = compareWithDraft(
      draft(),
      saved([
        "1 cup flour",
        "1/2 cup butter, cold",
        "1/4 cup powdered sugar",
        "2 eggs",
        "1 pinch salt",
        "1 tsp vanilla",
      ]),
    );

    // "1 cup sugar" and one of the new lines make a changed line; the other was added.
    expect(review.ingredients).toEqual({ same: 4, moved: 0, changed: 1, added: 1, removed: 0 });

    const fewer = compareWithDraft(draft(), saved(["1 cup flour", "2 eggs", "1 cup sugar"]));
    expect(fewer.ingredients).toEqual({ same: 3, moved: 0, changed: 0, added: 0, removed: 2 });
    expect(reviewChanges(fewer)).toBe(2);
  });

  it("counts one step split into two as a changed step and an added one", () => {
    const review = compareWithDraft(
      draft(),
      saved(undefined, [
        "Rub the butter into the flour.",
        "Press into a pan.",
        "Bake until pale gold.",
        "Beat the eggs with the sugar and pour over the base.",
        "Bake again until set.",
      ]),
    );

    expect(review.steps).toEqual({ same: 3, moved: 0, changed: 1, added: 1, removed: 0 });
    expect(reviewChanges(review)).toBe(2);
  });

  it("counts a step put in another place as moved, not as changed", () => {
    // The last step dragged to the top.
    const review = compareWithDraft(
      draft(),
      saved(undefined, [
        "Bake again until set.",
        "Rub the butter into the flour and press into a pan.",
        "Bake until pale gold.",
        "Beat the eggs with the sugar and pour over the base.",
      ]),
    );

    expect(review.steps).toEqual({ same: 3, moved: 1, changed: 0, added: 0, removed: 0 });
    expect(reviewChanges(review)).toBe(1);
  });

  it("counts a line that appears twice as often as it appears", () => {
    const twice = draft({
      ingredientSections: [
        {
          title: null,
          items: [
            { originalText: "1 tsp salt" },
            { originalText: "2 eggs" },
            { originalText: "1 tsp salt" },
          ],
        },
      ],
    });

    expect(
      compareWithDraft(twice, saved(["1 tsp salt", "2 eggs", "1 tsp salt"])).ingredients,
    ).toEqual({
      same: 3,
      ...none,
    });
    expect(compareWithDraft(twice, saved(["1 tsp salt", "2 eggs"])).ingredients).toEqual({
      same: 2,
      moved: 0,
      changed: 0,
      added: 0,
      removed: 1,
    });
  });

  it("says when the title changed, without counting it among the lines", () => {
    const review = compareWithDraft(draft(), saved(undefined, undefined, "Gran's Lemon Bars"));

    expect(review.titleChanged).toBe(true);
    expect(reviewChanges(review)).toBe(0);
  });

  it("adds up everything done to one card", () => {
    // By hand: one amount put right, one line added, one step reworded, one step removed.
    const review = compareWithDraft(
      draft(),
      saved(
        [
          "1 cup flour",
          "1/3 cup butter, cold",
          "1/4 cup powdered sugar",
          "2 eggs",
          "1 cup sugar",
          "1 lemon",
        ],
        [
          "Rub the butter into the flour and press into a pan.",
          "Bake at 350 until pale gold.",
          "Beat the eggs with the sugar and pour over the base.",
        ],
      ),
    );

    expect(review.ingredients).toEqual({ same: 4, moved: 0, changed: 1, added: 1, removed: 0 });
    expect(review.steps).toEqual({ same: 2, moved: 0, changed: 1, added: 0, removed: 1 });
    expect(reviewChanges(review)).toBe(4);
  });
});

describe("amounts that were wrong", () => {
  const misread = (doubts: { where: string; why: string }[]) =>
    compareWithDraft(
      draft({ doubts }),
      // The butter was a third of a cup, not a half.
      saved([
        "1 cup flour",
        "1/3 cup butter, cold",
        "1/4 cup powdered sugar",
        "2 eggs",
        "1 cup sugar",
      ]),
    );

  it("counts a changed figure the draft gave no warning of", () => {
    expect(misread([]).amounts).toEqual({ changed: 1, unflagged: 1 });
  });

  it("does not count it as unflagged when the draft doubted that line", () => {
    // The butter is the second line of the draft, counted from nought.
    const doubt = { where: "ingredient:1", why: "The amount is smudged." };

    expect(misread([doubt]).amounts).toEqual({ changed: 1, unflagged: 0 });
    // A doubt about another line is no warning about this one.
    expect(misread([{ ...doubt, where: "ingredient:2" }]).amounts).toEqual({
      changed: 1,
      unflagged: 1,
    });
  });

  it("pairs a changed line with the line it became, not with its neighbour", () => {
    // The cook took out the first line and corrected the amount of the second.
    const review = compareWithDraft(
      draft({
        ingredientSections: [
          {
            title: null,
            items: [
              { originalText: "A RECIPE FROM THE KITCHEN OF" },
              { originalText: "3 cups milk" },
            ],
          },
        ],
      }),
      saved(["2 cups milk"]),
    );

    expect(review.ingredients).toEqual({ same: 0, moved: 0, changed: 1, added: 0, removed: 1 });
    expect(review.amounts).toEqual({ changed: 1, unflagged: 1 });
  });

  it("reads a fraction sign and a written fraction as the same figure", () => {
    const review = compareWithDraft(
      draft({
        ingredientSections: [{ title: null, items: [{ originalText: "1½ cups milk" }] }],
      }),
      saved(["1 1/2 cups whole milk"]),
    );

    expect(review.ingredients.changed).toBe(1);
    expect(review.amounts).toEqual({ changed: 0, unflagged: 0 });
  });
});
