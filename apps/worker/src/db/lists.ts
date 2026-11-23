import {
  type FieldIssue,
  FoodEntry,
  type FoodInput,
  LabelEntry,
  type LabelInput,
  nameKey,
  newId,
  OrganizerColor,
  type OrganizerCreate,
  OrganizerEntry,
  type OrganizerInput,
  slugify,
  UnitEntry,
  type UnitInput,
} from "@recipeflare/schema";
import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";
import { foods, labels, organizers, units } from "./schema";
import { searchRewriteStatements, searchSourceQueries } from "./searchRewrite";

/**
 * The household's lists: organizers (categories, tags and tools), foods, units
 * and labels. Each can be listed with how much it is used, created, changed
 * and deleted.
 *
 * - A name that is taken is refused with the entry that has it.
 * - A food or unit that a recipe uses cannot be deleted.
 * - Renaming or deleting something a recipe's search text contains rewrites
 *   that text in the same batch.
 */

type Statements = [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];

export type ListResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "not_found" }
  /** The name is taken by `existingId`. */
  | { ok: false; reason: "duplicate"; existingId: string }
  | { ok: false; reason: "in_use"; recipeCount: number }
  | { ok: false; reason: "invalid"; issues: FieldIssue[] };

const NOT_FOUND = { ok: false, reason: "not_found" } as const;

function messagesOf(error: unknown): string {
  const parts: string[] = [];
  for (let current = error; current instanceof Error && parts.length < 5; current = current.cause) {
    parts.push(current.message);
  }
  return parts.join(" | ");
}
const isUnique = (error: unknown) => messagesOf(error).includes("UNIQUE constraint failed");
const isForeignKey = (error: unknown) =>
  messagesOf(error).includes("FOREIGN KEY constraint failed");

// --- Organizers ---

type OrganizerRow = {
  id: string;
  kind: string;
  name: string;
  slug: string;
  color: string | null;
  created_at: string;
  updated_at: string;
  recipe_count: number;
};

const ORGANIZER_COLUMNS = sql`o.id, o.kind, o.name, o.slug, o.color, o.created_at, o.updated_at,
  (SELECT COUNT(*) FROM recipe_organizers AS l WHERE l.organizer_id = o.id) AS recipe_count`;

const organizerEntry = (row: OrganizerRow): OrganizerEntry =>
  OrganizerEntry.parse({
    id: row.id,
    kind: row.kind,
    name: row.name,
    slug: row.slug,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recipeCount: row.recipe_count,
  });

/** Every category, tag and tool, by kind and then by name. */
export async function listOrganizers(db: D1Database): Promise<OrganizerEntry[]> {
  const rows = await drizzle(db).all<OrganizerRow>(
    sql`SELECT ${ORGANIZER_COLUMNS} FROM organizers AS o ORDER BY o.kind, o.name COLLATE NOCASE`,
  );
  return rows.map(organizerEntry);
}

/** The stock the fewest categories have, so colours stay spread as categories come and go. */
function leastUsedColor(used: readonly (string | null)[]): OrganizerColor {
  const count = (color: string) => used.filter((value) => value === color).length;
  let best: OrganizerColor = "buff";
  for (const color of OrganizerColor.options) {
    if (count(color) < count(best)) {
      best = color;
    }
  }
  return best;
}

export async function createOrganizer(
  db: D1Database,
  input: OrganizerCreate,
): Promise<ListResult<OrganizerEntry>> {
  const orm = drizzle(db);
  const slug = slugify(input.name);
  const taken = () =>
    orm.all<{ id: string }>(
      sql`SELECT o.id FROM organizers AS o WHERE o.kind = ${input.kind} AND o.slug = ${slug}`,
    );

  const [existing, colors] = await orm.batch([
    taken(),
    orm.all<{ color: string | null }>(
      sql`SELECT o.color FROM organizers AS o WHERE o.kind = 'category'`,
    ),
  ]);
  if (existing[0]) {
    return { ok: false, reason: "duplicate", existingId: existing[0].id };
  }

  const now = new Date().toISOString();
  const row = {
    id: newId(),
    kind: input.kind,
    name: input.name,
    slug,
    color: input.kind === "category" ? leastUsedColor(colors.map((c) => c.color)) : null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await orm.insert(organizers).values(row);
  } catch (error) {
    const winner = isUnique(error) ? (await taken())[0] : undefined;
    if (!winner) {
      throw error;
    }
    return { ok: false, reason: "duplicate", existingId: winner.id };
  }
  return { ok: true, value: OrganizerEntry.parse({ ...row, recipeCount: 0 }) };
}

