import { eq, type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { drizzle } from "drizzle-orm/d1";
import { recipeSearch } from "./schema";
import { buildSearchText, type SearchSource } from "./searchText";

type Orm = ReturnType<typeof drizzle>;

type RecipeRow = { id: string; title: string; description: string; source_name: string | null };
type LineRow = {
  recipe_id: string;
  food_id: string | null;
  food_name: string | null;
  original_text: string | null;
  note: string;
};
type OrganizerRow = { recipe_id: string; organizer_id: string; name: string };

/** What a change does to the names the search text contains. */
export type NameChanges = {
  /** Foods that are being renamed, by ID. */
  foodNames?: ReadonlyMap<string, string>;
  /** Organizers that are being renamed, by ID. Null means it is being deleted. */
  organizerNames?: ReadonlyMap<string, string | null>;
};

/**
 * The three selects that read what the search text of some recipes is made
 * from. `affected` is a subquery that yields the recipes' IDs. They go in the
 * same batch as the change's other reads.
 */
export function searchSourceQueries(orm: Orm, affected: SQL) {
  return [
    orm.all<RecipeRow>(
      sql`SELECT r.id, r.title, r.description, r.source_name FROM recipes AS r WHERE r.id IN (${affected})`,
    ),
    orm.all<LineRow>(
      sql`SELECT i.recipe_id, i.food_id, f.name AS food_name, i.original_text, i.note
          FROM recipe_ingredients AS i
          LEFT JOIN foods AS f ON f.id = i.food_id
          WHERE i.recipe_id IN (${affected})
          ORDER BY i.recipe_id, i.position`,
    ),
    orm.all<OrganizerRow>(
      sql`SELECT l.recipe_id, l.organizer_id, o.name
          FROM recipe_organizers AS l
          JOIN organizers AS o ON o.id = l.organizer_id
          WHERE l.recipe_id IN (${affected})
          ORDER BY o.name COLLATE NOCASE`,
    ),
  ] as const;
}

/**
 * One statement per affected recipe that rewrites its search text with the
 * changed names in place. They go in the same batch as the change itself, so
 * the index and the names move together. The text is assembled by
 * `buildSearchText`, the same function a save uses.
 */
export function searchRewriteStatements(
  orm: Orm,
  rows: readonly [RecipeRow[], LineRow[], OrganizerRow[]],
  changes: NameChanges,
): BatchItem<"sqlite">[] {
  const [recipeRows, lineRows, organizerRows] = rows;
  return recipeRows.map((recipe) => {
    const source: SearchSource = {
      title: recipe.title,
      description: recipe.description,
      sourceName: recipe.source_name,
      ingredients: lineRows
        .filter((line) => line.recipe_id === recipe.id)
        .map((line) => ({
          foodName:
            (line.food_id ? changes.foodNames?.get(line.food_id) : undefined) ?? line.food_name,
          originalText: line.original_text,
          note: line.note,
        })),
      organizerNames: organizerRows
        .filter((row) => row.recipe_id === recipe.id)
        .flatMap((row) => {
          const changed = changes.organizerNames?.get(row.organizer_id);
          if (changed === null) {
            return [];
          }
          return [changed ?? row.name];
        }),
    };
    return orm
      .update(recipeSearch)
      .set(buildSearchText(source))
      .where(eq(recipeSearch.recipeId, recipe.id));
  });
}
