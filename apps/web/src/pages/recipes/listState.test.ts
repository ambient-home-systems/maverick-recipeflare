import { describe, expect, it } from "vitest";
import {
  EMPTY_LIST_STATE,
  effectiveSort,
  filterCount,
  isNarrowed,
  parseListSearch,
  toListSearch,
} from "./listState";

describe("the list's state in the page address", () => {
  it("is empty for a bare address", () => {
    expect(parseListSearch({})).toEqual(EMPTY_LIST_STATE);
    expect(toListSearch(EMPTY_LIST_STATE)).toEqual({});
  });

  it("survives a round trip", () => {
    const state = {
      q: "lemon soup",
      category: "dinner",
      tags: ["weeknight", "vegetarian"],
      tools: ["dutch-oven"],
      foods: ["red-lentils"],
      sort: "title" as const,
    };
    expect(toListSearch(state)).toEqual({
      q: "lemon soup",
      category: "dinner",
      tags: "weeknight,vegetarian",
      tools: "dutch-oven",
      foods: "red-lentils",
      sort: "title",
    });
    expect(parseListSearch(toListSearch(state))).toEqual(state);
  });

  it("reads a search for a number or a word like true as text", () => {
    // The router parses `?q=12` to a number and `?q=true` to a boolean.
    expect(parseListSearch({ q: 12 }).q).toBe("12");
    expect(parseListSearch({ q: true }).q).toBe("true");
  });

  it("ignores what it does not understand", () => {
    expect(parseListSearch({ sort: "random", tags: ["a"], category: { x: 1 } })).toEqual(
      EMPTY_LIST_STATE,
    );
  });

  it("drops repeats and blanks from a filter list", () => {
    expect(parseListSearch({ tags: "holiday,,holiday, weeknight" }).tags).toEqual([
      "holiday",
      "weeknight",
    ]);
  });

  it("leaves the default sort out of the address", () => {
    expect(toListSearch({ ...EMPTY_LIST_STATE, sort: "changed" })).toEqual({});
    expect(toListSearch({ ...EMPTY_LIST_STATE, q: "soup", sort: "match" })).toEqual({ q: "soup" });
    expect(toListSearch({ ...EMPTY_LIST_STATE, q: "soup", sort: "changed" })).toEqual({
      q: "soup",
      sort: "changed",
    });
  });
});

describe("the sort in force", () => {
  it("is recently changed, and best match while searching", () => {
    expect(effectiveSort(EMPTY_LIST_STATE)).toBe("changed");
    expect(effectiveSort({ q: "soup", sort: null })).toBe("match");
  });

  it("is never best match with nothing to match", () => {
    expect(effectiveSort({ q: " ", sort: "match" })).toBe("changed");
  });

  it("keeps a choice the cook made", () => {
    expect(effectiveSort({ q: "soup", sort: "title" })).toBe("title");
  });
});

describe("narrowing", () => {
  it("counts tags, tools and foods as filters, and not the category", () => {
    const state = { ...EMPTY_LIST_STATE, category: "soup", tags: ["a"], foods: ["b", "c"] };
    expect(filterCount(state)).toBe(3);
    expect(filterCount({ ...EMPTY_LIST_STATE, category: "soup" })).toBe(0);
  });

  it("treats a search, a category or a filter as narrowing the list", () => {
    expect(isNarrowed(EMPTY_LIST_STATE)).toBe(false);
    expect(isNarrowed({ ...EMPTY_LIST_STATE, q: "x" })).toBe(true);
    expect(isNarrowed({ ...EMPTY_LIST_STATE, category: "soup" })).toBe(true);
    expect(isNarrowed({ ...EMPTY_LIST_STATE, tools: ["griddle"] })).toBe(true);
  });
});