const recipesWithOrganizer = (id: string) =>
  sql`SELECT l.recipe_id FROM recipe_organizers AS l WHERE l.organizer_id = ${id}`;

export async function renameOrganizer(
  db: D1Database,
  id: string,
  input: OrganizerInput,
): Promise<ListResult<OrganizerEntry>> {
  const orm = drizzle(db);
  const slug = slugify(input.name);
  const clash = () =>
    orm.all<{ id: string }>(
      sql`SELECT o.id FROM organizers AS o
          WHERE o.slug = ${slug} AND o.id <> ${id}
            AND o.kind = (SELECT kind FROM organizers WHERE id = ${id})`,
    );

  const [found, clashes, ...sources] = await orm.batch([
    orm.all<OrganizerRow>(sql`SELECT ${ORGANIZER_COLUMNS} FROM organizers AS o WHERE o.id = ${id}`),
    clash(),
    ...searchSourceQueries(orm, recipesWithOrganizer(id)),
  ]);
  const current = found[0];
  if (!current) {
    return NOT_FOUND;
  }
  if (clashes[0]) {
    return { ok: false, reason: "duplicate", existingId: clashes[0].id };
  }

  const updatedAt = new Date().toISOString();
  try {
    await orm.batch([
      orm
        .update(organizers)
        .set({ name: input.name, slug, updatedAt })
        .where(eq(organizers.id, id)),
      ...searchRewriteStatements(orm, sources, { organizerNames: new Map([[id, input.name]]) }),
    ] as Statements);
  } catch (error) {
    const winner = isUnique(error) ? (await clash())[0] : undefined;
    if (!winner) {
      throw error;
    }
    return { ok: false, reason: "duplicate", existingId: winner.id };
  }
  return {
    ok: true,
    value: organizerEntry({ ...current, name: input.name, slug, updated_at: updatedAt }),
  };
}

/** Deletes a category, tag or tool and takes it off every recipe that had it. */
export async function deleteOrganizer(db: D1Database, id: string): Promise<ListResult<null>> {
  const orm = drizzle(db);
  const [found, ...sources] = await orm.batch([
    orm.all<{ id: string }>(sql`SELECT o.id FROM organizers AS o WHERE o.id = ${id}`),
    ...searchSourceQueries(orm, recipesWithOrganizer(id)),
  ]);
  if (!found[0]) {
    return NOT_FOUND;
  }
  await orm.batch([
    // The links to recipes go with it: they cascade.
    orm.delete(organizers).where(eq(organizers.id, id)),
    ...searchRewriteStatements(orm, sources, { organizerNames: new Map([[id, null]]) }),
  ] as Statements);
  return { ok: true, value: null };
}

// --- Foods ---

type FoodRow = {
  id: string;
  name: string;
  plural_name: string | null;
  description: string;
  aliases: string;
  label_id: string | null;
  created_at: string;
  updated_at: string;
  recipe_count: number;
};

const FOOD_COLUMNS = sql`f.id, f.name, f.plural_name, f.description, f.aliases, f.label_id,
  f.created_at, f.updated_at,
  (SELECT COUNT(DISTINCT i.recipe_id) FROM recipe_ingredients AS i WHERE i.food_id = f.id) AS recipe_count`;

const foodEntry = (row: FoodRow): FoodEntry =>
  FoodEntry.parse({
    id: row.id,
    name: row.name,
    pluralName: row.plural_name,
    description: row.description,
    aliases: JSON.parse(row.aliases),
    labelId: row.label_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recipeCount: row.recipe_count,
  });

export async function listFoods(db: D1Database): Promise<FoodEntry[]> {
  const rows = await drizzle(db).all<FoodRow>(
    sql`SELECT ${FOOD_COLUMNS} FROM foods AS f ORDER BY f.name COLLATE NOCASE`,
  );
  return rows.map(foodEntry);
}

const NO_LABEL: ListResult<never> = {
  ok: false,
  reason: "invalid",
  issues: [{ path: ["labelId"], message: "This label no longer exists" }],
};

const foodValues = (input: FoodInput) => ({
  name: input.name,
  nameKey: nameKey(input.name),
  pluralName: input.pluralName,
  description: input.description,
  aliases: JSON.stringify(input.aliases),
  labelId: input.labelId,
});

