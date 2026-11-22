import { RecipeUpdate, recipeToUpdate } from "@recipeflare/schema";
import { cinnamonToast, fixtureRecipes, roastChicken } from "@recipeflare/schema/fixtures";
import { describe, expect, it } from "vitest";
import {
  checkEditorValue,
  emptyEditorValue,
  fromRecipe,
  isDirty,
  moveRow,
  newDivider,
  newLine,
  newStep,
  readQuantity,
  splitEntries,
} from "./editorState";

const noParse = () => null;

describe("readQuantity", () => {
  it.each([
    ["2 cups", 2, " cups"],
    ["0.5 kg", 0.5, " kg"],
    ["1/2 cup", 0.5, " cup"],
    ["2 1/4 C. flour", 2.25, " C. flour"],
    ["1½ tsp", 1.5, " tsp"],
    ["¾ cup", 0.75, " cup"],
  ])("reads the amount at the start of %s", (text, quantity, rest) => {
    expect(readQuantity(text)).toEqual({ quantity, rest });
  });

  it("is null when the text does not start with an amount, or the amount is nothing", () => {
    expect(readQuantity("Salt, to taste")).toBeNull();
    expect(readQuantity("0 cups")).toBeNull();
    expect(readQuantity("1/0 cup")).not.toEqual({
      quantity: Number.POSITIVE_INFINITY,
      rest: " cup",
    });
  });
});

describe("splitEntries", () => {
  it("makes one entry for each line that is not blank, and drops list marks", () => {
    expect(splitEntries("- 2 cups flour\n\n• 1 tsp salt\r\n3. Stir\n   ")).toEqual([
      "2 cups flour",
      "1 tsp salt",
      "Stir",
    ]);
  });

  it("keeps a line that only starts with a number", () => {
    expect(splitEntries("2 eggs")).toEqual(["2 eggs"]);
  });
});

describe("moveRow", () => {
  it("moves a row and leaves the rest in order", () => {
    expect(moveRow(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveRow(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("does nothing for a place that is not in the list", () => {
    expect(moveRow(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(moveRow(["a", "b"], -1, 0)).toEqual(["a", "b"]);
  });
});

describe("the editor's value", () => {
  it.each(fixtureRecipes.map((recipe) => [recipe.title, recipe] as const))(
    "loads %s and gives it back as it would be saved",
    (_title, recipe) => {
      const checked = checkEditorValue(fromRecipe(recipe));
      expect(checked.errors).toEqual({});
      const { version: _version, ...expected } = RecipeUpdate.parse(recipeToUpdate(recipe));
      expect(checked.input).toEqual(expected);
    },
  );

  it("holds a section as a divider row above its lines", () => {
    const rows = fromRecipe(roastChicken).ingredients.map((row) =>
      row.kind === "divider" ? `# ${row.title}` : row.text,
    );
    expect(rows[0]).toBe("# For the chicken");
    expect(rows[7]).toBe("# For the gravy");
    expect(rows).toHaveLength(11);
  });

  it("is not dirty until something changes", () => {
    const initial = fromRecipe(cinnamonToast);
    expect(isDirty(initial, initial)).toBe(false);
    expect(isDirty({ ...initial, title: "Cinnamon Toast!" }, initial)).toBe(true);
  });
});

describe("checkEditorValue", () => {
  const valid = () => ({ ...emptyEditorValue(), title: "Soup" });

  it("accepts a recipe that is only a title", () => {
    const checked = checkEditorValue(valid());
    expect(checked.errors).toEqual({});
    expect(checked.input?.title).toBe("Soup");
  });

  it("asks for a title in plain words", () => {
    expect(checkEditorValue(emptyEditorValue()).errors).toEqual({
      title: "A recipe needs a title.",
    });
  });

  it("ties a problem to the field it belongs to", () => {
    const checked = checkEditorValue({
      ...valid(),
      sourceUrl: "example kitchen",
      servings: "lots",
      yieldUnit: "cookies",
      prep: { hours: "", minutes: "75" },
    });
    expect(Object.keys(checked.errors).sort()).toEqual(["prep", "servings", "sourceUrl", "yield"]);
    expect(checked.input).toBeUndefined();
  });

  it("reads amounts and times typed as a cook would type them", () => {
    const checked = checkEditorValue({
      ...valid(),
      servings: "1 1/2",
      yieldQuantity: "24",
      yieldUnit: "cookies",
      cook: { hours: "1", minutes: "5" },
      total: { hours: "", minutes: "" },
    });
    expect(checked.input).toMatchObject({
      servings: 1.5,
      yieldQuantity: 24,
      yieldUnit: "cookies",
      cookTimeSeconds: 3900,
      totalTimeSeconds: null,
    });
  });

  it("groups rows under the divider above them, and drops a divider with nothing under it", () => {
    const sauce = newDivider("Sauce");
    const checked = checkEditorValue({
      ...valid(),
      ingredients: [
        newLine("2 eggs", noParse),
        sauce,
        newLine("1 cup cream", noParse),
        newDivider("To serve"),
      ],
      steps: [newStep("Whisk."), newStep("Serve.")],
    });
    expect(checked.errors).toEqual({});
    expect(checked.input?.ingredientSections.map((s) => [s.title, s.items.length])).toEqual([
      [null, 1],
      ["Sauce", 1],
    ]);
    expect(checked.input?.stepSections).toHaveLength(1);
  });

  it("flags a divider with no title on that row", () => {
    const divider = newDivider("");
    const checked = checkEditorValue({
      ...valid(),
      ingredients: [divider, newLine("2 eggs", noParse)],
    });
    expect(checked.errors).toEqual({
      [`row:${divider.id}`]: "Give this section a title, or remove it.",
    });
  });

  it("flags the second of two sections in a row with the same title", () => {
    const second = newDivider("Sauce");
    const checked = checkEditorValue({
      ...valid(),
      ingredients: [
        newDivider("Sauce"),
        newLine("1 cup cream", noParse),
        second,
        newLine("2 eggs", noParse),
      ],
    });
    expect(checked.errors).toEqual({
      [`row:${second.id}`]: "Two sections in a row need different titles.",
    });
  });

  it("lists each new food once, for the cook to confirm", () => {
    const line = (text: string, newFood: string) => ({
      ...newLine(text, noParse),
      quantity: 1,
      newFood,
    });
    const checked = checkEditorValue({
      ...valid(),
      ingredients: [
        line("1 cup saffron rice", "saffron rice"),
        line("1 more cup saffron rice", "saffron rice"),
        line("1 quince", "quince"),
      ],
    });
    expect(checked.newFoods).toEqual(["saffron rice", "quince"]);
    expect(checked.errors).toEqual({});
  });

  it("leaves out a note that was added and never filled in", () => {
    const checked = checkEditorValue({
      ...valid(),
      notes: [{ id: crypto.randomUUID(), title: "", text: "" }],
    });
    expect(checked.errors).toEqual({});
    expect(checked.input?.notes).toEqual([]);
  });
});
