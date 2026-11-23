import { env } from "cloudflare:workers";
import {
  LIMITS,
  newId,
  type Recipe,
  type RecipeFormValue,
  RecipeInput,
  RecipeUpdate,
  recipeToUpdate,
} from "@recipeflare/schema";
import {
  fixtureFoods,
  fixtureMember,
  fixtureOrganizers,
  fixtureRecipes,
  fixtureUnits,
} from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { chunkRows } from "../src/db/chunk";
import { createRecipe, deleteRecipe, loadRecipe, updateRecipe } from "../src/db/recipes";
import { buildSearchText } from "../src/db/searchText";
import { countingDatabase, seedLists } from "./helpers";

const db = env.DB;
const MEMBER = fixtureMember.id;

beforeAll(async () => {
  await seedLists(db);
});

const food = (name: string) => {
  const found = fixtureFoods.find((item) => item.name === name);
  if (!found) {
    throw new Error(`no fixture food "${name}"`);
  }
  return found;
};
const unit = (name: string) => {
  const found = fixtureUnits.find((item) => item.name === name);
  if (!found) {
    throw new Error(`no fixture unit "${name}"`);
  }
  return found;
};
const organizer = (kind: string, index = 0) => {
  const found = fixtureOrganizers.filter((item) => item.kind === kind)[index];
  if (!found) {
    throw new Error(`no fixture ${kind} ${index}`);
  }
  return found;
};

/** A recipe as the editor would send it. */
function input(overrides: RecipeFormValue): RecipeInput {
  return RecipeInput.parse(overrides);
}

async function created(overrides: RecipeFormValue): Promise<Recipe> {
  const result = await createRecipe(db, input(overrides), MEMBER);
  if (!result.ok) {
    throw new Error(`create failed: ${JSON.stringify(result)}`);
  }
  return result.recipe;
}

/** The parts of a recipe that a save is given, for comparing what went in with what came out. */
function content(recipe: Recipe) {
  const { version: _version, ...rest } = recipeToUpdate(recipe);
  return unordered(rest);
}

/** A recipe's organizers have no order of their own: they come back by name. */
function unordered<T extends Pick<RecipeInput, "categoryIds" | "tagIds" | "toolIds">>(value: T): T {
  return {
    ...value,
    categoryIds: [...value.categoryIds].sort(),
    tagIds: [...value.tagIds].sort(),
    toolIds: [...value.toolIds].sort(),
  };
}

