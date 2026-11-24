import { describe, expect, it } from "vitest";
import { namedIngredients, statedStepTime } from "./step-details";

describe("the time a step states", () => {
  it.each([
    ["Bake at 350 until pale gold, about 15 minutes.", 900],
    ["Simmer for 1 hour and 30 minutes.", 5400],
    ["Cook about 1 1/2 HRS until the meat is tender.", 5400],
    ["Rest the dough 45 min.", 2700],
    ["Chill for 2 hrs. Slice.", 7200],
    ["Whisk for 30 seconds.", 30],
    ["Roast 1½ hours.", 5400],
  ])("of %j is %i seconds", (step, seconds) => {
    expect(statedStepTime(step)).toBe(seconds);
  });

  it.each([
    // No time at all, and a number that is not one.
    ["Bake at 350 until golden."],
    ["Stir in the flour."],
    ["Pour into a 9 inch pan."],
    // A range or a choice is not one time.
    ["Bake 20 to 25 minutes."],
    ["Bake 20-25 minutes."],
    ["Fry 2 or 3 minutes a side."],
    ["Simmer 1 to 1 1/2 hours."],
    // Two times: the step does not say which is its own.
    ["Cook 15 minutes, then add the peas and cook 5 minutes more."],
    // How often, not how long.
    ["Simmer, stirring every 5 minutes."],
    // A bare letter is not surely a unit of time.
    ["Blend 2 m."],
  ])("of %j is none", (step) => {
    expect(statedStepTime(step)).toBeNull();
  });
});

describe("the ingredients a step names", () => {
  const butter = { id: "butter", names: ["butter"] };
  const flour = { id: "flour", names: ["all-purpose flour", "flour"] };
  const eggs = { id: "eggs", names: ["egg", "eggs"] };
  const tomatoes = { id: "tomatoes", names: ["tomato", "tomatoes"] };
  const all = [butter, flour, eggs, tomatoes];

  it("are those whose food it has, in the recipe's order", () => {
    expect(namedIngredients("Beat the eggs, then rub the butter into the flour.", all)).toEqual([
      "butter",
      "flour",
      "eggs",
    ]);
  });

  it("are found in the singular or the plural, and whatever the capitals", () => {
    expect(namedIngredients("Add one EGG and the chopped Tomato.", all)).toEqual([
      "eggs",
      "tomatoes",
    ]);
  });

  it("are none when the step names none", () => {
    expect(namedIngredients("Stir in the rest and bake.", all)).toEqual([]);
    expect(namedIngredients("", all)).toEqual([]);
  });

  it("do not include a line with no food", () => {
    const written = { id: "as-written", names: [null, undefined, ""] };
    expect(namedIngredients("Season to taste.", [written])).toEqual([]);
  });

  it("do not take a short name from inside a longer one that is also an ingredient", () => {
    const peanut = { id: "peanut-butter", names: ["peanut butter"] };
    const both = [butter, peanut];

    expect(namedIngredients("Stir in the peanut butter.", both)).toEqual(["peanut-butter"]);
    // Named on its own elsewhere in the step, the short one is linked too.
    expect(namedIngredients("Melt the butter. Stir in the peanut butter.", both)).toEqual([
      "butter",
      "peanut-butter",
    ]);
  });

  it("link neither of two lines that share a name: the step does not say which", () => {
    const base = { id: "flour-base", names: ["flour"] };
    const top = { id: "flour-top", names: ["flour"] };

    expect(namedIngredients("Rub the butter into the flour.", [butter, base, top])).toEqual([
      "butter",
    ]);
  });

  it("do not match part of a word", () => {
    expect(namedIngredients("Butterfly the chicken.", [butter])).toEqual([]);
    expect(namedIngredients("Dust with eggshell-white sugar.", [eggs])).toEqual([]);
  });
});
