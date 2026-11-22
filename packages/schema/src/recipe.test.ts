import { describe, expect, it } from "vitest";
import { cinnamonToast, fixtureId, fixtureRecipes, roastChicken } from "./fixtures";
import { LIMITS } from "./primitives";
import {
  coverAsset,
  Recipe,
  RecipeCreate,
  type RecipeFormValue,
  RecipeInput,
  RecipeSummary,
  RecipeUpdate,
  recipeToUpdate,
  toRecipeSummary,
} from "./recipe";

const id = (n: number) => fixtureId(0xee, n);

function ingredient(n: number, text = `ingredient ${n}`) {
  return { id: id(n), originalText: text };
}

function step(n: number, text = `step ${n}`) {
  return { id: id(10_000 + n), text };
}

/** A small valid recipe to bend out of shape in each test. */
function validInput(): RecipeFormValue {
  return {
    title: "Test Soup",
    ingredientSections: [{ title: null, items: [ingredient(1), ingredient(2)] }],
    stepSections: [{ title: null, steps: [step(1)] }],
  };
}

function messages(input: unknown): string[] {
  const result = RecipeInput.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("fixtures", () => {
  it.each(fixtureRecipes.map((recipe) => [recipe.title, recipe] as const))(
    "%s is a valid Recipe",
    (_title, recipe) => {
      expect(Recipe.parse(recipe)).toEqual(recipe);
    },
  );

  it.each(fixtureRecipes.map((recipe) => [recipe.title, recipe] as const))(
    "%s loads into the editor and saves unchanged",
    (_title, recipe) => {
      const update = recipeToUpdate(recipe);
      expect(RecipeUpdate.parse(update)).toEqual(update);
    },
  );

  it("use every ID once", () => {
    const ids = fixtureRecipes.flatMap((recipe) => [
      recipe.id,
      ...recipe.ingredientSections.flatMap((s) => s.items.map((i) => i.id)),
      ...recipe.stepSections.flatMap((s) => s.steps.map((st) => st.id)),
      ...recipe.notes.map((n) => n.id),
      ...recipe.assets.map((a) => a.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("include a long recipe for the screens to cope with", () => {
    const longest = Math.max(
      ...fixtureRecipes.map((r) => r.ingredientSections.reduce((n, s) => n + s.items.length, 0)),
    );
    expect(longest).toBeGreaterThanOrEqual(25);
  });
});

describe("RecipeInput", () => {
  it("accepts a recipe with only a title and fills the defaults", () => {
    expect(RecipeInput.parse({ title: "Cinnamon Toast" })).toEqual({
      title: "Cinnamon Toast",
      description: "",
      servings: null,
      yieldQuantity: null,
      yieldUnit: null,
      prepTimeSeconds: null,
      cookTimeSeconds: null,
      totalTimeSeconds: null,
      nutrition: null,
      sourceName: null,
      sourceUrl: null,
      ingredientSections: [],
      stepSections: [],
      notes: [],
      categoryIds: [],
      tagIds: [],
      toolIds: [],
    });
  });

  it("trims the title and rejects an empty one", () => {
    expect(RecipeInput.parse({ title: "  Toast  " }).title).toBe("Toast");
    expect(RecipeInput.safeParse({ title: "   " }).success).toBe(false);
    expect(RecipeInput.safeParse({}).success).toBe(false);
  });

  it("accepts an ingredient with only its original text", () => {
    const parsed = RecipeInput.parse(validInput());
    expect(parsed.ingredientSections[0]?.items[0]).toEqual({
      id: id(1),
      originalText: "ingredient 1",
      quantity: null,
      unitId: null,
      foodId: null,
      note: "",
    });
  });

  it("rejects an ingredient with no text, food or note", () => {
    const input = validInput();
    input.ingredientSections = [{ title: null, items: [{ id: id(1), originalText: null }] }];
    expect(messages(input)).toContain("An ingredient needs its text, a food or a note");
  });

  it("rejects quantities and servings that are not above zero", () => {
    const input = validInput();
    input.servings = 0;
    expect(RecipeInput.safeParse(input).success).toBe(false);

    const negative = validInput();
    negative.ingredientSections = [{ title: null, items: [{ ...ingredient(1), quantity: -1 }] }];
    expect(RecipeInput.safeParse(negative).success).toBe(false);
  });

  it("accepts http and https source links only", () => {
    expect(RecipeInput.safeParse({ title: "x", sourceUrl: "https://example.com/r" }).success).toBe(
      true,
    );
    expect(RecipeInput.safeParse({ title: "x", sourceUrl: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(RecipeInput.safeParse({ title: "x", sourceUrl: "not a link" }).success).toBe(false);
  });

  it("keeps a source name and treats a blank one as invalid", () => {
    expect(RecipeInput.parse({ title: "x", sourceName: " Aunt June " }).sourceName).toBe(
      "Aunt June",
    );
    expect(RecipeInput.safeParse({ title: "x", sourceName: "  " }).success).toBe(false);
  });

  it("rejects an empty section", () => {
    const input = validInput();
    input.ingredientSections = [{ title: "Sauce", items: [] }];
    expect(RecipeInput.safeParse(input).success).toBe(false);
  });

  it("rejects neighbouring sections with the same title, which would merge when stored", () => {
    const input = validInput();
    input.ingredientSections = [
      { title: "Sauce", items: [ingredient(1)] },
      { title: "Sauce", items: [ingredient(2)] },
    ];
    expect(messages(input)).toContain("Neighbouring sections need different titles");
  });

  it("rejects a step that refers to an ingredient of another recipe", () => {
    const input = validInput();
    input.stepSections = [{ title: null, steps: [{ ...step(1), ingredientIds: [id(999)] }] }];
    expect(messages(input)).toContain("A step can only refer to ingredients of the same recipe");
  });

  it("accepts a step that refers to its own recipe's ingredients", () => {
    const input = validInput();
    input.stepSections = [{ title: null, steps: [{ ...step(1), ingredientIds: [id(1), id(2)] }] }];
    expect(RecipeInput.safeParse(input).success).toBe(true);
  });

  it("rejects the same ID used twice", () => {
    const input = validInput();
    input.ingredientSections = [{ title: null, items: [ingredient(1), ingredient(1)] }];
    expect(messages(input)).toContain("Ingredient, step and note IDs must be unique");
  });

  it("rejects an organizer added twice", () => {
    const input = validInput();
    input.tagIds = [id(50), id(50)];
    expect(messages(input)).toContain("A category, tag or tool can be added only once");
  });
});

describe("size caps", () => {
  const manyIngredients = (count: number) =>
    Array.from({ length: count }, (_, index) => ingredient(index + 1));
  const manySteps = (count: number) => Array.from({ length: count }, (_, index) => step(index + 1));

  it(`allows ${LIMITS.ingredientLines} ingredient lines and ${LIMITS.steps} steps`, () => {
    const input = validInput();
    input.ingredientSections = [
      { title: "A", items: manyIngredients(60) },
      { title: "B", items: manyIngredients(100).slice(60) },
    ];
    input.stepSections = [{ title: null, steps: manySteps(LIMITS.steps) }];
    expect(RecipeInput.safeParse(input).success).toBe(true);
  });

  it("rejects one ingredient line too many, even when spread over sections", () => {
    const input = validInput();
    input.ingredientSections = [
      { title: "A", items: manyIngredients(60) },
      { title: "B", items: manyIngredients(101).slice(60) },
    ];
    expect(messages(input)).toContain(
      `A recipe can have at most ${LIMITS.ingredientLines} ingredient lines`,
    );
  });

  it("rejects one step too many", () => {
    const input = validInput();
    input.stepSections = [{ title: null, steps: manySteps(LIMITS.steps + 1) }];
    expect(messages(input)).toContain(`A recipe can have at most ${LIMITS.steps} steps`);
  });

  it("caps the length of a step", () => {
    const input = validInput();
    input.stepSections = [{ title: null, steps: [step(1, "x".repeat(LIMITS.stepTextLength))] }];
    expect(RecipeInput.safeParse(input).success).toBe(true);

    input.stepSections = [{ title: null, steps: [step(1, "x".repeat(LIMITS.stepTextLength + 1))] }];
    expect(RecipeInput.safeParse(input).success).toBe(false);
  });

  it("caps the title, the notes and the organizers", () => {
    expect(RecipeInput.safeParse({ title: "x".repeat(LIMITS.titleLength) }).success).toBe(true);
    expect(RecipeInput.safeParse({ title: "x".repeat(LIMITS.titleLength + 1) }).success).toBe(
      false,
    );

    const notes = Array.from({ length: LIMITS.notes + 1 }, (_, i) => ({
      id: id(20_000 + i),
      text: "note",
    }));
    expect(RecipeInput.safeParse({ title: "x", notes: notes.slice(1) }).success).toBe(true);
    expect(RecipeInput.safeParse({ title: "x", notes }).success).toBe(false);

    const organizerIds = Array.from({ length: LIMITS.organizers + 1 }, (_, i) => id(30_000 + i));
    expect(
      RecipeInput.safeParse({
        title: "x",
        categoryIds: organizerIds.slice(0, 10),
        tagIds: organizerIds.slice(10, 40),
        toolIds: organizerIds.slice(40, 50),
      }).success,
    ).toBe(true);
    expect(
      messages({
        title: "x",
        categoryIds: organizerIds.slice(0, 10),
        tagIds: organizerIds.slice(10, 40),
        toolIds: organizerIds.slice(40, 51),
      }),
    ).toContain(`A recipe can have at most ${LIMITS.organizers} categories, tags and tools`);
  });

  it("caps a time at 99 hours 59 minutes", () => {
    expect(
      RecipeInput.safeParse({ title: "x", cookTimeSeconds: LIMITS.durationSeconds }).success,
    ).toBe(true);
    expect(
      RecipeInput.safeParse({ title: "x", cookTimeSeconds: LIMITS.durationSeconds + 1 }).success,
    ).toBe(false);
    expect(RecipeInput.safeParse({ title: "x", cookTimeSeconds: 90.5 }).success).toBe(false);
  });
});

describe("RecipeCreate and RecipeUpdate", () => {
  it("create takes an optional import job", () => {
    expect(RecipeCreate.parse({ title: "x" }).importJobId).toBeNull();
    expect(RecipeCreate.parse({ title: "x", importJobId: id(1) }).importJobId).toBe(id(1));
  });

  it("update needs the version the editor loaded", () => {
    expect(RecipeUpdate.safeParse({ title: "x" }).success).toBe(false);
    expect(RecipeUpdate.safeParse({ title: "x", version: 0 }).success).toBe(false);
    expect(RecipeUpdate.parse({ title: "x", version: 3 }).version).toBe(3);
  });

  it("apply the same cross-field checks as RecipeInput", () => {
    const bad = {
      title: "x",
      version: 1,
      stepSections: [{ title: null, steps: [{ ...step(1), ingredientIds: [id(999)] }] }],
    };
    expect(RecipeUpdate.safeParse(bad).success).toBe(false);
    expect(RecipeCreate.safeParse(bad).success).toBe(false);
  });
});

describe("summaries and covers", () => {
  it("summarises a recipe for the list", () => {
    const summary = toRecipeSummary(roastChicken);
    expect(RecipeSummary.parse(summary)).toEqual(summary);
    expect(summary.cover?.role).toBe("cover");
    expect(summary.tags.map((tag) => tag.name)).toEqual(["Family favorite", "Holiday"]);
  });

  it("has no cover when a recipe has no photos", () => {
    expect(coverAsset(cinnamonToast)).toBeNull();
  });

  it("uses the first photo when no cover is chosen, never the paper card", () => {
    const [cover, photo] = roastChicken.assets;
    if (!cover || !photo) {
      throw new Error("The fixture should have two assets");
    }
    const original = { ...cover, id: id(40_000), role: "original" as const, position: 0 };
    expect(coverAsset({ assets: [original, { ...photo, position: 1 }] })?.id).toBe(photo.id);
    expect(coverAsset({ assets: [original] })).toBeNull();
  });
});
