import {
  canonicalUrl,
  type FieldIssue,
  flattenIngredientSections,
  flattenStepSections,
  groupIngredientRows,
  groupStepRows,
  newId,
  Recipe,
  type RecipeInput,
  type RecipeUpdate,
  slugify,
  uniqueSlug,
} from "@recipeflare/schema";
import { asc, eq, type SQL, sql } from "drizzle-orm";
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";
import { chunkRows } from "./chunk";
import {
  assets,
  foods,
  importJobs,
  organizers,
  recipeIngredients,
  recipeNotes,
  recipeOrganizers,
  recipeSearch,
  recipeSteps,
  recipes,
  units,
} from "./schema";
import { buildSearchText } from "./searchText";

/**
 * Saving, loading and deleting a recipe, as docs/implementation-plan.md §4.6
 * describes. A save is one batch of reads and then one batch that writes the
 * recipe, replaces its lines, steps, notes and organizer links, rewrites its
 * search text, and reads the result back. A batch is one transaction: if any
 * statement fails, nothing of the save remains.
 */

type Orm = ReturnType<typeof drizzle>;
type Statement = BatchItem<"sqlite">;
type Statements = [Statement, ...Statement[]];

export type SaveResult =
  /** `removedAssetIds` are photos the save took off the recipe; their files are the caller's to delete. */
  | { ok: true; recipe: Recipe; removedAssetIds: string[] }
  | { ok: false; reason: "not_found" }
  /** Someone else saved first. `current` is the recipe as it is now. */
  | { ok: false; reason: "conflict"; current: Recipe }
  /** The recipe names a food, unit or organizer that does not exist. */
  | { ok: false; reason: "invalid"; issues: FieldIssue[] };

/** An `IN` list as one bound value, however long the list: the rule for every `IN` in the codebase. */
function inJson(column: SQL | { getSQL(): SQL }, values: readonly string[]): SQL {
  return sql`${column} IN (SELECT value FROM json_each(${JSON.stringify(values)}))`;
}

/** The ID of the recipe that `key` names: an ID first, then a slug. */
function recipeIdFor(key: string): SQL {
  return sql`(SELECT r.id FROM recipes AS r WHERE r.id = ${key} OR r.slug = ${key} ORDER BY r.id = ${key} DESC LIMIT 1)`;
}

/**
 * The six selects that read one recipe. Columns that share a name across the
 * joined tables are given their own names, because a D1 batch returns rows
 * keyed by column name.
 */
function loadQueries(orm: Orm, recipeId: SQL) {
  return [
    orm.select().from(recipes).where(eq(recipes.id, recipeId)),
    orm
      .select({
        id: recipeIngredients.id,
        position: recipeIngredients.position,
        section: recipeIngredients.section,
        originalText: recipeIngredients.originalText,
        quantity: recipeIngredients.quantity,
        note: recipeIngredients.note,
        unitId: sql<string | null>`${units.id}`.as("unit_id_"),
        unitName: sql<string | null>`${units.name}`.as("unit_name"),
        unitPluralName: sql<string | null>`${units.pluralName}`.as("unit_plural_name"),
        unitAbbreviation: units.abbreviation,
        unitPluralAbbreviation: units.pluralAbbreviation,
        unitUseAbbreviation: units.useAbbreviation,
        unitFraction: units.fraction,
        foodId: sql<string | null>`${foods.id}`.as("food_id_"),
        foodName: sql<string | null>`${foods.name}`.as("food_name"),
        foodPluralName: sql<string | null>`${foods.pluralName}`.as("food_plural_name"),
      })
      .from(recipeIngredients)
      .leftJoin(units, eq(recipeIngredients.unitId, units.id))
      .leftJoin(foods, eq(recipeIngredients.foodId, foods.id))
      .where(eq(recipeIngredients.recipeId, recipeId))
      .orderBy(asc(recipeIngredients.position)),
    orm
      .select({
        id: recipeSteps.id,
        position: recipeSteps.position,
        section: recipeSteps.section,
        text: recipeSteps.text,
        durationSeconds: recipeSteps.durationSeconds,
        ingredientRefs: recipeSteps.ingredientRefs,
      })
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeId, recipeId))
      .orderBy(asc(recipeSteps.position)),
    orm
      .select({ id: recipeNotes.id, title: recipeNotes.title, text: recipeNotes.text })
      .from(recipeNotes)
      .where(eq(recipeNotes.recipeId, recipeId))
      .orderBy(asc(recipeNotes.position)),
    orm
      .select({
        id: organizers.id,
        kind: organizers.kind,
        name: organizers.name,
        slug: organizers.slug,
      })
      .from(recipeOrganizers)
      .innerJoin(organizers, eq(recipeOrganizers.organizerId, organizers.id))
      .where(eq(recipeOrganizers.recipeId, recipeId))
      .orderBy(sql`${organizers.name} COLLATE NOCASE`),
    orm
      .select({
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
      })
      .from(assets)
      .where(eq(assets.recipeId, recipeId))
      .orderBy(asc(assets.position), asc(assets.createdAt)),
  ] as const;
}

