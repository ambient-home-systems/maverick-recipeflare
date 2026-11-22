import { describe, expect, it } from "vitest";
import { fixtureRecipes, roastChicken } from "./fixtures";
import {
  flattenIngredientSections,
  flattenStepSections,
  groupIngredientRows,
  groupStepRows,
} from "./sections";

describe("flattening sections", () => {
  it("numbers rows across sections and carries each section's title", () => {
    const rows = flattenIngredientSections(roastChicken.ingredientSections);

    expect(rows.map((row) => row.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.map((row) => row.section)).toEqual([
      ...Array(6).fill("For the chicken"),
      ...Array(3).fill("For the gravy"),
    ]);
  });

  it("returns no rows for no sections", () => {
    expect(flattenIngredientSections([])).toEqual([]);
    expect(groupIngredientRows([])).toEqual([]);
  });
});

describe("grouping rows", () => {
  it("sorts by position before grouping", () => {
    const rows = [
      { id: "b", section: "Sauce", position: 1 },
      { id: "a", section: null, position: 0 },
      { id: "c", section: "Sauce", position: 2 },
    ];
    expect(groupIngredientRows(rows)).toEqual([
      { title: null, items: [{ id: "a" }] },
      { title: "Sauce", items: [{ id: "b" }, { id: "c" }] },
    ]);
  });

  it("starts a new section when an untitled run follows a titled one", () => {
    const rows = [
      { id: "a", section: "Dough", position: 0 },
      { id: "b", section: null, position: 1 },
      { id: "c", section: "Dough", position: 2 },
    ];
    expect(groupStepRows(rows).map((s) => s.title)).toEqual(["Dough", null, "Dough"]);
  });
});

describe("round trip", () => {
  it.each(fixtureRecipes.map((recipe) => [recipe.title, recipe] as const))(
    "%s survives flatten then group",
    (_title, recipe) => {
      expect(groupIngredientRows(flattenIngredientSections(recipe.ingredientSections))).toEqual(
        recipe.ingredientSections,
      );
      expect(groupStepRows(flattenStepSections(recipe.stepSections))).toEqual(recipe.stepSections);
    },
  );
});
