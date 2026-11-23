import { describe, expect, it } from "vitest";
import { fixtureFoods, fixtureUnits } from "./fixtures";
import { ingredientParser, parseIngredientLine, readQuantity } from "./parse-ingredient";

const lists = { units: fixtureUnits, foods: fixtureFoods };
const parse = ingredientParser(lists);

/**
 * One line of the corpus: the text, then what it should be read as. The unit
 * and the food are given by the household's own names. A food the household
 * does not have is written with a plus sign: "+rolled oats". `null` in place
 * of the reading means the line must be left as written.
 *
 * These lines were written for the tests. None is copied from a recipe.
 */
type Reading = [quantity: number | null, unit: string | null, food: string | null, note?: string];
type Row = [text: string, reading: Reading | null];

const unitId = (name: string) => {
  const found = fixtureUnits.find((unit) => unit.name === name);
  if (!found) {
    throw new Error(`the corpus names a unit the fixtures lack: ${name}`);
  }
  return found.id;
};
const foodId = (name: string) => {
  const found = fixtureFoods.find((food) => food.name === name);
  if (!found) {
    throw new Error(`the corpus names a food the fixtures lack: ${name}`);
  }
  return found.id;
};

function expected(reading: Reading | null) {
  if (reading === null) {
    return null;
  }
  const [quantity, unit, food, note = ""] = reading;
  const isNew = food?.startsWith("+") ?? false;
  return {
    quantity,
    unitId: unit === null ? null : unitId(unit),
    foodId: food === null || isNew ? null : foodId(food),
    newFood: isNew ? (food as string).slice(1) : null,
    note,
  };
}

const THIRD = 1 / 3;

const PLAIN: Row[] = [
  ["2 cups flour", [2, "cup", "all-purpose flour"]],
  ["1 cup sugar", [1, "cup", "sugar"]],
  ["1 teaspoon salt", [1, "teaspoon", "salt"]],
  ["2 tablespoons butter", [2, "tablespoon", "butter"]],
  ["3 eggs", [3, null, "egg"]],
  ["1 egg", [1, null, "egg"]],
  ["1 lemon", [1, null, "lemon"]],
  ["4 carrots", [4, null, "carrot"]],
  ["2 limes", [2, null, "lime"]],
  ["1 onion", [1, null, "onion"]],
  ["500 g ground beef", [500, "gram", "ground beef"]],
  ["250 ml milk", [250, "milliliter", "milk"]],
  ["8 oz cheddar cheese", [8, "ounce", "cheddar cheese"]],
  ["2 lb ground chuck", [2, "pound", "ground chuck"]],
  ["1 pound ground beef", [1, "pound", "ground beef"]],
  ["3 cloves garlic", [3, "clove", "garlic"]],
  ["2 sprigs thyme", [2, "sprig", "thyme"]],
  ["1 stick butter", [1, "stick", "butter"]],
  ["1 can black beans", [1, "can", "black beans"]],
  ["2 cans kidney beans", [2, "can", "kidney beans"]],
  ["1 pinch salt", [1, "pinch", "salt"]],
  ["2 cups", [2, "cup", null]],
  ["  2   cups   flour  ", [2, "cup", "all-purpose flour"]],
];

const FRACTIONS: Row[] = [
  ["1/2 cup milk", [0.5, "cup", "milk"]],
  ["1 1/2 cups all-purpose flour", [1.5, "cup", "all-purpose flour"]],
  ["3/4 tsp salt", [0.75, "teaspoon", "salt"]],
  ["1/3 cup olive oil", [THIRD, "cup", "olive oil"]],
  ["2/3 cup buttermilk", [2 * THIRD, "cup", "buttermilk"]],
  ["1½ cups sugar", [1.5, "cup", "sugar"]],
  ["½ teaspoon baking soda", [0.5, "teaspoon", "baking soda"]],
  ["1 ½ cups milk", [1.5, "cup", "milk"]],
  ["¼ tsp black pepper", [0.25, "teaspoon", "black pepper"]],
  ["⅛ teaspoon ground cumin", [0.125, "teaspoon", "ground cumin"]],
  ["2¾ cups flour", [2.75, "cup", "all-purpose flour"]],
  ["1-1/2 cups sugar", [1.5, "cup", "sugar"]],
  ["0.5 cup sour cream", [0.5, "cup", "sour cream"]],
  ["1.25 cups buttermilk", [1.25, "cup", "buttermilk"]],
  [".5 tsp chili powder", [0.5, "teaspoon", "chili powder"]],
  ["1⁄2 cup cocoa powder", [0.5, "cup", "cocoa powder"]],
  ["10 1/2 oz chicken stock", [10.5, "ounce", "chicken stock"]],
  ["1 / 2 cup milk", [0.5, "cup", "milk"]],
  ["2 1/4 cups flour", [2.25, "cup", "all-purpose flour"]],
  ["⅔ cup sugar", [2 * THIRD, "cup", "sugar"]],
];