export async function createFood(db: D1Database, input: FoodInput): Promise<ListResult<FoodEntry>> {
  const orm = drizzle(db);
  const values = foodValues(input);
  const taken = () =>
    orm.all<{ id: string }>(sql`SELECT f.id FROM foods AS f WHERE f.name_key = ${values.nameKey}`);

  const [existing, label] = await orm.batch([
    taken(),
    orm.all<{ id: string }>(sql`SELECT b.id FROM labels AS b WHERE b.id = ${input.labelId}`),
  ]);
  if (existing[0]) {
    return { ok: false, reason: "duplicate", existingId: existing[0].id };
  }
  if (input.labelId !== null && !label[0]) {
    return NO_LABEL;
  }

  const now = new Date().toISOString();
  const id = newId();
  try {
    await orm.insert(foods).values({ id, ...values, createdAt: now, updatedAt: now });
  } catch (error) {
    if (isForeignKey(error)) {
      return NO_LABEL;
    }
    const winner = isUnique(error) ? (await taken())[0] : undefined;
    if (!winner) {
      throw error;
    }
    return { ok: false, reason: "duplicate", existingId: winner.id };
  }
  return {
    ok: true,
    value: FoodEntry.parse({ id, ...input, createdAt: now, updatedAt: now, recipeCount: 0 }),
  };
}

const recipesWithFood = (id: string) =>
  sql`SELECT DISTINCT i.recipe_id FROM recipe_ingredients AS i WHERE i.food_id = ${id}`;

export async function updateFood(
  db: D1Database,
  id: string,
  input: FoodInput,
): Promise<ListResult<FoodEntry>> {
  const orm = drizzle(db);
  const values = foodValues(input);
  const clash = () =>
    orm.all<{ id: string }>(
      sql`SELECT f.id FROM foods AS f WHERE f.name_key = ${values.nameKey} AND f.id <> ${id}`,
    );

  const [found, clashes, label, ...sources] = await orm.batch([
    orm.all<FoodRow>(sql`SELECT ${FOOD_COLUMNS} FROM foods AS f WHERE f.id = ${id}`),
    clash(),
    orm.all<{ id: string }>(sql`SELECT b.id FROM labels AS b WHERE b.id = ${input.labelId}`),
    ...searchSourceQueries(orm, recipesWithFood(id)),
  ]);
  const current = found[0];
  if (!current) {
    return NOT_FOUND;
  }
  if (clashes[0]) {
    return { ok: false, reason: "duplicate", existingId: clashes[0].id };
  }
  if (input.labelId !== null && !label[0]) {
    return NO_LABEL;
  }

  const updatedAt = new Date().toISOString();
  try {
    await orm.batch([
      orm
        .update(foods)
        .set({ ...values, updatedAt })
        .where(eq(foods.id, id)),
      // Only a new name changes what search finds.
      ...(input.name === current.name
        ? []
        : searchRewriteStatements(orm, sources, { foodNames: new Map([[id, input.name]]) })),
    ] as Statements);
  } catch (error) {
    if (isForeignKey(error)) {
      return NO_LABEL;
    }
    const winner = isUnique(error) ? (await clash())[0] : undefined;
    if (!winner) {
      throw error;
    }
    return { ok: false, reason: "duplicate", existingId: winner.id };
  }
  return {
    ok: true,
    value: FoodEntry.parse({
      id,
      ...input,
      createdAt: current.created_at,
      updatedAt,
      recipeCount: current.recipe_count,
    }),
  };
}

/** Deletes a row that recipes may point at, unless any does. */
async function deleteUnlessUsed(
  db: D1Database,
  table: "foods" | "units",
  id: string,
): Promise<ListResult<null>> {
  const orm = drizzle(db);
  const column = table === "foods" ? sql`i.food_id` : sql`i.unit_id`;
  const read = () =>
    orm.batch([
      orm.all<{ id: string }>(
        table === "foods"
          ? sql`SELECT f.id FROM foods AS f WHERE f.id = ${id}`
          : sql`SELECT u.id FROM units AS u WHERE u.id = ${id}`,
      ),
      orm.all<{ n: number }>(
        sql`SELECT COUNT(DISTINCT i.recipe_id) AS n FROM recipe_ingredients AS i WHERE ${column} = ${id}`,
      ),
    ]);

  const [found, used] = await read();
  if (!found[0]) {
    return NOT_FOUND;
  }
  const recipeCount = used[0]?.n ?? 0;
  if (recipeCount > 0) {
    return { ok: false, reason: "in_use", recipeCount };
  }
  try {
    await (table === "foods"
      ? orm.delete(foods).where(eq(foods.id, id))
      : orm.delete(units).where(eq(units.id, id)));
  } catch (error) {
    if (!isForeignKey(error)) {
      throw error;
    }
    // A recipe started using it between the read and the delete.
    const [, now] = await read();
    return { ok: false, reason: "in_use", recipeCount: Math.max(1, now[0]?.n ?? 1) };
  }
  return { ok: true, value: null };
}

