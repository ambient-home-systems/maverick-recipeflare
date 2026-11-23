import { nameKey } from "@recipeflare/schema";
import {
  FIXTURE_TIME,
  fixtureFoods,
  fixtureLabels,
  fixtureMember,
  fixtureOrganizers,
  fixtureUnits,
} from "@recipeflare/schema/fixtures";
import { drizzle } from "drizzle-orm/d1";
import { chunkRows } from "../src/db/chunk";
import { foods, labels, members, organizers, units } from "../src/db/schema";

/**
 * Gives a test file's database the household the fixtures describe: one
 * member, and the fixture labels, foods, units and organizers. The units the
 * migration seeds are replaced by the fixtures' own, so that fixture recipes
 * can be saved as they are.
 */
export async function seedLists(db: D1Database): Promise<void> {
  const orm = drizzle(db);
  const at = { createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME };
  await db.prepare("DELETE FROM units").run();
  await orm.insert(members).values({
    id: fixtureMember.id,
    email: fixtureMember.email,
    displayName: fixtureMember.displayName,
    role: fixtureMember.role,
    ...at,
  });
  for (const rows of chunkRows(fixtureLabels, 7)) {
    await orm.insert(labels).values(
      rows.map((label) => ({
        id: label.id,
        name: label.name,
        nameKey: nameKey(label.name),
        color: label.color,
        sortOrder: label.sortOrder,
        createdAt: label.createdAt,
        updatedAt: label.updatedAt,
      })),
    );
  }
  for (const rows of chunkRows(fixtureFoods, 9)) {
    await orm.insert(foods).values(
      rows.map((food) => ({
        id: food.id,
        name: food.name,
        nameKey: nameKey(food.name),
        pluralName: food.pluralName,
        description: food.description,
        aliases: JSON.stringify(food.aliases),
        labelId: food.labelId,
        createdAt: food.createdAt,
        updatedAt: food.updatedAt,
      })),
    );
  }
  for (const rows of chunkRows(fixtureUnits, 14)) {
    await orm.insert(units).values(
      rows.map((unit) => ({
        id: unit.id,
        name: unit.name,
        nameKey: nameKey(unit.name),
        pluralName: unit.pluralName,
        abbreviation: unit.abbreviation,
        pluralAbbreviation: unit.pluralAbbreviation,
        useAbbreviation: unit.useAbbreviation,
        fraction: unit.fraction,
        description: unit.description,
        aliases: JSON.stringify(unit.aliases),
        standardQuantity: unit.standardQuantity,
        standardUnit: unit.standardUnit,
        createdAt: unit.createdAt,
        updatedAt: unit.updatedAt,
      })),
    );
  }
  for (const rows of chunkRows(fixtureOrganizers, 7)) {
    await orm.insert(organizers).values(
      rows.map((organizer) => ({
        id: organizer.id,
        kind: organizer.kind,
        name: organizer.name,
        slug: organizer.slug,
        color: null,
        createdAt: organizer.createdAt,
        updatedAt: organizer.updatedAt,
      })),
    );
  }
}

const RUNS = new Set(["all", "run", "first", "raw"]);

/**
 * Wraps a database so a test can count its round trips: how many batches were
 * sent, and how many statements were run by themselves.
 */
export function countingDatabase(real: D1Database) {
  let batches = 0;
  let statementsOutsideABatch = 0;
  const originals = new WeakMap<object, D1PreparedStatement>();

  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(statement, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") {
          return value;
        }
        if (property === "bind") {
          return (...values: unknown[]) => wrap(target.bind(...values));
        }
        if (typeof property === "string" && RUNS.has(property)) {
          return (...args: unknown[]) => {
            statementsOutsideABatch++;
            return value.apply(target, args);
          };
        }
        return value.bind(target);
      },
    });
    originals.set(proxy, statement);
    return proxy;
  };

  const db = new Proxy(real, {
    get(target, property) {
      if (property === "prepare") {
        return (query: string) => wrap(target.prepare(query));
      }
      if (property === "batch") {
        return (statements: D1PreparedStatement[]) => {
          batches++;
          return target.batch(statements.map((statement) => originals.get(statement) ?? statement));
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return { db, counts: () => ({ batches, statementsOutsideABatch }) };
}