const RANGES: Row[] = [
  ["2 to 3 cups chicken stock", [2, "cup", "chicken stock"]],
  ["2-3 cloves garlic", [2, "clove", "garlic"]],
  ["2 - 3 carrots", [2, null, "carrot"]],
  ["1–2 tablespoons olive oil", [1, "tablespoon", "olive oil"]],
  ["1 or 2 jalapeños", [1, null, "jalapeño"]],
  ["1/2 to 3/4 cup sugar", [0.5, "cup", "sugar"]],
  ["3 to 4 lb whole chicken", [3, "pound", "whole chicken"]],
  ["4-6 scallions", [4, null, "scallion"]],
  ["1 to 1 1/2 cups milk", [1, "cup", "milk"]],
  ["2 — 3 limes", [2, null, "lime"]],
  ["1 to 2 tsp chili powder", [1, "teaspoon", "chili powder"]],
  // Not ranges: a word that only starts like "to" or "or".
  ["2 tomatoes", [2, null, "+tomatoes"]],
  ["2 oranges", [2, null, "+oranges"]],
];

const ABBREVIATIONS: Row[] = [
  ["2 tbsp butter", [2, "tablespoon", "butter"]],
  ["2 Tbsp. butter", [2, "tablespoon", "butter"]],
  ["2 T butter", [2, "tablespoon", "butter"]],
  ["2 t salt", [2, "teaspoon", "salt"]],
  ["1 t. soda", [1, "teaspoon", "baking soda"]],
  ["1 T. sugar", [1, "tablespoon", "sugar"]],
  ["2 tsp. vanilla", [2, "teaspoon", "vanilla extract"]],
  ["1 c. milk", [1, "cup", "milk"]],
  ["2 1/4 C. flour", [2.25, "cup", "all-purpose flour"]],
  ["3/4 C Sugar", [0.75, "cup", "sugar"]],
  ["2 lbs. ground chuck", [2, "pound", "ground chuck"]],
  ["2 lbs ground beef", [2, "pound", "ground beef"]],
  ["8 oz. sour cream", [8, "ounce", "sour cream"]],
  ["200g sugar", [200, "gram", "sugar"]],
  ["250ml buttermilk", [250, "milliliter", "buttermilk"]],
  ["2 TBSP olive oil", [2, "tablespoon", "olive oil"]],
  ["1 Cup Butter", [1, "cup", "butter"]],
  ["1 TSP salt", [1, "teaspoon", "salt"]],
  ["3 Cloves Garlic", [3, "clove", "garlic"]],
  ["2 Cups Milk", [2, "cup", "milk"]],
  ["1 t. vanilla", [1, "teaspoon", "vanilla extract"]],
  ["1 t. salt", [1, "teaspoon", "salt"]],
  ["1 tbsp baking powder", [1, "tablespoon", "baking powder"]],
  ["1 1/2 cups all purpose flour", [1.5, "cup", "all-purpose flour"]],
  ["1/4 tsp oregano", [0.25, "teaspoon", "dried oregano"]],
  // A one-letter unit in the wrong case is not that unit, so nothing is read from it.
  ["2 G sugar", [2, null, "+g sugar"]],
];

