import { type Recipe, type RecipeSummary, toRecipeSummary } from "@recipeflare/schema";
import type { QueryClient } from "@tanstack/react-query";
import type { RecipeListRequest } from "../../api/queries";

/**
 * The recipe list with no connection: the same question the server answers,
 * asked of the recipes copied to this device. Search here is plain: every
 * word typed must appear somewhere in the recipe. It has no ranking, so "best
 * match" is by title.
 */

/** Every recipe this device has a copy of, once each. */
export function recipesOnDevice(queryClient: QueryClient): Recipe[] {
  const byId = new Map<string, Recipe>();
  for (const [, recipe] of queryClient.getQueriesData<Recipe>({ queryKey: ["recipes", "one"] })) {
    if (recipe) {
      byId.set(recipe.id, recipe);
    }
  }
  return [...byId.values()];
}

const plain = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** Everything about a recipe that the search looks in, as the server's search does. */
function searchText(recipe: Recipe): string {
  const lines = recipe.ingredientSections.flatMap((section) => section.items);
  return plain(
    [
      recipe.title,
      recipe.description,
      recipe.sourceName ?? "",
      ...lines.flatMap((line) => [line.originalText ?? "", line.food?.name ?? "", line.note]),
      ...[...recipe.categories, ...recipe.tags, ...recipe.tools].map((entry) => entry.name),
    ].join(" "),
  );
}

/** The recipes on the device that answer a list request, in the order it asks for. */
export function listOffline(
  recipes: readonly Recipe[],
  request: RecipeListRequest,
): RecipeSummary[] {
  const words = plain(request.q).match(/[\p{L}\p{N}]+/gu) ?? [];
  const has = (entries: { slug: string }[], slug: string) =>
    entries.some((entry) => entry.slug === slug);

  const matching = recipes.filter((recipe) => {
    if (request.category && !has(recipe.categories, request.category)) {
      return false;
    }
    if (!request.tags.every((slug) => has(recipe.tags, slug))) {
      return false;
    }
    if (!request.tools.every((slug) => has(recipe.tools, slug))) {
      return false;
    }
    if (request.foodIds.length > 0) {
      const foods = new Set(
        recipe.ingredientSections.flatMap((section) =>
          section.items.flatMap((line) => (line.food ? [line.food.id] : [])),
        ),
      );
      if (!request.foodIds.every((id) => foods.has(id))) {
        return false;
      }
    }
    if (words.length > 0) {
      const text = searchText(recipe);
      return words.every((word) => text.includes(word));
    }
    return true;
  });

  const byTitle = (a: Recipe, b: Recipe) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  const order: Record<RecipeListRequest["sort"], (a: Recipe, b: Recipe) => number> = {
    title: byTitle,
    match: byTitle,
    changed: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || byTitle(a, b),
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || byTitle(a, b),
  };
  return matching.sort(order[request.sort]).map(toRecipeSummary);
}
