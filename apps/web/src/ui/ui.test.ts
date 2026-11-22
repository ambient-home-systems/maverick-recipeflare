import { toRecipeSummary } from "@recipeflare/schema";
import {
  cardPancakes,
  cinnamonToast,
  lentilSoup,
  roastChicken,
} from "@recipeflare/schema/fixtures";
import { describe, expect, it } from "vitest";
import { recipeMeta } from "./RecipeRow";
import { assignStocks, STOCKS } from "./stock";

describe("assignStocks", () => {
  it("gives each category its own colour, in order", () => {
    const stocks = assignStocks(["a", "b", "c"]);
    expect([...stocks.values()]).toEqual(["buff", "salmon", "sky"]);
  });

  it("repeats the colours after five categories", () => {
    const stocks = assignStocks(["a", "b", "c", "d", "e", "f"]);
    expect(stocks.get("f")).toBe(STOCKS[0]);
  });
});

describe("recipeMeta", () => {
  it("gives the time, the first category and the first tag", () => {
    expect(recipeMeta(toRecipeSummary(roastChicken))).toBe(
      "1 hr 55 min · Dinner · Family favorite",
    );
  });

  it("credits the source in place of a tag", () => {
    expect(recipeMeta(toRecipeSummary(lentilSoup))).toBe("40 min · Soup · From Example Kitchen");
  });

  it("leaves out what a recipe does not state", () => {
    expect(recipeMeta(toRecipeSummary(cardPancakes))).toBe("Breakfast");
    expect(recipeMeta(toRecipeSummary(cinnamonToast))).toBe("");
  });

  it("adds prep and cook time when no total is given", () => {
    const summary = { ...toRecipeSummary(roastChicken), totalTimeSeconds: null };
    expect(recipeMeta(summary)).toBe("1 hr 40 min · Dinner · Family favorite");
  });
});