const PLURALS: Row[] = [
  ["2 onions", [2, null, "onion"]],
  ["3 lemons", [3, null, "lemon"]],
  ["2 bay leaves", [2, null, "bay leaf"]],
  ["2 red bell peppers", [2, null, "red bell pepper"]],
  ["6 eggs", [6, null, "egg"]],
  ["2 yellow onions", [2, null, "yellow onion"]],
  ["3 jalapeños", [3, null, "jalapeño"]],
  ["1 cup onions", [1, "cup", "onion"]],
  ["2 cups carrots", [2, "cup", "carrot"]],
  // The household's food has no plural of its own; the parser tries the singular.
  ["2 cups cheddar cheeses", [2, "cup", "cheddar cheese"]],
  ["2 Eggs", [2, null, "egg"]],
  ["4 green onions", [4, null, "scallion"]],
];

const NOTES: Row[] = [
  ["2 cups flour, sifted", [2, "cup", "all-purpose flour", "sifted"]],
  ["1 egg, slightly beaten", [1, null, "egg", "slightly beaten"]],
  ["1 C. Butter, Softened", [1, "cup", "butter", "softened"]],
  ["1 onion, finely chopped", [1, null, "onion", "finely chopped"]],
  ["3 cloves garlic, minced", [3, "clove", "garlic", "minced"]],
  ["2 carrots, peeled and diced", [2, null, "carrot", "peeled and diced"]],
  ["1 lemon, juiced", [1, null, "lemon", "juiced"]],
  [
    "1 cup cheddar cheese, shredded, plus more for serving",
    [1, "cup", "cheddar cheese", "shredded, plus more for serving"],
  ],
  ["3/4 C B. Sugar - Firmly Packed", [0.75, "cup", "brown sugar", "firmly packed"]],
  ["1 lime – cut into wedges", [1, null, "lime", "cut into wedges"]],
  ["2 tablespoons butter; cold", [2, "tablespoon", "butter", "cold"]],
  ["1 tsp salt, or to taste", [1, "teaspoon", "salt", "or to taste"]],
  ["black pepper, freshly ground", [null, null, "black pepper", "freshly ground"]],
];

const PREPARED: Row[] = [
  ["4 tbsp butter melted", [4, "tablespoon", "butter", "melted"]],
  ["1/3 c. minced onions", [THIRD, "cup", "onion", "minced"]],
  ["1/3 c. minced green pepper", [THIRD, "cup", "green bell pepper", "minced"]],
  ["1 cup chopped carrots", [1, "cup", "carrot", "chopped"]],
  ["2 cloves garlic minced", [2, "clove", "garlic", "minced"]],
  ["1 large onion", [1, null, "onion", "large"]],
  ["2 large eggs", [2, null, "egg", "large"]],
  ["1 medium yellow onion, diced", [1, null, "yellow onion", "medium, diced"]],
  ["1 small lemon", [1, null, "lemon", "small"]],
  ["1 cup finely chopped celery", [1, "cup", "celery", "finely chopped"]],
  ["2 tablespoons melted butter", [2, "tablespoon", "butter", "melted"]],
  ["1 cup shredded cheddar cheese", [1, "cup", "cheddar cheese", "shredded"]],
  ["3 eggs beaten", [3, null, "egg", "beaten"]],
  ["2 eggs, lightly beaten", [2, null, "egg", "lightly beaten"]],
  ["1/2 cup butter softened", [0.5, "cup", "butter", "softened"]],
  ["1 heaping teaspoon baking powder", [1, "teaspoon", "baking powder", "heaping"]],
  ["1 scant cup sugar", [1, "cup", "sugar", "scant"]],
  ["1 small can tomato paste", [1, "can", "tomato paste", "small"]],
  ["2 sprigs fresh thyme", [2, "sprig", "thyme", "fresh"]],
  ["1 cup fresh cilantro", [1, "cup", "cilantro", "fresh"]],
  ["1/4 cup chopped fresh cilantro", [0.25, "cup", "cilantro", "chopped fresh"]],
  ["2 ripe limes", [2, null, "lime", "ripe"]],
  ["1 Large Onion, Diced", [1, null, "onion", "large, diced"]],
];