export const deleteFood = (db: D1Database, id: string) => deleteUnlessUsed(db, "foods", id);

// --- Units ---

type UnitRow = {
  id: string;
  name: string;
  plural_name: string | null;
  abbreviation: string | null;
  plural_abbreviation: string | null;
  use_abbreviation: number;
  fraction: number;
  description: string;
  aliases: string;
  standard_quantity: number | null;
  standard_unit: string | null;
  created_at: string;
  updated_at: string;
  recipe_count: number;
};

const UNIT_COLUMNS = sql`u.id, u.name, u.plural_name, u.abbreviation, u.plural_abbreviation,
  u.use_abbreviation, u.fraction, u.description, u.aliases, u.standard_quantity, u.standard_unit,
  u.created_at, u.updated_at,
  (SELECT COUNT(DISTINCT i.recipe_id) FROM recipe_ingredients AS i WHERE i.unit_id = u.id) AS recipe_count`;

const unitEntry = (row: UnitRow): UnitEntry =>
  UnitEntry.parse({
    id: row.id,
    name: row.name,
    pluralName: row.plural_name,
    abbreviation: row.abbreviation,
    pluralAbbreviation: row.plural_abbreviation,
    useAbbreviation: Boolean(row.use_abbreviation),
    fraction: Boolean(row.fraction),
    description: row.description,
    aliases: JSON.parse(row.aliases),
    standardQuantity: row.standard_quantity,
    standardUnit: row.standard_unit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recipeCount: row.recipe_count,
  });

export async function listUnits(db: D1Database): Promise<UnitEntry[]> {
  const rows = await drizzle(db).all<UnitRow>(
    sql`SELECT ${UNIT_COLUMNS} FROM units AS u ORDER BY u.name COLLATE NOCASE`,
  );
  return rows.map(unitEntry);
}

const unitValues = (input: UnitInput) => ({
  name: input.name,
  nameKey: nameKey(input.name),
  pluralName: input.pluralName,
  abbreviation: input.abbreviation,
  pluralAbbreviation: input.pluralAbbreviation,
  useAbbreviation: input.useAbbreviation,
  fraction: input.fraction,
  description: input.description,
  aliases: JSON.stringify(input.aliases),
  standardQuantity: input.standardQuantity,
  standardUnit: input.standardUnit,
});

export async function createUnit(db: D1Database, input: UnitInput): Promise<ListResult<UnitEntry>> {
  const orm = drizzle(db);
  const values = unitValues(input);
  const taken = () =>
    orm.all<{ id: string }>(sql`SELECT u.id FROM units AS u WHERE u.name_key = ${values.nameKey}`);

  const existing = await taken();
  if (existing[0]) {
    return { ok: false, reason: "duplicate", existingId: existing[0].id };
  }
  const now = new Date().toISOString();
  const id = newId();
  try {
    await orm.insert(units).values({ id, ...values, createdAt: now, updatedAt: now });
  } catch (error) {
    const winner = isUnique(error) ? (await taken())[0] : undefined;
    if (!winner) {
      throw error;
    }
    return { ok: false, reason: "duplicate", existingId: winner.id };
  }
  return {
    ok: true,
    value: UnitEntry.parse({ id, ...input, createdAt: now, updatedAt: now, recipeCount: 0 }),
  };
}

