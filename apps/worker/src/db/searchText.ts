/** The text of one recipe as the search index holds it: the four columns of `recipe_search`. */
export type SearchText = {
  title: string;
  description: string;
  ingredients: string;
  organizers: string;
};

export type SearchSource = {
  title: string;
  description: string;
  sourceName: string | null;
  /** In the recipe's order. `foodName` is the household's name for the food, when the line has one. */
  ingredients: readonly { foodName: string | null; originalText: string | null; note: string }[];
  organizerNames: readonly string[];
};

/**
 * Builds the search text for a recipe. This is the one place it is assembled:
 * the save calls it, and so does anything that renames a food or an organizer.
 *
 * - The description is followed by "From", so that "Grandma" finds her recipes.
 * - Each ingredient is one line: the food's name, then the line as written (or
 *   its note). The name is there because the card may say "B. Sugar" where the
 *   household's food is "brown sugar".
 */
export function buildSearchText(source: SearchSource): SearchText {
  return {
    title: source.title,
    description: [source.description, source.sourceName ?? ""]
      .filter((part) => part !== "")
      .join("\n"),
    ingredients: source.ingredients
      .map((line) =>
        [line.foodName ?? "", line.originalText ?? line.note]
          .filter((part) => part !== "")
          .join(" "),
      )
      .filter((line) => line !== "")
      .join("\n"),
    organizers: source.organizerNames.join("\n"),
  };
}
