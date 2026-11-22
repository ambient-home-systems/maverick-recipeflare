import { describe, expect, it } from "vitest";
import { beefChili, cardMeatLoaf, cardPanCookies, pancakes, roastChicken } from "./fixtures";
import { formatIngredient, formatQuantity, isFreeText, isScalable } from "./format";
import type { Ingredient } from "./recipe";

describe("formatQuantity", () => {
  it.each([
    [1, "1"],
    [0.5, "½"],
    [1.5, "1½"],
    [0.25, "¼"],
    [2.75, "2¾"],
    [1 / 3, "⅓"],
    [2 / 3, "⅔"],
    [0.125, "⅛"],
    [0.333, "⅓"],
    [0.9999, "1"],
    [12, "12"],
  ])("shows %d as %j", (quantity, expected) => {
    expect(formatQuantity(quantity)).toBe(expected);
  });

  it("falls back to a decimal when no common fraction is near", () => {
    expect(formatQuantity(0.4)).toBe("0.4");
    expect(formatQuantity(2.45)).toBe("2.45");
  });

  it("shows decimals when fractions are off", () => {
    expect(formatQuantity(1.5, { fraction: false })).toBe("1.5");
    expect(formatQuantity(250, { fraction: false })).toBe("250");
    expect(formatQuantity(0.333333, { fraction: false })).toBe("0.33");
  });
});

function lineOf(recipe: typeof pancakes, text: string): Ingredient {
  const line = recipe.ingredientSections
    .flatMap((section) => section.items)
    .find((item) => item.originalText === text);
  if (!line) {
    throw new Error(`No fixture line "${text}"`);
  }
  return line;
}

describe("formatIngredient", () => {
  it("builds a parsed line from its fields", () => {
    expect(formatIngredient(lineOf(pancakes, "2 cups all-purpose flour"))).toBe(
      "2 cups all-purpose flour",
    );
  });

  it("uses the unit's abbreviation when the unit asks for it", () => {
    expect(formatIngredient(lineOf(pancakes, "1/2 tsp salt"))).toBe("½ tsp salt");
  });

  it("makes the food plural when there is no unit", () => {
    expect(formatIngredient(lineOf(pancakes, "2 eggs"))).toBe("2 eggs");
    expect(formatIngredient(lineOf(pancakes, "2 eggs"), { scale: 0.5 })).toBe("1 egg");
  });

  it("appends the note after a comma", () => {
    expect(formatIngredient(lineOf(roastChicken, "6 cloves garlic, smashed"))).toBe(
      "6 cloves garlic, smashed",
    );
  });

  it("scales the quantity and adjusts the plural", () => {
    const flour = lineOf(pancakes, "2 cups all-purpose flour");
    expect(formatIngredient(flour, { scale: 0.5 })).toBe("1 cup all-purpose flour");
    expect(formatIngredient(flour, { scale: 3 })).toBe("6 cups all-purpose flour");
    expect(formatIngredient(lineOf(roastChicken, "1 1/2 cups chicken stock"), { scale: 2 })).toBe(
      "3 cups chicken stock",
    );
  });

  it("shows a free-text line as written and does not scale it", () => {
    const line = lineOf(roastChicken, "Salt and pepper, to taste");
    expect(isFreeText(line)).toBe(true);
    expect(isScalable(line)).toBe(false);
    expect(formatIngredient(line, { scale: 4 })).toBe("Salt and pepper, to taste");
  });

  it("formats the sample cards' lines from their parsed fields", () => {
    expect(formatIngredient(lineOf(cardMeatLoaf, "1/3 c. minced onions"))).toBe(
      "⅓ cup onion, minced",
    );
    expect(
      formatIngredient(
        lineOf(cardMeatLoaf, "1 - (15 1/2 oz can) Chef Boy-ar-Dee spaghetti sauce with mushrooms"),
        { scale: 2 },
      ),
    ).toBe("2 cans spaghetti sauce, 15 1/2 oz, Chef Boy-ar-Dee, with mushrooms");
    expect(formatIngredient(lineOf(cardPanCookies, "2 1/4 C. flour"))).toBe(
      "2¼ cups all-purpose flour",
    );
    expect(
      formatIngredient(lineOf(cardPanCookies, "1 - 12 oz Chocolate Chips"), { scale: 0.5 }),
    ).toBe("6 oz chocolate chips");
  });

  it("shows a food with no quantity", () => {
    const line: Ingredient = {
      ...lineOf(beefChili, "2 bay leaves"),
      quantity: null,
      note: "optional",
    };
    expect(formatIngredient(line)).toBe("bay leaf, optional");
  });

  it("falls back to the note when a line has nothing else", () => {
    const line: Ingredient = {
      id: lineOf(pancakes, "2 eggs").id,
      originalText: null,
      quantity: null,
      unit: null,
      food: null,
      note: "A little love",
    };
    expect(formatIngredient(line)).toBe("A little love");
  });
});
