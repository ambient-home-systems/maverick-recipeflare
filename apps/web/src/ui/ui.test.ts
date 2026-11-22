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
  it("gives the time, the first category and the tags", () => {
    expect(recipeMeta(toRecipeSummary(roastChicken))).toBe(
      "1 hr 55 min · Dinner · Family favorite, Holiday",
    );
  });

  it("credits the source before the tags", () => {
    expect(recipeMeta(toRecipeSummary(lentilSoup))).toBe(
      "40 min · Soup · From Example Kitchen · Vegetarian, Weeknight",
    );
  });

  it("names two tags and counts the rest", () => {
    const summary = toRecipeSummary(roastChicken);
    const tags = [...summary.tags, { ...summary.tags[0], name: "Sunday" }, summary.tags[0]].map(
      (tag, index) => ({ ...summary.tags[0], ...tag, id: `tag-${index}` }),
    ) as typeof summary.tags;
    expect(recipeMeta({ ...summary, tags })).toBe(
      "1 hr 55 min · Dinner · Family favorite, Holiday and 2 more",
    );
  });

  it("leaves the category out behind that category's divider", () => {
    expect(recipeMeta(toRecipeSummary(roastChicken), { showCategory: false })).toBe(
      "1 hr 55 min · Family favorite, Holiday",
    );
  });

  it("leaves out what a recipe does not state", () => {
    expect(recipeMeta(toRecipeSummary(cardPancakes))).toBe("Breakfast");
    expect(recipeMeta(toRecipeSummary(cinnamonToast))).toBe("");
  });

  it("adds prep and cook time when no total is given", () => {
    const summary = { ...toRecipeSummary(roastChicken), totalTimeSeconds: null };
    expect(recipeMeta(summary)).toBe("1 hr 40 min · Dinner · Family favorite, Holiday");
  });
});
