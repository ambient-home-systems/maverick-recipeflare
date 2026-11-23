import {
  Asset,
  coverAsset,
  type RecipeListQuery,
  RecipeListResponse,
  type RecipeSort,
} from "@recipeflare/schema";
import { type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

/** The order of each sort. The ID breaks ties, so paging never skips or repeats a recipe. */
const ORDER: Record<RecipeSort, SQL> = {
  changed: sql`r.updated_at DESC, r.id DESC`,
  newest: sql`r.created_at DESC, r.id DESC`,
  title: sql`r.title COLLATE NOCASE ASC, r.id ASC`,
};

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
 * One page of the recipe list, with each recipe's cover, categories and tags.
 * One query: a batch of four selects over the same page.
 */
export async function listRecipes(
  db: D1Database,
  query: RecipeListQuery,
): Promise<RecipeListResponse> {
  const orm = drizzle(db);
  const offset = (query.page - 1) * query.perPage;
  // The page, as a list of IDs. The three selects below that need it repeat it;
  // a batch is one transaction, so all of them see the same recipes.
  const page = sql`SELECT r.id FROM recipes AS r ORDER BY ${ORDER[query.sort]} LIMIT ${query.perPage} OFFSET ${offset}`;

  const [count, rows, organizerRows, assetRows] = await orm.batch([
    orm.all<{ total: number }>(sql`SELECT COUNT(*) AS total FROM recipes`),
    orm.all<SummaryRow>(
      sql`SELECT r.id, r.slug, r.title, r.description, r.source_name, r.servings,
                 r.prep_time_seconds, r.cook_time_seconds, r.total_time_seconds,
                 r.created_at, r.updated_at
          FROM recipes AS r
          WHERE r.id IN (${page})
          ORDER BY ${ORDER[query.sort]}`,
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
  });
}