/** A word that describes is part of the name when the household says so. */
const NAMED_WITH_A_DESCRIPTION: Row[] = [
  ["1 1/2 c. cooked rice", [1.5, "cup", "cooked rice"]],
  ["1 can crushed tomatoes", [1, "can", "crushed tomatoes"]],
  ["1 tsp dried oregano", [1, "teaspoon", "dried oregano"]],
  ["1 tsp ground cumin", [1, "teaspoon", "ground cumin"]],
  ["1 whole chicken", [1, null, "whole chicken"]],
  ["1 tsp smoked paprika", [1, "teaspoon", "smoked paprika"]],
  ["1 tsp ground cardamom", [1, "teaspoon", "ground cardamom"]],
];

const BRACKETS: Row[] = [
  ["1 cup (2 sticks) butter", [1, "cup", "butter", "2 sticks"]],
  ["1 cup (2 sticks) butter, softened", [1, "cup", "butter", "2 sticks, softened"]],
  ["2 eggs (large)", [2, null, "egg", "large"]],
  ["1 (15-ounce) can black beans, drained", [1, "can", "black beans", "15-ounce, drained"]],
  [
    "1 (15 oz) can kidney beans, drained and rinsed",
    [1, "can", "kidney beans", "15 oz, drained and rinsed"],
  ],
  ["2 (14.5 oz) cans crushed tomatoes", [2, "can", "crushed tomatoes", "14.5 oz"]],
  [
    "1 - (15 1/2 oz can) Chef Boy-ar-Dee spaghetti sauce with mushrooms",
    [1, "can", "spaghetti sauce", "15 1/2 oz, Chef Boy-ar-Dee, with mushrooms"],
  ],
  ["1 cup milk (whole)", [1, "cup", "milk", "whole"]],
  ["3 carrots (about 1 cup), diced", [3, null, "carrot", "about 1 cup, diced"]],
  ["1 onion (optional)", [1, null, "onion", "optional"]],
  ["2 tbsp olive oil (extra virgin)", [2, "tablespoon", "olive oil", "extra virgin"]],
  ["1 lemon (zest only", [1, null, "lemon", "zest only"]],
];

const PACKAGES: Row[] = [
  ["1 - 12 oz Chocolate Chips", [12, "ounce", "chocolate chips"]],
  ["1 15-ounce can black beans", [1, "can", "black beans", "15-ounce"]],
  ["2 14 oz cans crushed tomatoes", [2, "can", "crushed tomatoes", "14 oz"]],
  ["2 x 400 g cans crushed tomatoes", [2, "can", "crushed tomatoes", "400 g"]],
  ["2 - 8 oz sour cream", [16, "ounce", "sour cream"]],
  ["1 28-oz can crushed tomatoes", [1, "can", "crushed tomatoes", "28-oz"]],
  ["1 6 oz can tomato paste", [1, "can", "tomato paste", "6 oz"]],
];

const NEW_FOODS: Row[] = [
  ["2 cups rolled oats", [2, "cup", "+rolled oats"]],
  ["1 tbsp honey", [1, "tablespoon", "+honey"]],
  ["2 cups chopped walnuts", [2, "cup", "+walnuts", "chopped"]],
  ["1 lb boneless skinless chicken thighs", [1, "pound", "+boneless skinless chicken thighs"]],
  ["3 bananas, mashed", [3, null, "+bananas", "mashed"]],
  ["1 cup plain yogurt, at room temperature", [1, "cup", "+plain yogurt", "at room temperature"]],
  ["1 lb Italian sausage", [1, "pound", "+italian sausage"]],
  ["2 cups baby spinach, packed", [2, "cup", "+baby spinach", "packed"]],
  ["1 tbsp fresh ginger, grated", [1, "tablespoon", "+fresh ginger", "grated"]],
  ["1 cup Rolled Oats", [1, "cup", "+rolled oats"]],
  ["2 cups water", [2, "cup", "+water"]],
];

