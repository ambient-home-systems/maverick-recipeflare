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
import type { AiBinding, AiRunner } from "../src/ai/runner";
import { type AppOptions, createApp } from "../src/app";
import type { AppEnv } from "../src/auth/types";
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
        color: organizer.color,
        createdAt: organizer.createdAt,
        updatedAt: organizer.updatedAt,
      })),
    );
  }
}

/**
 * A model runner for a test that must not reach a model: using it fails the
 * test. Tests never call the real one, which bills the real service.
 */
export const noAi: AiRunner = {
  profile: () => {
    throw new Error("this test was not expected to use a model");
  },
  run: () => Promise.reject(new Error("this test was not expected to use a model")),
};

/** One call a stand-in binding was asked to make. */
export type AiCall = {
  model: string;
  inputs: Record<string, unknown>;
  options?: Record<string, unknown>;
};

/** A chat answer as the service gives it, around the text a model wrote. */
export const chatAnswer = (content: unknown, extra: Record<string, unknown> = {}) => ({
  model: "@cf/test/stand-in",
  choices: [
    {
      message: { content: typeof content === "string" ? content : JSON.stringify(content) },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 7 },
  ...extra,
});

/**
 * Stands in for the Workers AI binding. Each call takes the next of
 * `answers`: an `Error` is thrown, anything else is returned as the service's
 * answer. The last answer is repeated.
 *
 * The question of which organizers fit a recipe is asked beside the one that
 * writes it up, so its place in the order is not fixed. It is kept apart: it
 * is answered with `organizers` (by default, none fit), and its calls are
 * listed under `organizerCalls`, so a test that is not about organizers is
 * not disturbed by it.
 */
export function standInBinding(
  answers: unknown[],
  organizers: unknown = chatAnswer({ categories: [], tags: [], tools: [] }),
): AiBinding & { calls: AiCall[]; organizerCalls: AiCall[] } {
  const calls: AiCall[] = [];
  const organizerCalls: AiCall[] = [];
  return {
    calls,
    organizerCalls,
    aiGatewayLogId: "log-1",
    lastRequestHttpStatusCode: null,
    run(model, inputs, options) {
      const asked = inputs as { response_format?: { json_schema?: { name?: string } } };
      if (asked.response_format?.json_schema?.name === "organizer_choice") {
        organizerCalls.push({ model, inputs, options });
        return organizers instanceof Error
          ? Promise.reject(organizers)
          : Promise.resolve(organizers);
      }
      calls.push({ model, inputs, options });
      const answer = answers[Math.min(calls.length, answers.length) - 1];
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
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

/**
 * The API as a signed-in member sees it. Requests go to the app on localhost
 * with the dev sign-in on, so no token is needed. Every auth setting is stated
 * here; nothing comes from a developer's own `.dev.vars`.
 */
export function signedIn(bindings: Cloudflare.Env, email: string, options: AppOptions = {}) {
  const app = createApp(options);
  const settings = {
    ...bindings,
    AUTH_PROVIDERS: "",
    AUTH_MODE: "dev",
    DEV_MEMBER_EMAIL: email,
    AUTH_AUTO_ENROLL: undefined,
  } as AppEnv["Bindings"];

  // Work a route leaves for after its answer, such as deleting a removed photo's files.
  const afterwards: Promise<unknown>[] = [];
  const context = {
    waitUntil: (work: Promise<unknown>) => {
      afterwards.push(work);
    },
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;

  const send = (method: string, path: string, body?: unknown, headers: HeadersInit = {}) =>
    app.fetch(
      new Request(`http://localhost:8787/api/v1${path}`, {
        method,
        headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
        body:
          body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      }),
      settings,
      context,
    );

  return {
    get: (path: string) => send("GET", path),
    post: (path: string, body: unknown) => send("POST", path, body),
    put: (path: string, body: unknown) => send("PUT", path, body),
    patch: (path: string, body: unknown) => send("PATCH", path, body),
    // A delete has no body, so it says where it came from, as a browser does.
    delete: (path: string) => send("DELETE", path, undefined, { "Sec-Fetch-Site": "same-origin" }),
    send,
    /** Sends a file as the body of a request, as the app does for a photo. */
    upload: (path: string, bytes: Uint8Array, contentType?: string) =>
      app.fetch(
        new Request(`http://localhost:8787/api/v1${path}`, {
          method: "POST",
          headers: contentType
            ? { "Content-Type": contentType }
            : { "Sec-Fetch-Site": "same-origin" },
          body: bytes,
        }),
        settings,
        context,
      ),
    /** Waits for whatever the routes left to do after answering. */
    settled: () => Promise.all(afterwards.splice(0)),
    /** For a client that builds its own requests, such as Hono's typed client. */
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      app.fetch(new Request(input, init), settings, context),
  };
}

/** The IDs of the recipes the search index matches, for an FTS query written out in full. */
export async function matchingRecipes(db: D1Database, ftsQuery: string): Promise<string[]> {
  const found = await db
    .prepare(
      `SELECT s.recipe_id FROM recipes_fts
       JOIN recipe_search AS s ON s.doc_id = recipes_fts.rowid
       WHERE recipes_fts MATCH ?1`,
    )
    .bind(ftsQuery)
    .all<{ recipe_id: string }>();
  return found.results.map((row) => row.recipe_id);
}