type LoadRows = BatchResponse<ReturnType<typeof loadQueries>>;
const LOAD_COUNT = 6;

/** Turns the rows of `loadQueries` into the API's recipe, checked by the shared schema on the way out. */
function assemble(rows: LoadRows): Recipe | null {
  const [recipeRows, ingredientRows, stepRows, noteRows, organizerRows, assetRows] = rows;
  const row = recipeRows[0];
  if (!row) {
    return null;
  }

  const ingredients = ingredientRows.map((line) => ({
    id: line.id,
    position: line.position,
    section: line.section,
    originalText: line.originalText,
    quantity: line.quantity,
    unit:
      line.unitId === null
        ? null
        : {
            id: line.unitId,
            name: line.unitName ?? "",
            pluralName: line.unitPluralName,
            abbreviation: line.unitAbbreviation,
            pluralAbbreviation: line.unitPluralAbbreviation,
            // A D1 batch hands booleans back as the integers they are stored as.
            useAbbreviation: Boolean(line.unitUseAbbreviation),
            fraction: Boolean(line.unitFraction),
          },
    food:
      line.foodId === null
        ? null
        : { id: line.foodId, name: line.foodName ?? "", pluralName: line.foodPluralName },
    note: line.note,
  }));
  const steps = stepRows.map((step) => ({
    id: step.id,
    position: step.position,
    section: step.section,
    text: step.text,
    durationSeconds: step.durationSeconds,
    ingredientIds: JSON.parse(step.ingredientRefs) as string[],
  }));
  const ofKind = (kind: string) =>
    organizerRows
      .filter((organizer) => organizer.kind === kind)
      .map(({ id, name, slug }) => ({ id, name, slug }));

  return Recipe.parse({
    id: row.id,
    slug: row.slug,
    version: row.version,
    title: row.title,
    description: row.description,
    servings: row.servings,
    yieldQuantity: row.yieldQuantity,
    yieldUnit: row.yieldUnit,
    prepTimeSeconds: row.prepTimeSeconds,
    cookTimeSeconds: row.cookTimeSeconds,
    totalTimeSeconds: row.totalTimeSeconds,
    nutrition: row.nutrition === null ? null : JSON.parse(row.nutrition),
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    ingredientSections: groupIngredientRows(ingredients),
    stepSections: groupStepRows(steps),
    notes: noteRows,
    categories: ofKind("category"),
    tags: ofKind("tag"),
    tools: ofKind("tool"),
    assets: assetRows.map((asset) => ({ ...asset, hasVariants: Boolean(asset.hasVariants) })),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** One recipe by its ID or its slug, an ID first. One query. */
export async function loadRecipe(db: D1Database, idOrSlug: string): Promise<Recipe | null> {
  const orm = drizzle(db);
  return assemble(await orm.batch(loadQueries(orm, recipeIdFor(idOrSlug))));
}

/** Every message in an error and the errors that caused it. Drizzle wraps what D1 throws. */
function messagesOf(error: unknown): string {
  const parts: string[] = [];
  for (let current = error; current instanceof Error && parts.length < 5; current = current.cause) {
    parts.push(current.message);
  }
  return parts.join(" | ");
}

/** Only the nutrition values that were filled in, or null when none were. */
function nutritionJson(nutrition: RecipeInput["nutrition"]): string | null {
  const filled = Object.entries(nutrition ?? {}).filter(
    ([, value]) => typeof value === "string" && value.trim() !== "",
  );
  return filled.length === 0 ? null : JSON.stringify(Object.fromEntries(filled));
}

type Target =
  /** A new recipe. `importJobId` is the import it confirms, if it came from one. */
  | { create: true; id: string; importJobId: string | null }
  | { create: false; id: string; loadedVersion: number };

/**
 * The reads a save needs, in one batch: the recipe as it stands (for an
 * update), the slugs that could collide with this title, and the foods, units
 * and organizers the recipe names.
 */
async function readBeforeSave(orm: Orm, target: Target, input: RecipeInput) {
  const base = slugify(input.title);
  const lines = input.ingredientSections.flatMap((section) => section.items);
  const foodIds = [...new Set(lines.flatMap((line) => (line.foodId ? [line.foodId] : [])))];
  const unitIds = [...new Set(lines.flatMap((line) => (line.unitId ? [line.unitId] : [])))];
  const organizerIds = [...input.categoryIds, ...input.tagIds, ...input.toolIds];

  // An ID no job has, when the save confirms no import, so the batch keeps one shape.
  const importJobId = target.create ? (target.importJobId ?? "") : "";

  const listedAssets = JSON.stringify((input.assets ?? []).map((asset) => asset.id));

  const [current, taken, foodRows, unitRows, organizerRows, jobRows, assetRows] = await orm.batch([
    orm
      .select({
        slug: recipes.slug,
        title: recipes.title,
        version: recipes.version,
      })
      .from(recipes)
      .where(eq(recipes.id, target.id)),
    // A range scan on the unique index: the base itself and everything that starts "base-".
    orm
      .select({ slug: recipes.slug })
      .from(recipes)
      .where(
        sql`(${recipes.slug} = ${base} OR (${recipes.slug} > ${`${base}-`} AND ${recipes.slug} < ${`${base}.`})) AND ${recipes.id} <> ${target.id}`,
      ),
    orm.select({ id: foods.id, name: foods.name }).from(foods).where(inJson(foods.id, foodIds)),
    orm.select({ id: units.id }).from(units).where(inJson(units.id, unitIds)),
    orm
      .select({ id: organizers.id, kind: organizers.kind, name: organizers.name })
      .from(organizers)
      .where(inJson(organizers.id, organizerIds)),
    orm
      .select({ status: importJobs.status })
      .from(importJobs)
      .where(eq(importJobs.id, importJobId)),
    // The recipe's assets as they stand, what the import brought, and any the save names.
    orm
      .select({ id: assets.id, ownerId: sql<string | null>`${assets.recipeId}`.as("owner_id") })
      .from(assets)
      .where(
        sql`${assets.recipeId} = ${target.id} OR ${assets.importJobId} = ${importJobId} OR ${assets.id} IN (SELECT value FROM json_each(${listedAssets}))`,
      ),
  ]);

  return {
    importStatus: jobRows[0]?.status ?? null,
    /** Asset ID to the recipe that has it, or null for one that is not on a recipe yet. */
    assetOwners: new Map(assetRows.map((asset) => [asset.id, asset.ownerId])),
    base,
    current: current[0] ?? null,
    takenSlugs: taken.map((row) => row.slug),
    foodNames: new Map(foodRows.map((food) => [food.id, food.name])),
    unitIds: new Set(unitRows.map((unit) => unit.id)),
    organizers: new Map(organizerRows.map((organizer) => [organizer.id, organizer])),
  };
}

/** A problem for every food, unit or organizer the recipe names that the household does not have. */
function referenceIssues(
  input: RecipeInput,
  known: Awaited<ReturnType<typeof readBeforeSave>>,
  recipeId: string,
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  input.ingredientSections.forEach((section, sectionIndex) => {
    section.items.forEach((line, lineIndex) => {
      const path = ["ingredientSections", sectionIndex, "items", lineIndex];
      if (line.foodId && !known.foodNames.has(line.foodId)) {
        issues.push({ path: [...path, "foodId"], message: "This food no longer exists" });
      }
      if (line.unitId && !known.unitIds.has(line.unitId)) {
        issues.push({ path: [...path, "unitId"], message: "This unit no longer exists" });
      }
    });
  });
  const kinds = [
    ["categoryIds", "category"],
    ["tagIds", "tag"],
    ["toolIds", "tool"],
  ] as const;
  for (const [key, kind] of kinds) {
    input[key].forEach((id, index) => {
      if (known.organizers.get(id)?.kind !== kind) {
        issues.push({ path: [key, index], message: `This ${kind} no longer exists` });
      }
    });
  }
  (input.assets ?? []).forEach((asset, index) => {
    const owner = known.assetOwners.get(asset.id);
    // Not uploaded, swept away, or on another recipe.
    if (owner === undefined || (owner !== null && owner !== recipeId)) {
      issues.push({ path: ["assets", index], message: "This photo is no longer there" });
    }
  });
  return issues;
}

async function save(
  db: D1Database,
  target: Target,
  input: RecipeInput,
  memberId: string,
): Promise<SaveResult> {
  const orm = drizzle(db);

  // The slug's unique index has the last word. If another save took the slug
  // between the read and the write, read again and try once more.
  for (let attempt = 0; ; attempt++) {
    const known = await readBeforeSave(orm, target, input);

    if (!target.create) {
      if (!known.current) {
        return { ok: false, reason: "not_found" };
      }
      if (known.current.version !== target.loadedVersion) {
        return conflict(db, target.id);
      }
    }
    if (target.create && target.importJobId !== null && known.importStatus !== "needs_review") {
      // Saved from another device already, or discarded there.
      return {
        ok: false,
        reason: "invalid",
        issues: [
          {
            path: ["importJobId"],
            message: "This import has already been saved or removed",
          },
        ],
      };
    }
    const issues = referenceIssues(input, known, target.id);
    if (issues.length > 0) {
      return { ok: false, reason: "invalid", issues };
    }

    // The slug follows the title. An unchanged title keeps the slug it has.
    const slug =
      known.current && known.current.title === input.title
        ? known.current.slug
        : uniqueSlug(known.base, known.takenSlugs);

    const listed = new Set((input.assets ?? []).map((asset) => asset.id));
    try {
      const statements = writeStatements(orm, target, input, slug, memberId, known);
      const results = await orm.batch([
        ...statements,
        ...loadQueries(orm, sql`${target.id}`),
      ] as unknown as Statements);
      const recipe = assemble(results.slice(-LOAD_COUNT) as unknown as LoadRows);
      if (!recipe) {
        // An update of a recipe that was deleted after the read. Nothing was written.
        return { ok: false, reason: "not_found" };
      }
      const kept = new Set(recipe.assets.map((asset) => asset.id));
      // What the read saw on the recipe, or arriving with the import, and the save left off.
      const removedAssetIds = input.assets
        ? [...known.assetOwners.keys()].filter((id) => !kept.has(id) && !listed.has(id))
        : [];
      return { ok: true, recipe, removedAssetIds };
    } catch (error) {
      const message = messagesOf(error);
      if (message.includes("version_conflict")) {
        return conflict(db, target.id);
      }
      if (message.includes("UNIQUE constraint failed: recipes.slug") && attempt === 0) {
        continue;
      }
      if (message.includes("FOREIGN KEY constraint failed")) {
        // Something the recipe names was deleted after the read.
        return {
          ok: false,
          reason: "invalid",
          issues: [{ path: [], message: "Something this recipe uses no longer exists" }],
        };
      }
      throw error;
    }
  }
}

async function conflict(db: D1Database, id: string): Promise<SaveResult> {
  const current = await loadRecipe(db, id);
  return current ? { ok: false, reason: "conflict", current } : { ok: false, reason: "not_found" };
}

/** The statements of one save, in the order the plan gives. Every value is bound. */
function writeStatements(
  orm: Orm,
  target: Target,
  input: RecipeInput,
  slug: string,
  memberId: string,
  known: Awaited<ReturnType<typeof readBeforeSave>>,
): Statement[] {
  const id = target.id;
  const now = new Date().toISOString();
  const lines = flattenIngredientSections(input.ingredientSections);
  const steps = flattenStepSections(input.stepSections);
  const organizerIds = [...input.categoryIds, ...input.tagIds, ...input.toolIds];

  const fields = {
    slug,
    title: input.title,
    description: input.description,
    servings: input.servings,
    yieldQuantity: input.yieldQuantity,
    yieldUnit: input.yieldUnit,
    prepTimeSeconds: input.prepTimeSeconds,
    cookTimeSeconds: input.cookTimeSeconds,
    totalTimeSeconds: input.totalTimeSeconds,
    nutrition: nutritionJson(input.nutrition),
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl === null ? null : canonicalUrl(input.sourceUrl),
    updatedBy: memberId,
    updatedAt: now,
  };

  const statements: Statement[] = [];
  if (target.create) {
    statements.push(
      orm
        .insert(recipes)
        .values({ id, ...fields, version: 1, createdBy: memberId, createdAt: now }),
    );
  } else {
    statements.push(
      // The version guard aborts this statement, and so the batch, unless the
      // stored version is still the one this save was made from.
      orm
        .update(recipes)
        .set({ ...fields, version: target.loadedVersion + 1 })
        .where(eq(recipes.id, id)),
      orm.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id)),
      orm.delete(recipeSteps).where(eq(recipeSteps.recipeId, id)),
      orm.delete(recipeNotes).where(eq(recipeNotes.recipeId, id)),
      orm.delete(recipeOrganizers).where(eq(recipeOrganizers.recipeId, id)),
    );
  }

  // Each row states every column, so the number of bound values per row is known.
  const lineRows = lines.map((line) => ({
    id: line.id,
    recipeId: id,
    position: line.position,
    section: line.section,
    originalText: line.originalText,
    quantity: line.quantity,
    unitId: line.unitId,
    foodId: line.foodId,
    note: line.note,
  }));
  for (const rows of chunkRows(lineRows, 9)) {
    statements.push(orm.insert(recipeIngredients).values(rows));
  }
  const stepRows = steps.map((step) => ({
    id: step.id,
    recipeId: id,
    position: step.position,
    section: step.section,
    text: step.text,
    durationSeconds: step.durationSeconds,
    ingredientRefs: JSON.stringify(step.ingredientIds),
  }));
  for (const rows of chunkRows(stepRows, 7)) {
    statements.push(orm.insert(recipeSteps).values(rows));
  }
  const noteRows = input.notes.map((note, position) => ({
    id: note.id,
    recipeId: id,
    position,
    title: note.title,
    text: note.text,
  }));
  for (const rows of chunkRows(noteRows, 5)) {
    statements.push(orm.insert(recipeNotes).values(rows));
  }
  const linkRows = organizerIds.map((organizerId) => ({ recipeId: id, organizerId }));
  for (const rows of chunkRows(linkRows, 2)) {
    statements.push(orm.insert(recipeOrganizers).values(rows));
  }

  const text = buildSearchText({
    title: input.title,
    description: input.description,
    sourceName: input.sourceName,
    ingredients: lines.map((line) => ({
      foodName: line.foodId ? (known.foodNames.get(line.foodId) ?? null) : null,
      originalText: line.originalText,
      note: line.note,
    })),
    organizerNames: organizerIds.flatMap((organizerId) => {
      const organizer = known.organizers.get(organizerId);
      return organizer ? [organizer.name] : [];
    }),
  });
  statements.push(
    orm
      .insert(recipeSearch)
      .values({ recipeId: id, ...text })
      .onConflictDoUpdate({ target: recipeSearch.recipeId, set: text }),
  );

  const confirming = target.create ? target.importJobId : null;
  if (confirming !== null) {
    // Confirming an import: what it brought with it becomes the recipe's. In
    // the same batch as the recipe, so neither happens without the other.
    statements.push(
      orm
        .update(assets)
        .set({ recipeId: id })
        .where(sql`${assets.importJobId} = ${confirming} AND ${assets.recipeId} IS NULL`),
    );
  }

  if (input.assets) {
    // The list is the whole truth about the recipe's assets: each one named
    // takes its role and its place, and one left out is deleted. The cover is
    // stood down first, because a recipe may have only one at any moment.
    const placed = JSON.stringify(input.assets);
    statements.push(
      orm
        .update(assets)
        .set({ role: "photo" })
        .where(sql`${assets.recipeId} = ${id} AND ${assets.role} = 'cover'`),
      orm.run(sql`
        UPDATE assets
        SET recipe_id = ${id}, role = placed.role, position = placed.position
        FROM (
          SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.role') AS role, key AS position
          FROM json_each(${placed})
        ) AS placed
        WHERE assets.id = placed.id AND (assets.recipe_id IS NULL OR assets.recipe_id = ${id})`),
      orm.run(sql`
        DELETE FROM assets
        WHERE recipe_id = ${id}
          AND id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(${placed}))`),
    );
  }

  if (confirming !== null) {
    statements.push(
      orm
        .update(importJobs)
        .set({ status: "completed", recipeId: id, updatedAt: now })
        .where(sql`${importJobs.id} = ${confirming} AND ${importJobs.status} = 'needs_review'`),
    );
  }
  return statements;
}

/**
 * Saves a new recipe. Its slug is made from its title. With `importJobId` the
 * save also confirms that import: the job must be waiting for review, and the
 * same batch that writes the recipe marks it completed.
 */
export function createRecipe(
  db: D1Database,
  input: RecipeInput,
  memberId: string,
  importJobId: string | null = null,
): Promise<SaveResult> {
  return save(db, { create: true, id: newId(), importJobId }, input, memberId);
}

/**
 * Saves a recipe over the copy the editor loaded. `input.version` is that
 * copy's version; if the recipe has been saved since, nothing is written and
 * the result carries the recipe as it is now.
 */
export function updateRecipe(
  db: D1Database,
  id: string,
  input: RecipeUpdate,
  memberId: string,
): Promise<SaveResult> {
  return save(db, { create: false, id, loadedVersion: input.version }, input, memberId);
}

/** Deletes a recipe and everything that belongs to it. False if there was no such recipe. */
export async function deleteRecipe(db: D1Database, id: string): Promise<boolean> {
  const orm = drizzle(db);
  // The search row goes first and by name, so the index never depends on
  // whether a cascaded delete fires triggers.
  const [, removed] = await orm.batch([
    orm.delete(recipeSearch).where(eq(recipeSearch.recipeId, id)),
    orm.delete(recipes).where(eq(recipes.id, id)).returning({ id: recipes.id }),
  ]);
  return removed.length > 0;
}