/** A food whose name ends in, or starts with, a food the household has is a different food. */
const NOT_THE_FOOD_INSIDE: Row[] = [
  ["1 cup peanut butter", [1, "cup", "+peanut butter"]],
  ["1 Cup Peanut Butter", [1, "cup", "+peanut butter"]],
  ["2 cups chicken broth", [2, "cup", "+chicken broth"]],
  ["1 can coconut milk", [1, "can", "+coconut milk"]],
  ["1 tsp almond extract", [1, "teaspoon", "+almond extract"]],
  ["2 tbsp soy sauce", [2, "tablespoon", "+soy sauce"]],
  ["1 cup cream of mushroom soup", [1, "cup", "+cream of mushroom soup"]],
  ["1 cup powdered sugar", [1, "cup", "+powdered sugar"]],
  ["2 tbsp lemon juice", [2, "tablespoon", "+lemon juice"]],
  ["1 tsp garlic powder", [1, "teaspoon", "+garlic powder"]],
  ["1 cup Greek yogurt", [1, "cup", "+greek yogurt"]],
  ["1 tbsp butter beans", [1, "tablespoon", "+butter beans"]],
  ["2 cups egg noodles", [2, "cup", "+egg noodles"]],
  ["1 tsp onion powder", [1, "teaspoon", "+onion powder"]],
];

const TRAILING: Row[] = [
  ["2 tbsp olive oil for frying", [2, "tablespoon", "olive oil", "for frying"]],
  [
    "1 cup cheddar cheese plus more for topping",
    [1, "cup", "cheddar cheese", "plus more for topping"],
  ],
  ["1 tsp black pepper to taste", [1, "teaspoon", "black pepper", "to taste"]],
  ["2 tbsp butter or margarine", [2, "tablespoon", "butter", "or margarine"]],
  ["1 cup milk at room temperature", [1, "cup", "milk", "at room temperature"]],
  ["1 lemon for serving", [1, null, "lemon", "for serving"]],
  ["1 tsp salt or to taste", [1, "teaspoon", "salt", "or to taste"]],
  ["2 limes, optional", [2, null, "lime", "optional"]],
  ["1 jalapeño if desired", [1, null, "jalapeño", "if desired"]],
];

const WORDS_FOR_AMOUNTS: Row[] = [
  ["one egg", [1, null, "egg"]],
  ["two cups flour", [2, "cup", "all-purpose flour"]],
  ["a pinch of salt", [1, "pinch", "salt"]],
  ["a stick of butter", [1, "stick", "butter"]],
  ["three cloves of garlic", [3, "clove", "garlic"]],
  ["A Pinch of Salt", [1, "pinch", "salt"]],
  ["Twelve eggs", [12, null, "egg"]],
];

const OF_AND_LEAD_INS: Row[] = [
  ["2 cloves of garlic", [2, "clove", "garlic"]],
  ["1 cup of milk", [1, "cup", "milk"]],
  ["1 pinch of salt", [1, "pinch", "salt"]],
  ["- 2 cups flour", [2, "cup", "all-purpose flour"]],
  ["• 1 tsp salt", [1, "teaspoon", "salt"]],
  ["* 3 eggs", [3, null, "egg"]],
  ["about 2 cups milk", [2, "cup", "milk"]],
  ["approx. 1 lb ground beef", [1, "pound", "ground beef"]],
  ["Approximately 3 carrots", [3, null, "carrot"]],
  ["2 cups flour", [2, "cup", "all-purpose flour"]],
];

const NO_AMOUNT: Row[] = [
  ["pinch of salt", [null, "pinch", "salt"]],
  ["Pinch salt", [null, "pinch", "salt"]],
  ["sprig of thyme", [null, "sprig", "thyme"]],
  ["Salt", [null, null, "salt"]],
  ["butter", [null, null, "butter"]],
  ["Butter for greasing", [null, null, "butter", "for greasing"]],
  ["Olive oil", [null, null, "olive oil"]],
  ["Fresh cilantro", [null, null, "cilantro", "fresh"]],
];

