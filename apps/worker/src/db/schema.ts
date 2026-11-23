import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * The Phase 1 tables, as described in docs/implementation-plan.md §4.3.
 *
 * Conventions: IDs are text UUIDs made in the Worker; timestamps are ISO 8601
 * UTC text; booleans are integers; JSON is text, checked by the shared schema
 * on the way in and out. Enumerations that will grow (asset role, job kind,
 * job status) have no CHECK, because changing one means rebuilding the table.
 *
 * Not here, because drizzle-kit does not model them: the `recipes_fts` virtual
 * table and its triggers, and the version-guard trigger. They are hand-written
 * migrations beside the generated one.
 */

const id = () => text("id").primaryKey();
const createdAt = () => text("created_at").notNull();
const updatedAt = () => text("updated_at").notNull();

/** One row, created at first sign-in. */
export const household = sqliteTable(
  "household",
  {
    id: id(),
    singleton: integer("singleton").notNull().default(1).unique(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("household_singleton", sql`${t.singleton} = 1`)],
);

export const members = sqliteTable("members", {
  id: id(),
  /** Lowercased. Null for a member who signs in with a passkey only (Phase 6). */
  email: text("email").unique(),
  displayName: text("display_name").notNull(),
  /** `owner` or `member`. */
  role: text("role").notNull(),
  /** A disabled member cannot sign in. */
  disabledAt: text("disabled_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const recipes = sqliteTable(
  "recipes",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    servings: real("servings"),
    yieldQuantity: real("yield_quantity"),
    yieldUnit: text("yield_unit"),
    prepTimeSeconds: integer("prep_time_seconds"),
    cookTimeSeconds: integer("cook_time_seconds"),
    totalTimeSeconds: integer("total_time_seconds"),
    /** JSON object of schema.org nutrition keys, values as printed. */
    nutrition: text("nutrition"),
    /** "From": who or where the recipe came from. */
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    /** Optimistic concurrency: a save must raise it by exactly one. See the version-guard trigger. */
    version: integer("version").notNull().default(1),
    createdBy: text("created_by")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("recipes_updated_at_idx").on(t.updatedAt),
    index("recipes_created_at_idx").on(t.createdAt),
    index("recipes_title_idx").on(sql`${t.title} COLLATE NOCASE`),
    index("recipes_source_url_idx").on(t.sourceUrl),
  ],
);

export const labels = sqliteTable("labels", {
  id: id(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  color: text("color"),
  /** Aisle order in Phase 4. */
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const foods = sqliteTable(
  "foods",
  {
    id: id(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull().unique(),
    pluralName: text("plural_name"),
    description: text("description").notNull().default(""),
    /** JSON array of strings. */
    aliases: text("aliases").notNull().default("[]"),
    labelId: text("label_id").references(() => labels.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("foods_label_id_idx").on(t.labelId)],
);

export const units = sqliteTable("units", {
  id: id(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  pluralName: text("plural_name"),
  abbreviation: text("abbreviation"),
  pluralAbbreviation: text("plural_abbreviation"),
  useAbbreviation: integer("use_abbreviation", { mode: "boolean" }).notNull().default(false),
  /** Show quantities as fractions (1½ cups) instead of decimals (1.5 kg). */
  fraction: integer("fraction", { mode: "boolean" }).notNull().default(true),
  description: text("description").notNull().default(""),
  /** JSON array of strings, compared as written: "t" is a teaspoon and "T" a tablespoon. */
  aliases: text("aliases").notNull().default("[]"),
  /** With `standard_unit`, the conversion to a base unit. Used from Phase 5. */
  standardQuantity: real("standard_quantity"),
  standardUnit: text("standard_unit"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One row per ingredient line. Replaced on every save; nothing may reference these rows. */
export const recipeIngredients = sqliteTable(
  "recipe_ingredients",
  {
    id: id(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    /** Order within the recipe, across sections. */
    position: integer("position").notNull(),
    /** Section title. Consecutive lines with the same value form one section. */
    section: text("section"),
    /** The line exactly as typed or imported. Parsing never changes it. */
    originalText: text("original_text"),
    quantity: real("quantity"),
    unitId: text("unit_id").references(() => units.id, { onDelete: "restrict" }),
    foodId: text("food_id").references(() => foods.id, { onDelete: "restrict" }),
    note: text("note").notNull().default(""),
  },
  (t) => [
    uniqueIndex("recipe_ingredients_position_idx").on(t.recipeId, t.position),
    index("recipe_ingredients_food_id_idx").on(t.foodId),
    index("recipe_ingredients_unit_id_idx").on(t.unitId),
    check(
      "recipe_ingredients_not_empty",
      sql`${t.originalText} IS NOT NULL OR ${t.foodId} IS NOT NULL OR ${t.note} <> ''`,
    ),
  ],
);

export const recipeSteps = sqliteTable(
  "recipe_steps",
  {
    id: id(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    section: text("section"),
    text: text("text").notNull(),
    /** Written from Phase 2 (step details). */
    durationSeconds: integer("duration_seconds"),
    /** JSON array of `recipe_ingredients.id`. Written from Phase 2. */
    ingredientRefs: text("ingredient_refs").notNull().default("[]"),
  },
  (t) => [uniqueIndex("recipe_steps_position_idx").on(t.recipeId, t.position)],
);

export const recipeNotes = sqliteTable(
  "recipe_notes",
  {
    id: id(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull().default(""),
    text: text("text").notNull(),
  },
  (t) => [uniqueIndex("recipe_notes_position_idx").on(t.recipeId, t.position)],
);

/** Categories, tags and tools: one table, because their shape and behaviour are the same. */
export const organizers = sqliteTable(
  "organizers",
  {
    id: id(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** A category's divider stock: buff, salmon, sky, mint or lilac. Null for tags and tools. */
    color: text("color"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("organizers_kind_slug_idx").on(t.kind, t.slug),
    // A closed set, so a CHECK is safe here.
    check("organizers_kind", sql`${t.kind} IN ('category', 'tag', 'tool')`),
  ],
);

export const recipeOrganizers = sqliteTable(
  "recipe_organizers",
  {
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    organizerId: text("organizer_id")
      .notNull()
      .references(() => organizers.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.organizerId] }),
    index("recipe_organizers_organizer_idx").on(t.organizerId, t.recipeId),
  ],
);

/** Described in docs/implementation-plan.md §7. */
export const importJobs = sqliteTable(
  "import_jobs",
  {
    id: id(),
    /** `url` in Phase 1; `photo`, `text` and `video` later. */
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    /** Current pipeline stage, for progress and for resuming. */
    stage: text("stage"),
    sourceUrl: text("source_url"),
    /** JSON: kind-specific input and options. */
    input: text("input").notNull(),
    /** JSON: the draft, its issues and source details. */
    result: text("result"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull().default(0),
    /** Set when the cook confirms the import. */
    recipeId: text("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    finishedAt: text("finished_at"),
  },
  (t) => [
    index("import_jobs_status_idx").on(t.status, t.createdAt),
    index("import_jobs_created_at_idx").on(t.createdAt),
    index("import_jobs_source_url_idx").on(t.sourceUrl),
  ],
);

/** Images and attachments, owned by a recipe, by an import job, or by each in turn. */
export const assets = sqliteTable(
  "assets",
  {
    /** Also the R2 key prefix. */
    id: id(),
    recipeId: text("recipe_id").references(() => recipes.id, { onDelete: "cascade" }),
    importJobId: text("import_job_id").references(() => importJobs.id, { onDelete: "set null" }),
    /** `cover`, `photo`, `original` (the paper card) or `attachment`. */
    role: text("role").notNull(),
    position: integer("position").notNull().default(0),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    /** True once the resized WebP variants exist. */
    hasVariants: integer("has_variants", { mode: "boolean" }).notNull().default(false),
    originalFilename: text("original_filename"),
    createdBy: text("created_by")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("assets_recipe_idx").on(t.recipeId, t.role, t.position),
    index("assets_import_job_idx").on(t.importJobId),
    // A recipe has at most one cover.
    // The column is named bare: SQLite does not take a table-qualified name in an index's WHERE.
    uniqueIndex("assets_one_cover_idx").on(t.recipeId).where(sql`role = 'cover'`),
  ],
);

/**
 * One row of search text per recipe, written by the save. Three triggers keep
 * the `recipes_fts` index in step with it. `doc_id` is an explicit integer key
 * because FTS5 addresses content by rowid and implicit rowids are not stable.
 */
export const recipeSearch = sqliteTable("recipe_search", {
  docId: integer("doc_id").primaryKey(),
  recipeId: text("recipe_id")
    .notNull()
    .unique()
    .references(() => recipes.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  /** The description, followed by the source name so that "Grandma" finds her recipes. */
  description: text("description").notNull().default(""),
  /** One line per ingredient: the food name if set, then the original text or note. */
  ingredients: text("ingredients").notNull().default(""),
  /** Names of the recipe's categories, tags and tools. */
  organizers: text("organizers").notNull().default(""),
});
