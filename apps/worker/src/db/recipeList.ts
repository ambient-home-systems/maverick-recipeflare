import {
  Asset,
  coverAsset,
  type RecipeListQuery,
  RecipeListResponse,
  type RecipeSort,
} from "@recipeflare/schema";
import { type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { ftsQuery } from "./ftsQuery";

/**
 * The order of each sort. The ID breaks ties, so paging never skips or repeats
 * a recipe. Best match weighs a word in the title above one in the
 * ingredients, the organizers and the description, in that order.
 */
const ORDER: Record<RecipeSort, SQL> = {
  match: sql`bm25(recipes_fts, 10.0, 2.0, 4.0, 3.0), r.updated_at DESC, r.id DESC`,
  changed: sql`r.updated_at DESC, r.id DESC`,
  newest: sql`r.created_at DESC, r.id DESC`,
  title: sql`r.title COLLATE NOCASE ASC, r.id ASC`,
};

/** A recipe has every one of these organizers of one kind, named by slug. */
function hasAll(kind: "tag" | "tool", slugs: readonly string[]): SQL {
  return sql`(SELECT COUNT(*) FROM recipe_organizers AS l
              JOIN organizers AS o ON o.id = l.organizer_id
              WHERE l.recipe_id = r.id AND o.kind = ${kind}
                AND o.slug IN (SELECT value FROM json_each(${JSON.stringify(slugs)}))) = ${slugs.length}`;
}

/**
 * Which recipes the list is asked for: the tables to read and the conditions,
 * every one of which must hold. Null when the search text has nothing in it
 * that the index could hold, so nothing can match.
 */
function selection(query: RecipeListQuery): { from: SQL; where: SQL; sort: RecipeSort } | null {
  const match = ftsQuery(query.q);
  if (query.q !== "" && match === null) {
    return null;
  }
  const conditions: SQL[] = [];
  if (match) {
    conditions.push(sql`recipes_fts MATCH ${match}`);
  }
  if (query.category) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM recipe_organizers AS l
                  JOIN organizers AS o ON o.id = l.organizer_id
                  WHERE l.recipe_id = r.id AND o.kind = 'category' AND o.slug = ${query.category})`,
    );
  }
  if (query.tags.length > 0) {
    conditions.push(hasAll("tag", query.tags));
  }
  if (query.tools.length > 0) {
    conditions.push(hasAll("tool", query.tools));
  }
  if (query.foods.length > 0) {
    conditions.push(
      sql`(SELECT COUNT(DISTINCT i.food_id) FROM recipe_ingredients AS i
           WHERE i.recipe_id = r.id
             AND i.food_id IN (SELECT value FROM json_each(${JSON.stringify(query.foods)}))) = ${query.foods.length}`,
    );
  }
  return {
    from: match
      ? sql`FROM recipes_fts
            JOIN recipe_search AS s ON s.doc_id = recipes_fts.rowid
            JOIN recipes AS r ON r.id = s.recipe_id`
      : sql`FROM recipes AS r`,
    where: conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``,
    // Best match means something only while searching.
    sort: match
      ? (query.sort ?? "match")
      : query.sort === "match" || !query.sort
        ? "changed"
        : query.sort,
  };
}

type SummaryRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  source_name: string | null;
  servings: number | null;
  prep_time_seconds: number | null;
  cook_time_seconds: number | null;
  total_time_seconds: number | null;
  created_at: string;
  updated_at: string;
};
type OrganizerRow = { recipe_id: string; id: string; kind: string; name: string; slug: string };
type AssetRow = {
  recipe_id: string;
  id: string;
  role: string;
  position: number;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  has_variants: number;
  original_filename: string | null;
  created_at: string;
};

/**
 * One page of the recipe list, with each recipe's cover, categories and tags:
 * the recipes that match the search text and every filter given.
 * One query: a batch of five selects over the same page.
 */
export async function listRecipes(
  db: D1Database,
  query: RecipeListQuery,
): Promise<RecipeListResponse> {
  const orm = drizzle(db);
  const chosen = selection(query);
  const library = orm.all<{ total: number }>(sql`SELECT COUNT(*) AS total FROM recipes`);
  if (!chosen) {
    const [all] = await orm.batch([library]);
    return {
      items: [],
      page: query.page,
      perPage: query.perPage,
      total: 0,
      libraryTotal: all[0]?.total ?? 0,
    };
  }
  const { from, where } = chosen;
  const offset = (query.page - 1) * query.perPage;
  const paged = sql`${from} ${where} ORDER BY ${ORDER[chosen.sort]} LIMIT ${query.perPage} OFFSET ${offset}`;
  // The page, as a list of IDs, for the two selects that fetch what belongs to
  // its recipes. A batch is one transaction, so all four see the same recipes.
  const page = sql`SELECT r.id ${paged}`;

  const [all, count, rows, organizerRows, assetRows] = await orm.batch([
    library,
    orm.all<{ total: number }>(sql`SELECT COUNT(*) AS total ${from} ${where}`),
    orm.all<SummaryRow>(
      sql`SELECT r.id, r.slug, r.title, r.description, r.source_name, r.servings,
                 r.prep_time_seconds, r.cook_time_seconds, r.total_time_seconds,
                 r.created_at, r.updated_at
          ${paged}`,
    ),
    orm.all<OrganizerRow>(
      sql`SELECT l.recipe_id, o.id, o.kind, o.name, o.slug
          FROM recipe_organizers AS l
          JOIN organizers AS o ON o.id = l.organizer_id
          WHERE l.recipe_id IN (${page}) AND o.kind IN ('category', 'tag')
          ORDER BY o.name COLLATE NOCASE`,
    ),
    orm.all<AssetRow>(
      sql`SELECT a.recipe_id, a.id, a.role, a.position, a.content_type, a.size_bytes,
                 a.width, a.height, a.has_variants, a.original_filename, a.created_at
          FROM assets AS a
          WHERE a.recipe_id IN (${page}) AND a.role IN ('cover', 'photo')
          ORDER BY a.position, a.created_at`,
    ),
  ]);

  const organizersOf = (recipeId: string, kind: string) =>
    organizerRows
      .filter((row) => row.recipe_id === recipeId && row.kind === kind)
      .map(({ id, name, slug }) => ({ id, name, slug }));
  const assetsOf = (recipeId: string): Asset[] =>
    assetRows
      .filter((row) => row.recipe_id === recipeId)
      .map((row) =>
        Asset.parse({
          id: row.id,
          role: row.role,
          position: row.position,
          contentType: row.content_type,
          sizeBytes: row.size_bytes,
          width: row.width,
          height: row.height,
          hasVariants: Boolean(row.has_variants),
          originalFilename: row.original_filename,
          createdAt: row.created_at,
        }),
      );

  return RecipeListResponse.parse({
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      sourceName: row.source_name,
      servings: row.servings,
      prepTimeSeconds: row.prep_time_seconds,
      cookTimeSeconds: row.cook_time_seconds,
      totalTimeSeconds: row.total_time_seconds,
      cover: coverAsset({ assets: assetsOf(row.id) }),
      categories: organizersOf(row.id, "category"),
      tags: organizersOf(row.id, "tag"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    page: query.page,
    perPage: query.perPage,
    total: count[0]?.total ?? 0,
    libraryTotal: all[0]?.total ?? 0,
  });
}