/** Lines to leave alone. Each stays exactly as it was written. */
const LEFT_AS_WRITTEN: Row[] = [
  ["Salt and pepper to taste", null],
  ["For the frosting:", null],
  ["FILLING:", null],
  ["Cooking spray", null],
  ["", null],
  ["   ", null],
  ["Juice of one lemon", null],
  ["Zest and juice of 2 limes", null],
  ["Vegetable oil, for frying", null],
  ["Handful of parsley", null],
  ["A few sprigs of thyme", null],
  ["Water", null],
  ["2", null],
  ["12", null],
  ["1 12 mystery things", null],
  ["2 3-inch cinnamon sticks", null],
  ["Preheat the oven to 350°F.", null],
  ["To serve: lime wedges", null],
  ["Ice", null],
  ["a ripe banana", null],
  ["An apple", null],
  ["Toppings of your choice", null],
  ["g", null],
  ["T", null],
  ["oz chocolate", null],
  ["c", null],
  [`A long line that is a step and not an ingredient ${"word ".repeat(40)}`, null],
];

const GROUPS: [string, Row[]][] = [
  ["a plain amount, unit and food", PLAIN],
  ["fractions", FRACTIONS],
  ["ranges", RANGES],
  ["abbreviations", ABBREVIATIONS],
  ["plurals", PLURALS],
  ["notes", NOTES],
  ["a word for how the food is prepared", PREPARED],
  ["a describing word that is part of the food's name", NAMED_WITH_A_DESCRIPTION],
  ["brackets", BRACKETS],
  ["a number of packages and their size", PACKAGES],
  ["a food the household does not have", NEW_FOODS],
  ["a food with another food's name inside it", NOT_THE_FOOD_INSIDE],
  ["what comes after the food", TRAILING],
  ["an amount in words", WORDS_FOR_AMOUNTS],
  ["'of', bullets and 'about'", OF_AND_LEAD_INS],
  ["no amount", NO_AMOUNT],
  ["lines to leave alone", LEFT_AS_WRITTEN],
];

