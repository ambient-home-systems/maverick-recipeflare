import { env } from "cloudflare:workers";
import { nameKey, Unit, unitMatcher } from "@recipeflare/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../src/db/schema";

const NOW = "2026-11-23T12:00:00.000Z";
const MEMBER = "00000000-0000-7000-8000-0a0000000001";

const db = env.DB;
const id = (n: number) => `00000000-0000-7000-8000-0b${n.toString(16).padStart(10, "0")}`;

const count = async (table: string, where = "1 = 1", ...values: unknown[]) =>
  (
    await db
      .prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`)
      .bind(...values)
      .first<{ n: number }>()
  )?.n ?? -1;

const insertRecipe = (recipeId: string, title: string) =>
  db
    .prepare(
      "INSERT INTO recipes (id, slug, title, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(recipeId, `slug-${recipeId}`, title, MEMBER, MEMBER, NOW, NOW);

const insertSearch = (
  recipeId: string,
  text: Partial<Record<"title" | "description" | "ingredients" | "organizers", string>>,
) =>
  db
    .prepare(
      "INSERT INTO recipe_search (recipe_id, title, description, ingredients, organizers) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      recipeId,
      text.title ?? "",
      text.description ?? "",
      text.ingredients ?? "",
      text.organizers ?? "",
    );

/** The recipes the search index finds for a query, by ID. */
const search = async (query: string) =>
  (
    await db
      .prepare(
        "SELECT s.recipe_id FROM recipes_fts JOIN recipe_search s ON s.doc_id = recipes_fts.rowid WHERE recipes_fts MATCH ? ORDER BY s.recipe_id",
      )
      .bind(query)
      .all<{ recipe_id: string }>()
  ).results.map((row) => row.recipe_id);

beforeAll(async () => {
  await db
    .prepare(
      "INSERT INTO members (id, email, display_name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(MEMBER, "cook@example.com", "Sam", "owner", NOW, NOW)
    .run();
});

describe("the migrations", () => {
  it("are the four on disk, applied in order", async () => {
    const applied = await db
      .prepare("SELECT name FROM d1_migrations ORDER BY id")
      .all<{ name: string }>();
    expect(applied.results.map((row) => row.name.replace(/^\d+_/, ""))).toEqual([
      "tables/migration.sql",
      "search_index/migration.sql",
      "version_guard/migration.sql",
      "seed_units/migration.sql",
    ]);
  });

  it("create every Phase 1 table", async () => {
    const tables = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'recipes_fts%' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
      )
      .all<{ name: string }>();
    expect(tables.results.map((row) => row.name)).toEqual([
      "assets",
      "foods",
      "household",
      "import_jobs",
      "labels",
      "members",
      "organizers",
      "recipe_ingredients",
      "recipe_notes",
      "recipe_organizers",
      "recipe_search",
      "recipe_steps",
      "recipes",
      "units",
    ]);
  });

  it("create the triggers with their whole bodies, BEGIN to END", async () => {
    const triggers = await db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all<{ name: string; sql: string }>();
    expect(triggers.results.map((row) => row.name)).toEqual([
      "recipe_search_ad",
      "recipe_search_ai",
      "recipe_search_au",
      "recipes_version_guard",
    ]);
    for (const trigger of triggers.results) {
      expect(trigger.sql.trim().endsWith("END"), trigger.name).toBe(true);
    }
    // The update trigger has two statements in its body; both must have survived.
    const update = triggers.results.find((row) => row.name === "recipe_search_au");
    expect(update?.sql.match(/INSERT INTO recipes_fts/g)).toHaveLength(2);
  });
});

describe("the seeded units", () => {
  it("are 25 units the shared schema accepts, each with the name key the shared function gives", async () => {
    const rows = await drizzle(db).select().from(schema.units);
    expect(rows).toHaveLength(25);
    for (const row of rows) {
      expect(row.nameKey, row.name).toBe(nameKey(row.name));
      expect(
        () => Unit.parse({ ...row, aliases: JSON.parse(row.aliases) }),
        row.name,
      ).not.toThrow();
    }
  });

  it("tell a card's t from its T, and read its other abbreviations", async () => {
    const rows = await drizzle(db).select().from(schema.units);
    const units = rows.map((row) => ({ ...row, aliases: JSON.parse(row.aliases) as string[] }));
    const match = unitMatcher(units);
    const name = (text: string) => units.find((unit) => unit.id === match(text))?.name ?? null;

    expect(name("t")).toBe("teaspoon");
    expect(name("T")).toBe("tablespoon");
    expect(name("t.")).toBe("teaspoon");
    expect(name("C.")).toBe("cup");
    expect(name("c")).toBe("cup");
    expect(name("lbs.")).toBe("pound");
    expect(name("Tbsp")).toBe("tablespoon");
    expect(name("oz")).toBe("ounce");
    expect(name("handful")).toBeNull();
  });

  it("give no name, abbreviation or alias to two units", async () => {
    const rows = await drizzle(db).select().from(schema.units);
    const seen = new Map<string, string>();
    for (const row of rows) {
      const names = [
        row.name,
        row.pluralName,
        row.abbreviation,
        row.pluralAbbreviation,
        ...(JSON.parse(row.aliases) as string[]),
      ];
      for (const text of new Set(names.filter((value): value is string => value !== null))) {
        // One-letter names are told apart by case; longer ones are not.
        const key = text.length <= 1 ? text : text.toLowerCase();
        expect(seen.get(key) ?? row.name, `"${text}"`).toBe(row.name);
        seen.set(key, row.name);
      }
    }
  });
});

describe("the search index", () => {
  it("finds a recipe by its title, an ingredient and an organizer as soon as its search row is written", async () => {
    await db.batch([
      insertRecipe(id(1), "Lemony Red Lentil Soup"),
      insertSearch(id(1), {
        title: "Lemony Red Lentil Soup",
        description: "Bright and quick. Example Kitchen",
        ingredients: "red lentils 1 cup red lentils, rinsed\ncarrot 2 carrots, chopped",
        organizers: "Soup Weeknight Vegetarian",
      }),
    ]);

    expect(await search('"lentil"')).toEqual([id(1)]);
    expect(await search('"carrot"')).toEqual([id(1)]);
    expect(await search('"weeknight"')).toEqual([id(1)]);
    expect(await search('"kitchen"')).toEqual([id(1)]);
    expect(await search('"zucchini"')).toEqual([]);
  });

  it("ignores plurals and accents, and matches the start of the last word", async () => {
    await db.batch([
      insertRecipe(id(2), "Crème Brûlée"),
      insertSearch(id(2), { title: "Crème Brûlée", ingredients: "tomato 3 tomatoes" }),
    ]);

    expect(await search('"creme"')).toEqual([id(2)]);
    expect(await search('"tomato"')).toEqual([id(2)]);
    expect(await search('"tomatoes"')).toEqual([id(2)]);
    expect(await search('"creme" AND "bru"*')).toEqual([id(2)]);
  });

  it("follows a change to the search row: the old words stop matching and the new ones start", async () => {
    await db.batch([
      insertRecipe(id(3), "Sheet Pan Sausages"),
      insertSearch(id(3), { title: "Sheet Pan Sausages", organizers: "Weeknight" }),
    ]);
    expect(await search('"sausages"')).toEqual([id(3)]);

    await db
      .prepare("UPDATE recipe_search SET title = ?, organizers = ? WHERE recipe_id = ?")
      .bind("Tray-Baked Chorizo", "Sunday", id(3))
      .run();

    expect(await search('"sausages"')).toEqual([]);
    expect(await search('"chorizo"')).toEqual([id(3)]);
    expect(await search('"sunday"')).toEqual([id(3)]);
  });

  it("forgets a recipe when its search row is deleted", async () => {
    await db.batch([
      insertRecipe(id(4), "Quince Paste"),
      insertSearch(id(4), { title: "Quince Paste" }),
    ]);
    expect(await search('"quince"')).toEqual([id(4)]);

    // The save deletes the search row itself, before the recipe, in one batch.
    await db.batch([
      db.prepare("DELETE FROM recipe_search WHERE recipe_id = ?").bind(id(4)),
      db.prepare("DELETE FROM recipes WHERE id = ?").bind(id(4)),
    ]);

    expect(await search('"quince"')).toEqual([]);
    expect(await count("recipes", "id = ?", id(4))).toBe(0);
  });

  it("drops a recipe from the index even when only the recipe is deleted", async () => {
    await db.batch([
      insertRecipe(id(6), "Gooseberry Crumble"),
      insertSearch(id(6), { title: "Gooseberry Crumble" }),
    ]);
    const indexed = async () =>
      (
        await db
          .prepare("SELECT count(*) AS n FROM recipes_fts WHERE recipes_fts MATCH ?")
          .bind('"gooseberry"')
          .first<{ n: number }>()
      )?.n;
    expect(await indexed()).toBe(1);

    // The search row goes by cascade here, not by its own DELETE. The delete
    // trigger still fires, so the index does not keep a row with nothing behind it.
    await db.prepare("DELETE FROM recipes WHERE id = ?").bind(id(6)).run();

    expect(await indexed()).toBe(0);
  });

  it("can be rebuilt from the search rows", async () => {
    await db.batch([
      insertRecipe(id(5), "Rhubarb Fool"),
      insertSearch(id(5), { title: "Rhubarb Fool" }),
    ]);
    await db.prepare("INSERT INTO recipes_fts (recipes_fts) VALUES ('rebuild')").run();
    expect(await search('"rhubarb"')).toEqual([id(5)]);
  });
});

describe("the version guard", () => {
  const ingredient = (rowId: string, recipeId: string, text: string) =>
    db
      .prepare(
        "INSERT INTO recipe_ingredients (id, recipe_id, position, original_text) VALUES (?, ?, ?, ?)",
      )
      .bind(rowId, recipeId, 0, text);
  const save = (recipeId: string, title: string, loadedVersion: number, lineId: string) =>
    db.batch([
      db
        .prepare("UPDATE recipes SET title = ?, version = ? WHERE id = ?")
        .bind(title, loadedVersion + 1, recipeId),
      db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").bind(recipeId),
      ingredient(lineId, recipeId, `line for ${title}`),
    ]);

  it("lets a save through when it raises the version by exactly one", async () => {
    await insertRecipe(id(10), "First").run();
    await save(id(10), "Second", 1, id(11));

    const row = await db
      .prepare("SELECT title, version FROM recipes WHERE id = ?")
      .bind(id(10))
      .first();
    expect(row).toEqual({ title: "Second", version: 2 });
  });

  it("aborts the whole batch when someone else saved first, leaving the recipe and its lines as they were", async () => {
    await insertRecipe(id(20), "Original").run();
    await ingredient(id(21), id(20), "2 eggs").run();
    // Another device saves: the version goes from 1 to 2.
    await save(id(20), "Theirs", 1, id(22));

    // This device loaded version 1 and saves now.
    await expect(save(id(20), "Mine", 1, id(23))).rejects.toThrow(/version_conflict/);

    const row = await db
      .prepare("SELECT title, version FROM recipes WHERE id = ?")
      .bind(id(20))
      .first();
    expect(row).toEqual({ title: "Theirs", version: 2 });
    // Nothing else in the batch happened either: their line is still there and ours is not.
    const lines = await db
      .prepare("SELECT id FROM recipe_ingredients WHERE recipe_id = ?")
      .bind(id(20))
      .all<{ id: string }>();
    expect(lines.results.map((line) => line.id)).toEqual([id(22)]);
  });

  it("does not get in the way of an update that leaves the version alone", async () => {
    await insertRecipe(id(30), "Untouched").run();
    await db
      .prepare("UPDATE recipes SET description = ? WHERE id = ?")
      .bind("A note", id(30))
      .run();
    expect(
      await count("recipes", "id = ? AND description = 'A note' AND version = 1", id(30)),
    ).toBe(1);
  });
});

describe("deleting", () => {
  it("takes a recipe's lines, steps, notes, organizer links, photos and search row with it", async () => {
    const recipe = id(40);
    await db.batch([
      insertRecipe(recipe, "Doomed"),
      db
        .prepare(
          "INSERT INTO organizers (id, kind, name, slug, created_at, updated_at) VALUES (?, 'tag', 'Holiday', 'holiday', ?, ?)",
        )
        .bind(id(41), NOW, NOW),
      db
        .prepare(
          "INSERT INTO recipe_ingredients (id, recipe_id, position, original_text) VALUES (?, ?, 0, '2 eggs')",
        )
        .bind(id(42), recipe),
      db
        .prepare(
          "INSERT INTO recipe_steps (id, recipe_id, position, text) VALUES (?, ?, 0, 'Whisk.')",
        )
        .bind(id(43), recipe),
      db
        .prepare(
          "INSERT INTO recipe_notes (id, recipe_id, position, text) VALUES (?, ?, 0, 'Good cold.')",
        )
        .bind(id(44), recipe),
      db
        .prepare("INSERT INTO recipe_organizers (recipe_id, organizer_id) VALUES (?, ?)")
        .bind(recipe, id(41)),
      db
        .prepare(
          "INSERT INTO assets (id, recipe_id, role, content_type, size_bytes, created_by, created_at) VALUES (?, ?, 'cover', 'image/jpeg', 1000, ?, ?)",
        )
        .bind(id(45), recipe, MEMBER, NOW),
      insertSearch(recipe, { title: "Doomed" }),
    ]);

    await db.prepare("DELETE FROM recipes WHERE id = ?").bind(recipe).run();

    for (const table of [
      "recipe_ingredients",
      "recipe_steps",
      "recipe_notes",
      "recipe_organizers",
      "assets",
      "recipe_search",
    ]) {
      expect(await count(table, "recipe_id = ?", recipe), table).toBe(0);
    }
    // The tag itself is not the recipe's to delete.
    expect(await count("organizers", "id = ?", id(41))).toBe(1);
  });

  it("takes an organizer's links with it, and leaves the recipes", async () => {
    await db.batch([
      insertRecipe(id(50), "Kept"),
      db
        .prepare(
          "INSERT INTO organizers (id, kind, name, slug, created_at, updated_at) VALUES (?, 'category', 'Dinner', 'dinner', ?, ?)",
        )
        .bind(id(51), NOW, NOW),
      db
        .prepare("INSERT INTO recipe_organizers (recipe_id, organizer_id) VALUES (?, ?)")
        .bind(id(50), id(51)),
    ]);
    await db.prepare("DELETE FROM organizers WHERE id = ?").bind(id(51)).run();

    expect(await count("recipe_organizers", "organizer_id = ?", id(51))).toBe(0);
    expect(await count("recipes", "id = ?", id(50))).toBe(1);
  });

  it("refuses to delete a food or a unit that a recipe uses", async () => {
    const teaspoon = "00000000-0000-7000-8000-020000000001";
    await db.batch([
      insertRecipe(id(60), "Uses salt"),
      db
        .prepare(
          "INSERT INTO foods (id, name, name_key, created_at, updated_at) VALUES (?, 'salt', 'salt', ?, ?)",
        )
        .bind(id(61), NOW, NOW),
      db
        .prepare(
          "INSERT INTO recipe_ingredients (id, recipe_id, position, original_text, quantity, unit_id, food_id) VALUES (?, ?, 0, '1 tsp salt', 1, ?, ?)",
        )
        .bind(id(62), id(60), teaspoon, id(61)),
    ]);

    await expect(db.prepare("DELETE FROM foods WHERE id = ?").bind(id(61)).run()).rejects.toThrow(
      /FOREIGN KEY/,
    );
    await expect(db.prepare("DELETE FROM units WHERE id = ?").bind(teaspoon).run()).rejects.toThrow(
      /FOREIGN KEY/,
    );
  });

  it("refuses to delete a member who has recipes", async () => {
    await insertRecipe(id(70), "Sam's").run();
    await expect(db.prepare("DELETE FROM members WHERE id = ?").bind(MEMBER).run()).rejects.toThrow(
      /FOREIGN KEY/,
    );
  });

  it("clears a food's label and an import's recipe when those are deleted, keeping the food and the import", async () => {
    await db.batch([
      db
        .prepare(
          "INSERT INTO labels (id, name, name_key, created_at, updated_at) VALUES (?, 'Dairy', 'dairy', ?, ?)",
        )
        .bind(id(80), NOW, NOW),
      db
        .prepare(
          "INSERT INTO foods (id, name, name_key, label_id, created_at, updated_at) VALUES (?, 'milk', 'milk', ?, ?, ?)",
        )
        .bind(id(81), id(80), NOW, NOW),
      insertRecipe(id(82), "Imported"),
      db
        .prepare(
          "INSERT INTO import_jobs (id, kind, status, input, recipe_id, created_by, created_at, updated_at) VALUES (?, 'url', 'completed', '{}', ?, ?, ?, ?)",
        )
        .bind(id(83), id(82), MEMBER, NOW, NOW),
    ]);

    await db.batch([
      db.prepare("DELETE FROM labels WHERE id = ?").bind(id(80)),
      db.prepare("DELETE FROM recipes WHERE id = ?").bind(id(82)),
    ]);

    expect(
      await db.prepare("SELECT label_id FROM foods WHERE id = ?").bind(id(81)).first(),
    ).toEqual({ label_id: null });
    expect(
      await db.prepare("SELECT recipe_id FROM import_jobs WHERE id = ?").bind(id(83)).first(),
    ).toEqual({ recipe_id: null });
  });
});

describe("the constraints", () => {
  it("allow one household row only", async () => {
    await db
      .prepare("INSERT INTO household (id, name, slug, created_at) VALUES (?, 'Home', 'home', ?)")
      .bind(id(90), NOW)
      .run();
    await expect(
      db
        .prepare(
          "INSERT INTO household (id, name, slug, created_at) VALUES (?, 'Second', 'second', ?)",
        )
        .bind(id(91), NOW)
        .run(),
    ).rejects.toThrow(/UNIQUE/);
    await expect(
      db
        .prepare(
          "INSERT INTO household (id, singleton, name, slug, created_at) VALUES (?, 2, 'Third', 'third', ?)",
        )
        .bind(id(92), NOW)
        .run(),
    ).rejects.toThrow(/CHECK/);
  });

  it("refuse an ingredient line with nothing in it, and take one that is only its text", async () => {
    await insertRecipe(id(100), "Lines").run();
    await expect(
      db
        .prepare("INSERT INTO recipe_ingredients (id, recipe_id, position) VALUES (?, ?, 0)")
        .bind(id(101), id(100))
        .run(),
    ).rejects.toThrow(/CHECK/);
    await db
      .prepare(
        "INSERT INTO recipe_ingredients (id, recipe_id, position, original_text) VALUES (?, ?, 0, 'a knob of butter')",
      )
      .bind(id(102), id(100))
      .run();
    expect(await count("recipe_ingredients", "recipe_id = ?", id(100))).toBe(1);
  });

  it("refuse two lines at one position in a recipe", async () => {
    await insertRecipe(id(110), "Positions").run();
    await db
      .prepare(
        "INSERT INTO recipe_ingredients (id, recipe_id, position, original_text) VALUES (?, ?, 0, 'one')",
      )
      .bind(id(111), id(110))
      .run();
    await expect(
      db
        .prepare(
          "INSERT INTO recipe_ingredients (id, recipe_id, position, original_text) VALUES (?, ?, 0, 'two')",
        )
        .bind(id(112), id(110))
        .run(),
    ).rejects.toThrow(/UNIQUE/);
  });

  it("know only three kinds of organizer, and one of each name within a kind", async () => {
    const organizer = (rowId: string, kind: string, slug: string) =>
      db
        .prepare(
          "INSERT INTO organizers (id, kind, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(rowId, kind, slug, slug, NOW, NOW);
    await expect(organizer(id(120), "cuisine", "thai").run()).rejects.toThrow(/CHECK/);
    await organizer(id(121), "tag", "quick").run();
    // The same name is fine as a tool; it is taken as a tag.
    await organizer(id(122), "tool", "quick").run();
    await expect(organizer(id(123), "tag", "quick").run()).rejects.toThrow(/UNIQUE/);
  });

  it("allow a recipe one cover and any number of other photos", async () => {
    await insertRecipe(id(130), "Photos").run();
    const asset = (rowId: string, role: string) =>
      db
        .prepare(
          "INSERT INTO assets (id, recipe_id, role, content_type, size_bytes, created_by, created_at) VALUES (?, ?, ?, 'image/jpeg', 1000, ?, ?)",
        )
        .bind(rowId, id(130), role, MEMBER, NOW);
    await asset(id(131), "cover").run();
    await asset(id(132), "photo").run();
    await asset(id(133), "photo").run();
    await expect(asset(id(134), "cover").run()).rejects.toThrow(/UNIQUE/);
  });

  it("refuse a recipe written by a member who does not exist", async () => {
    await expect(
      db
        .prepare(
          "INSERT INTO recipes (id, slug, title, created_by, updated_by, created_at, updated_at) VALUES (?, 'ghost', 'Ghost', ?, ?, ?, ?)",
        )
        .bind(id(140), id(141), id(141), NOW, NOW)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});

describe("the Drizzle schema", () => {
  it("writes and reads a row with its defaults, in the shapes the columns declare", async () => {
    const orm = drizzle(db);
    await orm.insert(schema.recipes).values({
      id: id(150),
      slug: "typed",
      title: "Typed",
      createdBy: MEMBER,
      updatedBy: MEMBER,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await orm.insert(schema.assets).values({
      id: id(151),
      recipeId: id(150),
      role: "photo",
      contentType: "image/webp",
      sizeBytes: 2048,
      createdBy: MEMBER,
      createdAt: NOW,
    });

    const [recipe] = await orm
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.id, id(150)));
    expect(recipe).toMatchObject({ description: "", version: 1, servings: null, sourceName: null });
    const [asset] = await orm
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, id(151)));
    // A boolean column comes back as a boolean, not as 0.
    expect(asset).toMatchObject({ hasVariants: false, position: 0, width: null });
  });
});
