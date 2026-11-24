import type { Asset } from "@recipeflare/schema";
import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { assets } from "./schema";

/**
 * The rows behind photos and attachments. The files themselves are in R2,
 * under keys made from the asset's ID (`media.ts`).
 */

const columns = {
  id: assets.id,
  role: assets.role,
  position: assets.position,
  contentType: assets.contentType,
  sizeBytes: assets.sizeBytes,
  width: assets.width,
  height: assets.height,
  hasVariants: assets.hasVariants,
  originalFilename: assets.originalFilename,
  createdAt: assets.createdAt,
};

/** An `IN` list as one bound value, however long the list. */
const inJson = (values: readonly string[]) =>
  sql`${assets.id} IN (SELECT value FROM json_each(${JSON.stringify(values)}))`;

/** Records a stored file. It belongs to no recipe yet. */
export async function insertAsset(
  db: D1Database,
  asset: Asset,
  owner: { memberId: string; importJobId: string | null },
): Promise<void> {
  await drizzle(db).insert(assets).values({
    id: asset.id,
    recipeId: null,
    importJobId: owner.importJobId,
    role: asset.role,
    position: asset.position,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    hasVariants: asset.hasVariants,
    originalFilename: asset.originalFilename,
    createdBy: owner.memberId,
    createdAt: asset.createdAt,
  });
}

/** What serving a file needs to know about it. */
export async function loadAssetForServing(db: D1Database, id: string) {
  const row = await drizzle(db)
    .select({
      id: assets.id,
      role: assets.role,
      contentType: assets.contentType,
      hasVariants: assets.hasVariants,
      originalFilename: assets.originalFilename,
    })
    .from(assets)
    .where(eq(assets.id, id))
    .get();
  return row ?? null;
}

/** What an import brought with it and no recipe has taken yet, in order. */
export async function assetsOfImport(db: D1Database, importJobId: string): Promise<Asset[]> {
  const rows = await drizzle(db)
    .select(columns)
    .from(assets)
    .where(and(eq(assets.importJobId, importJobId), isNull(assets.recipeId)))
    .orderBy(asc(assets.position), asc(assets.createdAt));
  return rows as Asset[];
}

/**
 * The pictures an import brought that are still here, whoever has them now:
 * for a photographed card that was saved, the card's sides on the recipe, in
 * the order the recipe keeps them.
 */
export async function photosOfSavedImport(db: D1Database, importJobId: string): Promise<Asset[]> {
  const rows = await drizzle(db)
    .select(columns)
    .from(assets)
    .where(eq(assets.importJobId, importJobId))
    .orderBy(asc(assets.position), asc(assets.createdAt));
  return (rows as Asset[]).filter((asset) => asset.contentType.startsWith("image/"));
}

/** The IDs of a recipe's assets: what to remove from storage when the recipe goes. */
export async function assetIdsOfRecipe(db: D1Database, recipeId: string): Promise<string[]> {
  const rows = await drizzle(db)
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.recipeId, recipeId));
  return rows.map((row) => row.id);
}

/** Uploads older than `before` that belong to no recipe and no import. */
export async function staleUnattachedAssetIds(db: D1Database, before: string): Promise<string[]> {
  const rows = await drizzle(db)
    .select({ id: assets.id })
    .from(assets)
    .where(and(isNull(assets.recipeId), isNull(assets.importJobId), lt(assets.createdAt, before)))
    .limit(50);
  return rows.map((row) => row.id);
}

export async function deleteAssetRows(db: D1Database, ids: readonly string[]): Promise<void> {
  if (ids.length > 0) {
    await drizzle(db).delete(assets).where(inJson(ids));
  }
}