describe("the ingredient line parser, on its corpus", () => {
  for (const [name, rows] of GROUPS) {
    describe(name, () => {
      it.each(rows)("%j", (text, reading) => {
        const result = parse(text);
        const want = expected(reading);
        if (want === null || result === null) {
          expect(result).toEqual(want);
          return;
        }
        expect({ ...result, quantity: null }).toEqual({ ...want, quantity: null });
        if (want.quantity === null) {
          expect(result.quantity).toBeNull();
        } else {
          expect(result.quantity).toBeCloseTo(want.quantity, 9);
        }
      });
    });
  }

  it("has at least 150 lines, no line twice", () => {
    const texts = GROUPS.flatMap(([, rows]) => rows.map(([text]) => text));

    expect(texts.length).toBeGreaterThanOrEqual(150);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("covers what the plan asks of it", () => {
    const sizes = Object.fromEntries(GROUPS.map(([name, rows]) => [name, rows.length]));

    for (const group of ["fractions", "ranges", "abbreviations", "plurals", "brackets"]) {
      expect(sizes[group]).toBeGreaterThanOrEqual(10);
    }
    expect(sizes["lines to leave alone"]).toBeGreaterThanOrEqual(20);
  });
});

describe("the six lines from the sample cards", () => {
  it.each([
    ["4 tbsp butter melted", [4, "tablespoon", "butter", "melted"]],
    ["2 lbs. ground chuck", [2, "pound", "ground chuck"]],
    ["1 t. soda", [1, "teaspoon", "baking soda"]],
    ["3/4 C B. Sugar - Firmly Packed", [0.75, "cup", "brown sugar", "firmly packed"]],
    ["1 - 12 oz Chocolate Chips", [12, "ounce", "chocolate chips"]],
    [
      "1 - (15 1/2 oz can) Chef Boy-ar-Dee spaghetti sauce with mushrooms",
      [1, "can", "spaghetti sauce", "15 1/2 oz, Chef Boy-ar-Dee, with mushrooms"],
    ],
  ] as Row[])("%j", (text, reading) => {
    expect(parse(text)).toEqual(expected(reading));
  });

  it("does not misread the hardest one in a household that has no such food", () => {
    const withoutSauce = ingredientParser({
      units: fixtureUnits,
      foods: fixtureFoods.filter((food) => food.name !== "spaghetti sauce"),
    });

    const result = withoutSauce(
      "1 - (15 1/2 oz can) Chef Boy-ar-Dee spaghetti sauce with mushrooms",
    );

    // One can, and the whole name offered as a new food for the cook to correct. No food is guessed.
    expect(result).toEqual({
      quantity: 1,
      unitId: unitId("can"),
      foodId: null,
      newFood: "chef boy-ar-dee spaghetti sauce",
      note: "15 1/2 oz, with mushrooms",
    });
  });
});

describe("what the parser never does", () => {
  const everyLine = GROUPS.flatMap(([, rows]) => rows.map(([text]) => text));

  it("never changes the text it is given", () => {
    for (const text of everyLine) {
      const copy = `${text}`;
      parse(text);
      expect(text).toBe(copy);
    }
  });

  it("never names a food or a unit the household does not have", () => {
    const unitIds = new Set(fixtureUnits.map((unit) => unit.id));
    const foodIds = new Set(fixtureFoods.map((food) => food.id));

    for (const text of everyLine) {
      const result = parse(text);
      if (result?.unitId) {
        expect(unitIds.has(result.unitId)).toBe(true);
      }
      if (result?.foodId) {
        expect(foodIds.has(result.foodId)).toBe(true);
      }
      // A line has a food the household has, or a name for a new one, never both.
      expect(result?.foodId && result?.newFood).toBeFalsy();
    }
  });

  it("offers every food as new, and reads no unit, in a household with empty lists", () => {
    const empty = ingredientParser({ units: [], foods: [] });

    expect(empty("2 cups flour, sifted")).toEqual({
      quantity: 2,
      unitId: null,
      foodId: null,
      newFood: "cups flour",
      note: "sifted",
    });
    expect(empty("Salt")).toBeNull();
  });

  it("needs nothing but the lists it is given: no network, no clock", () => {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((...args: unknown[]) => {
      calls.push(String(args[0]));
      return Promise.reject(new Error("the parser must not use the network"));
    }) as typeof fetch;
    try {
      for (const text of everyLine) {
        parse(text);
      }
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(calls).toEqual([]);
  });

  it("gives the same reading every time", () => {
    for (const text of everyLine.slice(0, 40)) {
      expect(parse(text)).toEqual(parseIngredientLine(text, lists));
    }
  });

  it("does not choke on text that is not a recipe line at all", () => {
    for (const text of [
      "((((",
      "))))",
      "1/0 cup",
      "1//2",
      "🍕 2 cups",
      "\u0000",
      "-",
      "- -",
      "x",
      "2 x",
      "1 -",
      "1 - -",
      ",,,",
      "2 ,",
      "999999999999999999999 cups flour",
      "１ cup",
    ]) {
      expect(() => parse(text)).not.toThrow();
    }
  });
});

describe("readQuantity", () => {
  it("reads whole numbers, decimals, fractions, mixed numbers and fraction characters", () => {
    expect(readQuantity("2 cups")).toEqual({ quantity: 2, rest: " cups" });
    expect(readQuantity("0.5")).toEqual({ quantity: 0.5, rest: "" });
    expect(readQuantity(".25 tsp")).toEqual({ quantity: 0.25, rest: " tsp" });
    expect(readQuantity("1/2")).toEqual({ quantity: 0.5, rest: "" });
    expect(readQuantity("1 1/2 cups")).toEqual({ quantity: 1.5, rest: " cups" });
    expect(readQuantity("1-1/2 cups")).toEqual({ quantity: 1.5, rest: " cups" });
    expect(readQuantity("1½")).toEqual({ quantity: 1.5, rest: "" });
    expect(readQuantity("¾ cup")).toEqual({ quantity: 0.75, rest: " cup" });
  });

  it("reads nothing from text that does not start with an amount, or from zero", () => {
    expect(readQuantity("cups")).toBeNull();
    expect(readQuantity("a few")).toBeNull();
    expect(readQuantity("0")).toBeNull();
    expect(readQuantity("1/0")).toEqual({ quantity: 1, rest: "/0" });
    expect(readQuantity("")).toBeNull();
  });
});