const byName = <T extends { name: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

const search = async (query: string) =>
  (
    await db
      .prepare(
        `SELECT s.recipe_id FROM recipes_fts
         JOIN recipe_search AS s ON s.doc_id = recipes_fts.rowid
         WHERE recipes_fts MATCH ?1`,
      )
      .bind(query)
      .all<{ recipe_id: string }>()
  ).results.map((row) => row.recipe_id);

describe("saving a recipe and loading it again", () => {
  it("returns an equal recipe when only the title was given", async () => {
    const given = input({ title: "Toast" });
    const recipe = await created(given);

    expect(content(recipe)).toEqual(unordered(given));
    expect(recipe).toMatchObject({ slug: "toast", version: 1, createdBy: MEMBER, assets: [] });
    expect(await loadRecipe(db, recipe.id)).toEqual(recipe);
  });

  it("returns an equal recipe for every fixture, sections and notes and all", async () => {
    for (const fixture of fixtureRecipes) {
      const { version: _version, ...given } = recipeToUpdate(fixture);
      const recipe = await created({ ...given, title: `${fixture.title} (round trip)` });

      expect(content(recipe)).toEqual(
        unordered({ ...given, title: `${fixture.title} (round trip)` }),
      );
      // Foods, units and organizers come back as the household has them.
      expect(recipe.ingredientSections).toEqual(fixture.ingredientSections);
      expect(recipe.categories).toEqual(byName(fixture.categories));
      expect(recipe.tags).toEqual(byName(fixture.tags));
      expect(recipe.tools).toEqual(byName(fixture.tools));
    }
  });

  it("returns an equal recipe at the size caps", async () => {
    const lineIds = Array.from({ length: LIMITS.ingredientLines }, () => newId());
    const idsOf = (kind: string) =>
      fixtureOrganizers.filter((o) => o.kind === kind).map((o) => o.id);
    const organizerIds = {
      categoryIds: idsOf("category"),
      tagIds: idsOf("tag"),
      toolIds: idsOf("tool"),
    };
    const given = input({
      title: "T".repeat(LIMITS.titleLength),
      description: "D".repeat(LIMITS.descriptionLength),
      servings: 12,
      yieldQuantity: 0.5,
      yieldUnit: "U".repeat(LIMITS.yieldUnitLength),
      prepTimeSeconds: LIMITS.durationSeconds,
      cookTimeSeconds: 0,
      totalTimeSeconds: LIMITS.durationSeconds,
      nutrition: { calories: "N".repeat(LIMITS.nutritionValueLength), sodiumContent: "12 mg" },
      sourceName: "S".repeat(LIMITS.sourceNameLength),
      sourceUrl: `https://example.com/${"p".repeat(1900)}`,
      ingredientSections: [
        {
          title: "A".repeat(LIMITS.sectionTitleLength),
          items: lineIds.slice(0, 50).map((id, index) => ({
            id,
            originalText: `${index} ${"x".repeat(LIMITS.ingredientTextLength - 4)}`,
            quantity: index + 0.25,
            unitId: unit("cup").id,
            foodId: food("butter").id,
            note: "n".repeat(LIMITS.ingredientTextLength),
          })),
        },
        {
          title: null,
          items: lineIds
            .slice(50)
            .map((id, index) => ({ id, originalText: `line ${index}`, note: "" })),
        },
      ],
      stepSections: [
        {
          title: "First",
          steps: Array.from({ length: LIMITS.steps }, (_, index) => ({
            id: newId(),
            text: `${index} ${"s".repeat(LIMITS.stepTextLength - 4)}`,
            durationSeconds: index,
            ingredientIds: index === 0 ? lineIds : [],
          })),
        },
      ],
      notes: Array.from({ length: LIMITS.notes }, (_, index) => ({
        id: newId(),
        title: `${index} ${"t".repeat(LIMITS.noteTitleLength - 3)}`,
        text: "x".repeat(LIMITS.noteTextLength),
      })),
      ...organizerIds,
    });

    const recipe = await created(given);

    expect(content(recipe)).toEqual(unordered(given));
    expect(recipe.ingredientSections.flatMap((s) => s.items)).toHaveLength(LIMITS.ingredientLines);
    expect(recipe.stepSections.flatMap((s) => s.steps)).toHaveLength(LIMITS.steps);
    expect(recipe.notes).toHaveLength(LIMITS.notes);
    // The slug is cut to length at a word, and the title was one long word.
    expect(recipe.slug).toHaveLength(80);
  });

  it("keeps the IDs of lines, steps and notes through an edit, so a step still points at its ingredients", async () => {
    const [flour, eggs, step, note] = [newId(), newId(), newId(), newId()];
    const recipe = await created({
      title: "Batter",
      ingredientSections: [
        {
          title: null,
          items: [
            { id: flour, originalText: "2 cups flour", note: "" },
            { id: eggs, originalText: "2 eggs", note: "" },
          ],
        },
      ],
      stepSections: [
        { title: null, steps: [{ id: step, text: "Mix.", ingredientIds: [flour, eggs] }] },
      ],
      notes: [{ id: note, title: "", text: "Rest it." }],
    });

    // Reorder the lines and change the step's words.
    const edit = recipeToUpdate(recipe);
    edit.ingredientSections[0]?.items.reverse();
    const firstStep = edit.stepSections[0]?.steps[0];
    if (firstStep) {
      firstStep.text = "Mix well.";
    }
    const result = await updateRecipe(db, recipe.id, RecipeUpdate.parse(edit), MEMBER);

    expect(result.ok && result.recipe.ingredientSections[0]?.items.map((i) => i.id)).toEqual([
      eggs,
      flour,
    ]);
    expect(result.ok && result.recipe.stepSections[0]?.steps[0]).toMatchObject({
      id: step,
      text: "Mix well.",
      ingredientIds: [flour, eggs],
    });
    expect(result.ok && result.recipe.notes[0]?.id).toBe(note);
    expect(result.ok && result.recipe.version).toBe(2);
  });

  it("stores the source link in its canonical form and only the nutrition values that were filled in", async () => {
    const recipe = await created({
      title: "Linked",
      sourceUrl: "https://Example.com/pie?utm_source=mail&id=3#reviews",
      nutrition: { calories: "210", fatContent: "", proteinContent: null },
    });

    expect(recipe.sourceUrl).toBe("https://example.com/pie?id=3");
    const row = await db
      .prepare("SELECT nutrition FROM recipes WHERE id = ?1")
      .bind(recipe.id)
      .first<{ nutrition: string }>();
    expect(row?.nutrition).toBe('{"calories":"210"}');
  });

  it("loads by slug as well as by ID, and finds nothing for neither", async () => {
    const recipe = await created({ title: "By Either Name" });

    expect((await loadRecipe(db, "by-either-name"))?.id).toBe(recipe.id);
    expect((await loadRecipe(db, recipe.id))?.slug).toBe("by-either-name");
    expect(await loadRecipe(db, "no-such-recipe")).toBeNull();
    expect(await loadRecipe(db, newId())).toBeNull();
  });
});

describe("a save's cost", () => {
  it("is one batch of reads and one batch of writes, for a new recipe and for an edit", async () => {
    const counted = countingDatabase(db);
    const result = await createRecipe(
      counted.db,
      input({
        title: "Counted",
        ingredientSections: [
          { title: null, items: [{ id: newId(), originalText: "1 egg", note: "" }] },
        ],
        tagIds: [organizer("tag").id],
      }),
      MEMBER,
    );
    expect(result.ok).toBe(true);
    expect(counted.counts()).toEqual({ batches: 2, statementsOutsideABatch: 0 });

    if (result.ok) {
      const again = countingDatabase(db);
      const edit = RecipeUpdate.parse({ ...recipeToUpdate(result.recipe), title: "Counted Twice" });
      expect((await updateRecipe(again.db, result.recipe.id, edit, MEMBER)).ok).toBe(true);
      expect(again.counts()).toEqual({ batches: 2, statementsOutsideABatch: 0 });
    }
  });

  it("is one query to load", async () => {
    const recipe = await created({ title: "Read Once" });
    const counted = countingDatabase(db);

    await loadRecipe(counted.db, recipe.slug);

    expect(counted.counts()).toEqual({ batches: 1, statementsOutsideABatch: 0 });
  });

  it("never binds more than 100 values in a statement", () => {
    for (const [rows, columns] of [
      [LIMITS.ingredientLines, 9],
      [LIMITS.steps, 7],
      [LIMITS.notes, 5],
      [LIMITS.organizers, 2],
    ] as const) {
      const chunks = chunkRows(Array.from({ length: rows }), columns);
      expect(Math.max(...chunks.map((chunk) => chunk.length * columns))).toBeLessThanOrEqual(100);
      expect(chunks.flat()).toHaveLength(rows);
    }
    expect(chunkRows([], 9)).toEqual([]);
  });
});

describe("two people editing one recipe", () => {
  it("refuses the second save, changes nothing, and hands back the recipe as it is now", async () => {
    const recipe = await created({
      title: "Shared",
      ingredientSections: [
        { title: null, items: [{ id: newId(), originalText: "1 onion", note: "" }] },
      ],
    });
    const loaded = recipeToUpdate(recipe);

    // One phone saves.
    const theirs = await updateRecipe(
      db,
      recipe.id,
      RecipeUpdate.parse({ ...loaded, description: "Theirs" }),
      MEMBER,
    );
    expect(theirs.ok).toBe(true);

    // The other saves from the copy it loaded before that.
    const mine = await updateRecipe(
      db,
      recipe.id,
      RecipeUpdate.parse({ ...loaded, description: "Mine", ingredientSections: [] }),
      MEMBER,
    );

    expect(mine).toMatchObject({ ok: false, reason: "conflict" });
    if (!mine.ok && mine.reason === "conflict") {
      expect(mine.current).toMatchObject({ description: "Theirs", version: 2 });
      expect(mine.current.ingredientSections[0]?.items).toHaveLength(1);
    }
    expect(await loadRecipe(db, recipe.id)).toMatchObject({ description: "Theirs", version: 2 });
  });

  it("is stopped by the database itself when both saves read before either wrote", async () => {
    const recipe = await created({ title: "Raced" });
    const loaded = recipeToUpdate(recipe);

    const results = await Promise.all([
      updateRecipe(db, recipe.id, RecipeUpdate.parse({ ...loaded, description: "A" }), MEMBER),
      updateRecipe(db, recipe.id, RecipeUpdate.parse({ ...loaded, description: "B" }), MEMBER),
    ]);

    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    expect(results.find((result) => !result.ok)).toMatchObject({ reason: "conflict" });
    expect((await loadRecipe(db, recipe.id))?.version).toBe(2);
  });

  it("says so when the recipe is gone", async () => {
    const result = await updateRecipe(
      db,
      newId(),
      RecipeUpdate.parse({ title: "Ghost", version: 1 }),
      MEMBER,
    );

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("a save that fails part-way", () => {
  it("leaves no partial recipe when a new recipe cannot be written whole", async () => {
    const taken = await created({
      title: "Owner Of The Line",
      ingredientSections: [
        { title: null, items: [{ id: newId(), originalText: "salt", note: "" }] },
      ],
    });
    const takenLineId = taken.ingredientSections[0]?.items[0]?.id ?? "";

    // The second line's ID belongs to another recipe, so its insert fails after the recipe row went in.
    await expect(
      createRecipe(
        db,
        input({
          title: "Half Written",
          ingredientSections: [
            {
              title: null,
              items: [
                { id: newId(), originalText: "juniper berries", note: "" },
                { id: takenLineId, originalText: "salt", note: "" },
              ],
            },
          ],
        }),
        MEMBER,
      ),
    ).rejects.toThrow();

    expect(await loadRecipe(db, "half-written")).toBeNull();
    expect(await search("juniper")).toEqual([]);
  });

  it("leaves an edited recipe exactly as it was", async () => {
    const other = await created({
      title: "Other",
      notes: [{ id: newId(), title: "", text: "Theirs." }],
    });
    const recipe = await created({
      title: "Kept Whole",
      ingredientSections: [
        { title: null, items: [{ id: newId(), originalText: "1 leek", note: "" }] },
      ],
    });

    const edit = RecipeUpdate.parse({
      ...recipeToUpdate(recipe),
      title: "Broken Edit",
      ingredientSections: [],
      // A note ID that another recipe owns.
      notes: [{ id: other.notes[0]?.id, title: "", text: "Mine." }],
    });
    await expect(updateRecipe(db, recipe.id, edit, MEMBER)).rejects.toThrow();

    expect(await loadRecipe(db, recipe.id)).toEqual(recipe);
    expect(await search("leek")).toEqual([recipe.id]);
  });
});

describe("a recipe that names something the household does not have", () => {
  it("is refused with the field that is wrong, and nothing is written", async () => {
    const result = await createRecipe(
      db,
      input({
        title: "Dangling",
        ingredientSections: [
          {
            title: null,
            items: [
              { id: newId(), originalText: "1 cup butter", foodId: food("butter").id, note: "" },
              { id: newId(), originalText: "2 x", foodId: newId(), unitId: newId(), note: "" },
            ],
          },
        ],
        // A tag's ID given as a category.
        categoryIds: [organizer("tag").id],
        tagIds: [organizer("tag").id === organizer("tag", 1).id ? newId() : organizer("tag", 1).id],
        toolIds: [newId()],
      }),
      MEMBER,
    );

    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(!result.ok && result.reason === "invalid" && result.issues.map((i) => i.path)).toEqual([
      ["ingredientSections", 0, "items", 1, "foodId"],
      ["ingredientSections", 0, "items", 1, "unitId"],
      ["categoryIds", 0],
      ["toolIds", 0],
    ]);
    expect(await loadRecipe(db, "dangling")).toBeNull();
  });
});

describe("slugs", () => {
  it("takes the lowest free number when the title is already in use", async () => {
    const first = await created({ title: "Sunday Soup" });
    const second = await created({ title: "Sunday Soup" });
    const third = await created({ title: "Sunday soup!" });
    // Starts with the same words, and is not a numbered copy.
    const longer = await created({ title: "Sunday Soup With Dumplings" });

    expect([first.slug, second.slug, third.slug, longer.slug]).toEqual([
      "sunday-soup",
      "sunday-soup-2",
      "sunday-soup-3",
      "sunday-soup-with-dumplings",
    ]);

    await deleteRecipe(db, second.id);
    expect((await created({ title: "Sunday Soup" })).slug).toBe("sunday-soup-2");
  });

  it("keeps clear of the addresses the app uses itself", async () => {
    expect((await created({ title: "New" })).slug).toBe("new-2");
    expect((await created({ title: "Edit" })).slug).toBe("edit-2");
  });

  it("follows the title when it changes, and stays put when it does not", async () => {
    const recipe = await created({ title: "Plain Rice" });
    await created({ title: "Fried Rice" });

    const same = await updateRecipe(
      db,
      recipe.id,
      RecipeUpdate.parse({ ...recipeToUpdate(recipe), description: "Fluffy." }),
      MEMBER,
    );
    expect(same.ok && same.recipe.slug).toBe("plain-rice");

    const renamed = await updateRecipe(
      db,
      recipe.id,
      RecipeUpdate.parse({ ...recipeToUpdate(recipe), version: 2, title: "Fried Rice" }),
      MEMBER,
    );
    expect(renamed.ok && renamed.recipe.slug).toBe("fried-rice-2");
    expect(await loadRecipe(db, "plain-rice")).toBeNull();
  });

  it("gives each recipe its own slug when two with one title are saved at the same moment", async () => {
    const results = await Promise.all([
      createRecipe(db, input({ title: "Twin Pies" }), MEMBER),
      createRecipe(db, input({ title: "Twin Pies" }), MEMBER),
    ]);

    expect(results.map((result) => result.ok && result.recipe.slug).sort()).toEqual([
      "twin-pies",
      "twin-pies-2",
    ]);
  });
});

describe("the search text a save writes", () => {
  it("lets a recipe be found by its title, a food's own name, who it is from, and a tag", async () => {
    const tag = organizer("tag");
    const recipe = await created({
      title: "Zanzibar Flapjacks",
      description: "Thin and lacy.",
      sourceName: "Great-aunt Wilhelmina",
      ingredientSections: [
        {
          title: null,
          items: [
            // The card's shorthand; the household's food is "brown sugar".
            {
              id: newId(),
              originalText: "3/4 C B. Sugar",
              foodId: food("brown sugar").id,
              note: "",
            },
            { id: newId(), originalText: null, note: "a pinch of quixotic spice" },
          ],
        },
      ],
      tagIds: [tag.id],
    });

    expect(await search('"zanzibar"')).toEqual([recipe.id]);
    expect(await search('"lacy"')).toEqual([recipe.id]);
    expect(await search('"wilhelmina"')).toEqual([recipe.id]);
    expect(await search('ingredients:"brown"')).toContain(recipe.id);
    expect(await search('"quixotic"')).toEqual([recipe.id]);
    expect(await search(`organizers:"${tag.name}"`)).toContain(recipe.id);
  });

  it("follows an edit: old words stop matching and new ones start", async () => {
    const recipe = await created({ title: "Xylophone Stew" });

    await updateRecipe(
      db,
      recipe.id,
      RecipeUpdate.parse({ ...recipeToUpdate(recipe), title: "Marimba Stew" }),
      MEMBER,
    );

    expect(await search('"xylophone"')).toEqual([]);
    expect(await search('"marimba"')).toEqual([recipe.id]);
  });

  it("is assembled in one place, one line per ingredient", () => {
    expect(
      buildSearchText({
        title: "Pie",
        description: "",
        sourceName: "Grandma",
        ingredients: [
          { foodName: "butter", originalText: "1 C. Butter, Softened", note: "softened" },
          { foodName: null, originalText: null, note: "a little salt" },
          { foodName: "egg", originalText: null, note: "" },
        ],
        organizerNames: ["Dessert", "Holiday"],
      }),
    ).toEqual({
      title: "Pie",
      description: "Grandma",
      ingredients: "butter 1 C. Butter, Softened\na little salt\negg",
      organizers: "Dessert\nHoliday",
    });
  });
});

describe("deleting a recipe", () => {
  it("removes it, everything that belongs to it, and its place in search", async () => {
    const recipe = await created({
      title: "Ephemeral Quiche",
      ingredientSections: [
        { title: null, items: [{ id: newId(), originalText: "3 eggs", note: "" }] },
      ],
      stepSections: [{ title: null, steps: [{ id: newId(), text: "Bake." }] }],
      notes: [{ id: newId(), title: "", text: "Good cold." }],
      tagIds: [organizer("tag").id],
    });

    expect(await deleteRecipe(db, recipe.id)).toBe(true);

    expect(await loadRecipe(db, recipe.id)).toBeNull();
    expect(await search('"ephemeral"')).toEqual([]);
    for (const table of [
      "recipe_ingredients",
      "recipe_steps",
      "recipe_notes",
      "recipe_organizers",
    ]) {
      const left = await db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE recipe_id = ?1`)
        .bind(recipe.id)
        .first<{ n: number }>();
      expect(left?.n).toBe(0);
    }
    // The tag itself is the household's and stays.
    expect(
      await db.prepare("SELECT id FROM organizers WHERE id = ?1").bind(organizer("tag").id).first(),
    ).not.toBeNull();
  });

  it("says so when there was nothing to delete", async () => {
    expect(await deleteRecipe(db, newId())).toBe(false);
  });
});
