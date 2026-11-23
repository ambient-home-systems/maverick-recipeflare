import type { Recipe } from "@recipeflare/schema";
import { fixtureRecipes } from "@recipeflare/schema/fixtures";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RecipeListRequest } from "../../api/queries";
import { listOffline, recipesOnDevice } from "./offlineList";

const ask = (extra: Partial<RecipeListRequest> = {}): RecipeListRequest => ({
  q: "",
  category: null,
  tags: [],
  tools: [],
  foodIds: [],
  sort: "title",
  ...extra,
});
const titles = (extra: Partial<RecipeListRequest> = {}) =>
  listOffline(fixtureRecipes, ask(extra)).map((recipe) => recipe.title);
const having = <T>(pick: (recipe: Recipe) => T | undefined) => {
  for (const recipe of fixtureRecipes) {
    const found = pick(recipe);
    if (found !== undefined) {
      return { recipe, found };
    }
  }
  throw new Error("no fixture recipe has that");
};

describe("the recipe list with no connection", () => {
  it("lists every recipe on the device by title when nothing is asked for", () => {
    const all = titles();

    expect(all).toHaveLength(fixtureRecipes.length);
    expect(all).toEqual(
      [...all].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    );
  });

  it("finds a recipe by a word of its title, whatever the capitals or accents", () => {
    const { recipe } = having((entry) => (entry.title.split(" ").length > 1 ? entry : undefined));
    const word = recipe.title.split(" ")[0] ?? "";

    expect(titles({ q: word.toUpperCase() })).toContain(recipe.title);
    expect(titles({ q: "zzzz-no-such-word" })).toEqual([]);
  });

  it("needs every word typed, and looks in ingredients too", () => {
    const { recipe, found } = having(
      (entry) =>
        entry.ingredientSections.flatMap((s) => s.items).find((line) => line.food)?.food?.name,
    );
    const titleWord = recipe.title.split(" ")[0] ?? "";

    expect(titles({ q: `${titleWord} ${found}` })).toContain(recipe.title);
    expect(titles({ q: `${titleWord} zzzz` })).toEqual([]);
  });

  it("filters by category, by every tag and tool asked for, and by food", () => {
    const category = having((entry) => entry.categories[0]);
    const tag = having((entry) => entry.tags[0]);
    const food = having(
      (entry) =>
        entry.ingredientSections.flatMap((s) => s.items).find((line) => line.food)?.food ??
        undefined,
    );

    const inCategory = listOffline(fixtureRecipes, ask({ category: category.found.slug }));
    expect(inCategory.length).toBeGreaterThan(0);
    expect(inCategory.every((r) => r.categories.some((c) => c.slug === category.found.slug))).toBe(
      true,
    );
    expect(titles({ tags: [tag.found.slug] })).toContain(tag.recipe.title);
    expect(titles({ tags: [tag.found.slug, "no-such-tag"] })).toEqual([]);
    expect(titles({ tools: ["no-such-tool"] })).toEqual([]);
    expect(titles({ foodIds: [food.found.id] })).toContain(food.recipe.title);
    expect(titles({ foodIds: [food.found.id, "00000000-0000-7000-8000-00000000dead"] })).toEqual(
      [],
    );
  });

  it("sorts by last changed and by newest", () => {
    const changed = listOffline(fixtureRecipes, ask({ sort: "changed" })).map((r) => r.updatedAt);
    const newest = listOffline(fixtureRecipes, ask({ sort: "newest" })).map((r) => r.createdAt);

    expect(changed).toEqual([...changed].sort().reverse());
    expect(newest).toEqual([...newest].sort().reverse());
  });

  it("reads the recipes from the app's own cache, each once", () => {
    const client = new QueryClient();
    const [first, second] = fixtureRecipes;
    if (!first || !second) {
      throw new Error("the fixtures are missing");
    }
    client.setQueryData(["recipes", "one", first.slug], first);
    // The same recipe under its old address, as after a rename.
    client.setQueryData(["recipes", "one", "an-old-address"], first);
    client.setQueryData(["recipes", "one", second.slug], second);
    client.setQueryData(["recipes", "list", {}], { pages: [] });

    expect(
      recipesOnDevice(client)
        .map((recipe) => recipe.id)
        .sort(),
    ).toEqual([first.id, second.id].sort());
  });
});