export async function updateUnit(
  db: D1Database,
  id: string,
  input: UnitInput,
): Promise<ListResult<UnitEntry>> {
  const orm = drizzle(db);
  const values = unitValues(input);
  const clash = () =>
    orm.all<{ id: string }>(
      sql`SELECT u.id FROM units AS u WHERE u.name_key = ${values.nameKey} AND u.id <> ${id}`,
    );

  const [found, clashes] = await orm.batch([
    orm.all<UnitRow>(sql`SELECT ${UNIT_COLUMNS} FROM units AS u WHERE u.id = ${id}`),
    clash(),
  ]);
  const current = found[0];
  if (!current) {
    return NOT_FOUND;
  }
  if (clashes[0]) {
    return { ok: false, reason: "duplicate", existingId: clashes[0].id };
  }
  const updatedAt = new Date().toISOString();
  try {
    await orm
      .update(units)
      .set({ ...values, updatedAt })
      .where(eq(units.id, id));
  } catch (error) {
    const winner = isUnique(error) ? (await clash())[0] : undefined;
    if (!winner) {
      throw error;
    }
    return { ok: false, reason: "duplicate", existingId: winner.id };
  }
  return {
    ok: true,
    value: UnitEntry.parse({
      id,
      ...input,
      createdAt: current.created_at,
      updatedAt,
      recipeCount: current.recipe_count,
    }),
  };
}

export const deleteUnit = (db: D1Database, id: string) => deleteUnlessUsed(db, "units", id);

// --- Labels ---

type LabelRow = {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  food_count: number;
};

const LABEL_COLUMNS = sql`b.id, b.name, b.color, b.sort_order, b.created_at, b.updated_at,
  (SELECT COUNT(*) FROM foods AS f WHERE f.label_id = b.id) AS food_count`;

const labelEntry = (row: LabelRow): LabelEntry =>
  LabelEntry.parse({
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    foodCount: row.food_count,
  });

/** Every label, in the household's own order and then by name. */
export async function listLabels(db: D1Database): Promise<LabelEntry[]> {
  const rows = await drizzle(db).all<LabelRow>(
    sql`SELECT ${LABEL_COLUMNS} FROM labels AS b ORDER BY b.sort_order, b.name COLLATE NOCASE`,
  );
  return rows.map(labelEntry);
}

export async function createLabel(
  db: D1Database,
  input: LabelInput,
): Promise<ListResult<LabelEntry>> {
  const orm = drizzle(db);
  const key = nameKey(input.name);
  const taken = () =>
    orm.all<{ id: string }>(sql`SELECT b.id FROM labels AS b WHERE b.name_key = ${key}`);

  const existing = await taken();
  if (existing[0]) {
    return { ok: false, reason: "duplicate", existingId: existing[0].id };
  }
  const now = new Date().toISOString();
  const id = newId();
  try {
    await orm.insert(labels).values({
      id,
      name: input.name,
      nameKey: key,
      color: input.color,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    const winner = isUnique(error) ? (await taken())[0] : undefined;
    if (!winner) {
      throw error;
    }
    return { ok: false, reason: "duplicate", existingId: winner.id };
  }
  return {
    ok: true,
    value: LabelEntry.parse({ id, ...input, createdAt: now, updatedAt: now, foodCount: 0 }),
  };
}

export async function updateLabel(
  db: D1Database,
  id: string,
  input: LabelInput,
): Promise<ListResult<LabelEntry>> {
  const orm = drizzle(db);
  const key = nameKey(input.name);
  const clash = () =>
    orm.all<{ id: string }>(
      sql`SELECT b.id FROM labels AS b WHERE b.name_key = ${key} AND b.id <> ${id}`,
    );

  const [found, clashes] = await orm.batch([
    orm.all<LabelRow>(sql`SELECT ${LABEL_COLUMNS} FROM labels AS b WHERE b.id = ${id}`),
    clash(),
  ]);
  const current = found[0];
  if (!current) {
    return NOT_FOUND;
  }
  if (clashes[0]) {
    return { ok: false, reason: "duplicate", existingId: clashes[0].id };
  }
  const updatedAt = new Date().toISOString();
  try {
    await orm
      .update(labels)
      .set({
        name: input.name,
        nameKey: key,
        color: input.color,
        sortOrder: input.sortOrder,
        updatedAt,
      })
      .where(eq(labels.id, id));
  } catch (error) {
    const winner = isUnique(error) ? (await clash())[0] : undefined;
    if (!winner) {
      throw error;
    }
    return { ok: false, reason: "duplicate", existingId: winner.id };
  }
  return {
    ok: true,
    value: LabelEntry.parse({
      id,
      ...input,
      createdAt: current.created_at,
      updatedAt,
      foodCount: current.food_count,
    }),
  };
}

/** Deletes a label. The foods that had it keep everything else and lose the label. */
export async function deleteLabel(db: D1Database, id: string): Promise<ListResult<null>> {
  const removed = await drizzle(db)
    .delete(labels)
    .where(eq(labels.id, id))
    .returning({ id: labels.id });
  return removed.length > 0 ? { ok: true, value: null } : NOT_FOUND;
}
