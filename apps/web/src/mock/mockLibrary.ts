import { type Recipe, type RecipeSummary, slugify, toRecipeSummary } from "@recipeflare/schema";
import { fixtureOrganizers, fixtureRecipes } from "@recipeflare/schema/fixtures";
import type { ListOption } from "../pages/recipes/FilterSheet";
import { effectiveSort, type ListState } from "../pages/recipes/listState";
import type { ListCategory } from "../pages/recipes/RecipeListScreen";
import { assignStocks } from "../ui/stock";
import chicken from "./placeholders/chicken.svg";
import chili from "./placeholders/chili.svg";
import cookies from "./placeholders/cookies.svg";
import pancakes from "./placeholders/pancakes.svg";

/**
 * The fixture recipes as a library the mock list can search, filter and sort.
 *
 * This stands in for the API. The real search is the database's full-text
 * index (T1.4); this copy follows the same rules from the feature spec so the
 * screen can be judged, and nothing else should rely on it.
 */

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const ofKind = (kind: "category" | "tag" | "tool") =>
  fixtureOrganizers.filter((organizer) => organizer.kind === kind);

const categoryStocks = assignStocks(ofKind("category").map((category) => category.id));

export const mockCategories: ListCategory[] = ofKind("category").map((category) => ({
  key: category.slug,
  name: category.name,
  stock: categoryStocks.get(category.id) ?? "plain",
}));

const option = (organizer: { slug: string; name: string }): ListOption => ({
  key: organizer.slug,
  name: organizer.name,
});
export const mockTags: ListOption[] = ofKind("tag").sort(byName).map(option);
export const mockTools: ListOption[] = ofKind("tool").sort(byName).map(option);

const foodSlugs = (recipe: Recipe): string[] => [
  ...new Set(
    recipe.ingredientSections.flatMap((section) =>
      section.items.flatMap((item) => (item.food ? [slugify(item.food.name)] : [])),
    ),
  ),
];

/** Foods that some recipe uses, the most used first. */
export const mockFoods: ListOption[] = (() => {
  const uses = new Map<string, { name: string; count: number }>();
  for (const recipe of fixtureRecipes) {
    for (const section of recipe.ingredientSections) {
      for (const item of section.items) {
        if (item.food) {
          const key = slugify(item.food.name);
          uses.set(key, { name: item.food.name, count: (uses.get(key)?.count ?? 0) + 1 });
        }
      }
    }
  }
  return [...uses]
    .sort(([, a], [, b]) => b.count - a.count || a.name.localeCompare(b.name))
    .map(([key, { name }]) => ({ key, name }));
})();

// --- Search: all words must match; the last word matches as a prefix. ---

/** Lower case, no accents, and a rough singular: "Tomatoes" and "tomato" meet. */
function stem(word: string): string {
  let out = word;
  if (out.length > 3 && out.endsWith("s") && !out.endsWith("ss")) {
    out = out.slice(0, -1);
  }
  if (out.length > 3 && out.endsWith("e")) {
    out = out.slice(0, -1);
  }
  if (out.length > 3 && out.endsWith("y")) {
    out = `${out.slice(0, -1)}i`;
  }
  return out;
}

export function searchWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem);
}

type Entry = {
  recipe: Recipe;
  summary: RecipeSummary;
  title: Set<string>;
  words: Set<string>;
  foods: string[];
};

const entries: Entry[] = fixtureRecipes.map((recipe) => {
  const text: string[] = [
    recipe.title,
    recipe.description,
    recipe.sourceName ?? "",
    ...recipe.ingredientSections.flatMap((section) =>
      section.items.flatMap((item) => [item.originalText ?? "", item.food?.name ?? "", item.note]),
    ),
    ...[...recipe.categories, ...recipe.tags, ...recipe.tools].map((organizer) => organizer.name),
  ];
  return {
    recipe,
    summary: toRecipeSummary(recipe),
    title: new Set(searchWords(recipe.title)),
    words: new Set(text.flatMap(searchWords)),
    foods: foodSlugs(recipe),
  };
});

/** How well a recipe matches the words, or zero if any word is missing. Title matches count for more. */
function score(entry: Entry, words: string[]): number {
  let total = 0;
  for (const [index, word] of words.entries()) {
    const prefix = index === words.length - 1;
    const hit = (set: Set<string>) =>
      prefix ? [...set].some((candidate) => candidate.startsWith(word)) : set.has(word);
    if (hit(entry.title)) {
      total += 3;
    } else if (hit(entry.words)) {
      total += 1;
    } else {
      return 0;
    }
  }
  return total;
}

export const mockLibraryCount = fixtureRecipes.length;

/** The recipes the list shows for a search, a set of filters and a sort. */
export function queryLibrary(state: ListState): RecipeSummary[] {
  const words = searchWords(state.q);
  const slugs = (organizers: { slug: string }[]) => organizers.map((organizer) => organizer.slug);

  const matches = entries
    .map((entry) => ({ entry, score: words.length > 0 ? score(entry, words) : 1 }))
    .filter(({ entry, score: s }) => {
      const { recipe } = entry;
      return (
        s > 0 &&
        (!state.category || slugs(recipe.categories).includes(state.category)) &&
        state.tags.every((tag) => slugs(recipe.tags).includes(tag)) &&
        state.tools.every((tool) => slugs(recipe.tools).includes(tool)) &&
        state.foods.every((food) => entry.foods.includes(food))
      );
    });

  const changed = (a: Entry, b: Entry) => b.summary.updatedAt.localeCompare(a.summary.updatedAt);
  const sort = effectiveSort(state);
  matches.sort((a, b) => {
    switch (sort) {
      case "match":
        return b.score - a.score || changed(a.entry, b.entry);
      case "newest":
        return b.entry.summary.createdAt.localeCompare(a.entry.summary.createdAt);
      case "title":
        return a.entry.summary.title.localeCompare(b.entry.summary.title);
      default:
        return changed(a.entry, b.entry);
    }
  });
  return matches.map(({ entry }) => entry.summary);
}

// --- Photos: there are none, so recipes that have a cover get a drawn stand-in. ---

const PLACEHOLDERS = [pancakes, chicken, chili, cookies];
const placeholderById = new Map(
  entries
    .filter((entry) => entry.summary.cover !== null)
    .map((entry, index) => [entry.summary.id, PLACEHOLDERS[index % PLACEHOLDERS.length]]),
);

/** A placeholder drawing for a recipe that has a cover photo. Not a photograph of anything. */
export function placeholderThumbnail(recipe: RecipeSummary): string | undefined {
  return placeholderById.get(recipe.id);
}
