import {
  beefChili,
  cardamomCookies,
  cardMeatLoaf,
  cinnamonToast,
  lentilSoup,
} from "@recipeflare/schema/fixtures";
import { describe, expect, it } from "vitest";
import { isTitleOnly, linkHost, nutritionFacts, parseScale, recipeFacts } from "./recipeFacts";

const labels = (facts: { label: string }[]) => facts.map((fact) => fact.label);

describe("recipeFacts", () => {
  it("lists the times, servings and yield a recipe states", () => {
    expect(recipeFacts(beefChili)).toEqual([
      { label: "Prep", value: "30 min" },
      { label: "Cook", value: "2 hr" },
      { label: "Total", value: "2 hr 30 min" },
      { label: "Serves", value: "8" },
      { label: "Makes", value: "3 quarts" },
    ]);
  });

  it("adds prep and cook when no total is given", () => {
    expect(recipeFacts(cardamomCookies)).toContainEqual({ label: "Total", value: "30 min" });
  });

  it("does not make a total out of one time alone", () => {
    expect(labels(recipeFacts(cardMeatLoaf))).toEqual(["Cook"]);
  });

  it("scales servings and yield, and leaves the times alone", () => {
    const doubled = recipeFacts(beefChili, 2);
    expect(doubled).toContainEqual({ label: "Serves", value: "16" });
    expect(doubled).toContainEqual({ label: "Makes", value: "6 quarts" });
    expect(doubled).toContainEqual({ label: "Cook", value: "2 hr" });
    expect(recipeFacts(beefChili, 0.5)).toContainEqual({ label: "Makes", value: "1½ quarts" });
  });

  it("has nothing to say about a recipe that is only a title", () => {
    expect(recipeFacts(cinnamonToast)).toEqual([]);
  });
});

describe("nutritionFacts", () => {
  it("lists only the values the recipe states, calories first", () => {
    const facts = nutritionFacts(beefChili.nutrition);
    expect(facts).toHaveLength(6);
    expect(facts[0]?.label).toBe("Calories");
    expect(nutritionFacts(null)).toEqual([]);
  });
});

describe("parseScale", () => {
  it("reads the four amounts, as a number or as text", () => {
    expect(parseScale(2)).toBe(2);
    expect(parseScale("0.5")).toBe(0.5);
    expect(parseScale(3)).toBe(3);
  });

  it("falls back to the recipe as written", () => {
    expect(parseScale(undefined)).toBe(1);
    expect(parseScale(7)).toBe(1);
    expect(parseScale("lots")).toBe(1);
  });
});

describe("linkHost", () => {
  it("names the site without the www", () => {
    expect(linkHost("https://www.example.com/recipes/soup")).toBe("example.com");
    expect(linkHost(lentilSoup.sourceUrl)).toBe("example.com");
  });

  it("is null for nothing, or for text that is not a link", () => {
    expect(linkHost(null)).toBeNull();
    expect(linkHost("grandma's notebook")).toBeNull();
  });
});

describe("isTitleOnly", () => {
  it("tells a bare title from a recipe with anything else", () => {
    expect(isTitleOnly(cinnamonToast)).toBe(true);
    expect(isTitleOnly(cardMeatLoaf)).toBe(false);
    expect(isTitleOnly({ ...cinnamonToast, sourceName: "Dad" })).toBe(false);
  });
});
