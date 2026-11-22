import { fixtureFoods, fixtureUnits } from "@recipeflare/schema/fixtures";
import { describe, expect, it } from "vitest";
import { makeMockParser } from "./mockParser";

const parse = makeMockParser(fixtureUnits, fixtureFoods);
const unit = (name: string) => fixtureUnits.find((u) => u.name === name)?.id;
const food = (name: string) => fixtureFoods.find((f) => f.name === name)?.id;

// The stand-in is only as good as the mock needs. These are the lines the mock
// screens invite a tester to type, and the cards' hardest ones.
describe("the stand-in line parser", () => {
  it("reads amount, unit, food and note", () => {
    expect(parse("2 cups all-purpose flour, sifted")).toEqual({
      quantity: 2,
      unitId: unit("cup"),
      foodId: food("all-purpose flour"),
      newFood: null,
      note: "sifted",
    });
  });

  it("tells a teaspoon from a tablespoon by the case of one letter", () => {
    expect(parse("1 t. soda")?.unitId).toBe(unit("teaspoon"));
    expect(parse("1 T. soda")?.unitId).toBe(unit("tablespoon"));
    expect(parse("1 t. soda")?.foodId).toBe(food("baking soda"));
  });

  it("finds where the food ends when there is no comma before the note", () => {
    expect(parse("4 tbsp butter melted")).toMatchObject({
      quantity: 4,
      unitId: unit("tablespoon"),
      foodId: food("butter"),
      note: "melted",
    });
  });

  it("carries a food the household does not have as a new food, and creates nothing", () => {
    expect(parse("3 cups saffron rice")).toEqual({
      quantity: 3,
      unitId: unit("cup"),
      foodId: null,
      newFood: "saffron rice",
      note: "",
    });
  });

  it("leaves a line it cannot read, or could misread, as written", () => {
    expect(parse("a knob of something for the pan")).toBeNull();
    expect(parse("1 - (15 1/2 oz can) Chef Boy-ar-Dee spaghetti sauce with mushrooms")).toBeNull();
  });
});
