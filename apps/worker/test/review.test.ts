import { env } from "cloudflare:workers";
import {
  Asset,
  CompareResponse,
  draftToInput,
  ErrorBody,
  ImportJob,
  ImportListResponse,
  ImportReport,
  ImportReview,
  Recipe,
  type RecipeInput,
} from "@recipeflare/schema";
import {
  FIXTURE_TIME,
  fixtureFoods,
  fixtureMember,
  fixtureOrganizers,
  fixtureUnits,
} from "@recipeflare/schema/fixtures";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, describe, expect, it } from "vitest";
import { AI_PROFILES } from "../src/ai";
import { createAiRunner } from "../src/ai/runner";
import { loadImportJob, loadImportJobForRun } from "../src/db/importJobs";
import { importJobs, members } from "../src/db/schema";
import { IMPORT_HANDLERS } from "../src/imports/handlers";
import { type ImportMessage, type ImportTools, runImportJob } from "../src/imports/runner";
import { chatAnswer, seedLists, signedIn, standInBinding } from "./helpers";

/**
 * The record a save keeps of a review, and running a saved import again under
 * another profile. The model is a stand-in and the recipes are invented. What
 * real models make of real cards is the owner's comparison on staging.
 */

const db = env.DB;
const lists = { foods: fixtureFoods, units: fixtureUnits, organizers: fixtureOrganizers };

/** What the app put on the queue, to be run here by hand. */
const sent: ImportMessage[] = [];
const queue = {
  send: async (message: ImportMessage) => {
    sent.push(message);
  },
} as unknown as Queue;

const HELPER = "helper@example.com";
/** The household's owner, where comparing is switched on. */
const owner = signedIn(
  { ...env, IMPORT_QUEUE: queue, AI_COMPARE: "on" } as Cloudflare.Env,
  fixtureMember.email ?? "",
);
/** The owner again, where it is not. */
const elsewhere = signedIn({ ...env, IMPORT_QUEUE: queue }, fixtureMember.email ?? "");
/** A member who is not the owner, where it is. */
const helper = signedIn(
  { ...env, IMPORT_QUEUE: queue, AI_COMPARE: "on" } as Cloudflare.Env,
  HELPER,
);

beforeAll(async () => {
  await seedLists(db);
  await drizzle(db).insert(members).values({
    id: "0192f0c0-0000-7000-8000-00000000be11",
    email: HELPER,
    displayName: "Helper",
    role: "member",
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  });
});

const TEXT = `Oat Biscuits

1 cup oats
1/2 cup butter
2 tbsp honey

Melt the butter with the honey.
Stir in the oats. Bake until gold.`;

const built = (changes: object = {}) => ({
  recipe: true,
  title: "Oat Biscuits",
  description: "",
  yield: null,
  prepTime: null,
  cookTime: null,
  totalTime: null,
  source: null,
  ingredients: [
    { section: null, line: "1 cup oats", doubt: null },
    { section: null, line: "1/2 cup butter", doubt: null },
    { section: null, line: "2 tbsp honey", doubt: null },
  ],
  steps: [
    { section: null, text: "Melt the butter with the honey.", doubt: null },
    { section: null, text: "Stir in the oats. Bake until gold.", doubt: null },
  ],
  notes: [],
  ...changes,
});

const toolsWith = (answers: unknown[]) => {
  const binding = standInBinding(answers);
  const tools: ImportTools = { fetch, env, ai: createAiRunner(binding, {}), send: async () => {} };
  return { binding, tools };
};

/** Pasted text, written up by the stand-in and waiting in review. */
async function inReview(answer: object = built()) {
  const response = await owner.post("/imports", { kind: "text", text: TEXT });
  const job = ImportJob.parse(await response.json());
  // Its own message is run here by hand; what is left in `sent` is a comparison's.
  sent.length = 0;
  await runImportJob(job.id, IMPORT_HANDLERS, toolsWith([chatAnswer(answer)]).tools, null);
  const draft = (await loadImportJob(db, job.id))?.result?.draft;
  if (!draft) {
    throw new Error("the import has no draft");
  }
  return { id: job.id, input: draftToInput(draft, lists).input as RecipeInput };
}

/** Saves a reviewed import, with whatever the cook changed, under a title of its own. */
async function save(id: string, input: RecipeInput, title: string) {
  const response = await owner.post("/recipes", { ...input, title, importJobId: id });
  expect(response.status).toBe(201);
  return Recipe.parse(await response.json());
}

async function recordOf(id: string) {
  const row = await drizzle(db).select().from(importJobs).all();
  const review = row.find((job) => job.id === id)?.review ?? null;
  return review === null ? null : ImportReview.parse(JSON.parse(review));
}

const report = async (api = owner) =>
  ImportReport.parse(await (await api.get("/imports/report")).json());

/** Empties the table, so that each group of tests counts only its own imports. */
const startAgain = async () => {
  await db.prepare("DELETE FROM import_jobs").run();
  sent.length = 0;
};

describe("the record a save keeps", () => {
  it("counts nothing for a draft saved as it was read, and says which profile wrote it", async () => {
    const { id, input } = await inReview();

    // The title a cook sees is the draft's; the one saved here differs only to keep slugs apart.
    await save(id, input, "Oat Biscuits");

    expect(await recordOf(id)).toMatchObject({
      profile: "standard",
      titleChanged: false,
      ingredients: { same: 3, moved: 0, changed: 0, added: 0, removed: 0 },
      steps: { same: 2, moved: 0, changed: 0, added: 0, removed: 0 },
      amounts: { changed: 0, unflagged: 0 },
    });
  });

  it("counts what the cook changed before saving", async () => {
    const { id, input } = await inReview();
    const lines = input.ingredientSections[0]?.items ?? [];
    const steps = input.stepSections[0]?.steps ?? [];
    // By hand: the butter's amount put right, a line of salt added, the second step removed.
    const changed: RecipeInput = {
      ...input,
      ingredientSections: [
        {
          title: null,
          items: [
            ...lines.map((line) =>
              line.originalText === "1/2 cup butter"
                ? {
                    ...line,
                    originalText: "1/3 cup butter",
                    quantity: null,
                    unitId: null,
                    foodId: null,
                  }
                : line,
            ),
            {
              id: crypto.randomUUID(),
              originalText: "1 pinch salt",
              quantity: null,
              unitId: null,
              foodId: null,
              note: "",
            },
          ],
        },
      ],
      stepSections: [{ title: null, steps: steps.slice(0, 1) }],
    };

    await save(id, changed, "Oat Biscuits, Corrected");

    expect(await recordOf(id)).toMatchObject({
      titleChanged: true,
      ingredients: { same: 2, moved: 0, changed: 1, added: 1, removed: 0 },
      steps: { same: 1, moved: 0, changed: 0, added: 0, removed: 1 },
      // The draft gave no warning about the butter.
      amounts: { changed: 1, unflagged: 1 },
    });
  });

  it("keeps none for a recipe typed in by hand", async () => {
    const { input } = await inReview();

    const response = await owner.post("/recipes", { ...input, title: "Typed Oat Biscuits" });

    expect(response.status).toBe(201);
    expect((await report()).cards.some((card) => card.title === "Typed Oat Biscuits")).toBe(false);
  });
});

describe("GET /api/v1/imports/report", () => {
  it("lists each saved import with its record, newest first, and no import still open", async () => {
    await startAgain();
    const first = await inReview();
    await save(first.id, first.input, "Report Biscuits One");
    const second = await inReview();
    const recipe = await save(second.id, second.input, "Report Biscuits Two");
    await inReview();

    const { cards, compareWith } = await report();

    expect(cards.map((card) => card.title)).toEqual(["Report Biscuits Two", "Report Biscuits One"]);
    expect(cards[0]).toMatchObject({
      id: second.id,
      kind: "text",
      slug: recipe.slug,
      status: "completed",
      profile: "standard",
      review: { titleChanged: true, ingredients: { same: 3 } },
      comparisons: [],
    });
    // The stand-in answers at once; the time is there and is a whole number.
    expect(Number.isInteger(cards[0]?.milliseconds)).toBe(true);
    expect(compareWith).toEqual(Object.keys(AI_PROFILES));
  });

  it("offers nothing to compare with where it is not switched on, or to a member who is not the owner", async () => {
    expect((await report(elsewhere)).compareWith).toEqual([]);
    expect((await report(helper)).compareWith).toEqual([]);
    // The record itself is the household's, and both can read it.
    expect((await report(helper)).cards.length).toBeGreaterThan(0);
  });
});

describe("POST /api/v1/imports/compare", () => {
  it("is refused where comparing is not switched on", async () => {
    const response = await elsewhere.post("/imports/compare", { profile: "gemma" });

    expect(response.status).toBe(403);
    expect(ErrorBody.parse(await response.json()).error.code).toBe("compare_off");
  });

  it("is refused to a member who is not the owner", async () => {
    const response = await helper.post("/imports/compare", { profile: "gemma" });

    expect(response.status).toBe(403);
    expect(ErrorBody.parse(await response.json()).error.code).toBe("owner_only");
  });

  it("is refused for a profile that does not exist", async () => {
    const response = await owner.post("/imports/compare", { profile: "the-best-one" });

    expect(response.status).toBe(400);
    expect(sent).toEqual([]);
  });

  it("runs a saved import again under the profile, and measures its draft against the saved recipe", async () => {
    await startAgain();
    const { id, input } = await inReview();
    await save(id, input, "Compared Oat Biscuits");
    // An import still in review is not compared: nobody has said what is right.
    await inReview();

    const response = await owner.post("/imports/compare", { profile: "gemma" });

    expect(response.status).toBe(202);
    expect(CompareResponse.parse(await response.json())).toEqual({ started: 1, waiting: 0 });
    expect(sent).toHaveLength(1);
    const comparison = sent[0]?.jobId ?? "";

    // This model reads the honey wrongly and misses the last step.
    const { binding, tools } = toolsWith([
      chatAnswer(
        built({
          ingredients: [
            { section: null, line: "1 cup oats", doubt: null },
            { section: null, line: "1/2 cup butter", doubt: null },
            { section: null, line: "2 tbsp money", doubt: null },
          ],
          steps: [{ section: null, text: "Melt the butter with the honey.", doubt: null }],
        }),
      ),
    ]);
    expect(await runImportJob(comparison, IMPORT_HANDLERS, tools, null)).toEqual({ ack: true });

    // It was asked of the profile's own model, and the call says so.
    expect(binding.calls[0]?.model).toBe(AI_PROFILES.gemma?.models.build.id);
    const calls = (await loadImportJobForRun(db, comparison))?.work.calls ?? [];
    expect(calls.every((call) => call.profile === "gemma")).toBe(true);

    expect(await loadImportJob(db, comparison)).toMatchObject({
      status: "compared",
      recipeId: null,
    });
    expect(await recordOf(comparison)).toMatchObject({
      profile: "gemma",
      // Measured against the recipe as saved, whose title the cook had changed.
      titleChanged: true,
      ingredients: { same: 2, moved: 0, changed: 1, added: 0, removed: 0 },
      steps: { same: 1, moved: 0, changed: 0, added: 1, removed: 0 },
    });

    const { cards } = await report();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.comparisons).toMatchObject([
      { id: comparison, profile: "gemma", status: "compared", review: { profile: "gemma" } },
    ]);
  });

  it("never shows a comparison among the imports waiting for a person", async () => {
    await startAgain();
    const { id, input } = await inReview();
    await save(id, input, "Unlisted Oat Biscuits");
    await owner.post("/imports/compare", { profile: "qwen" });

    const open = ImportListResponse.parse(await (await owner.get("/imports")).json());

    expect(open.items).toEqual([]);
    // Nor once it has failed, when an import of the cook's own would be listed.
    await db.prepare("UPDATE import_jobs SET status = 'failed' WHERE status = 'queued'").run();
    expect(ImportListResponse.parse(await (await owner.get("/imports")).json()).items).toEqual([]);
  });

  it("starts each card once for a profile, and puts a failed run back in line", async () => {
    await startAgain();
    const { id, input } = await inReview();
    await save(id, input, "Once Oat Biscuits");

    await owner.post("/imports/compare", { profile: "qwen" });
    const again = await owner.post("/imports/compare", { profile: "qwen" });

    expect(CompareResponse.parse(await again.json())).toEqual({ started: 0, waiting: 0 });
    expect(sent).toHaveLength(1);

    // Another profile is another run of the same card.
    await owner.post("/imports/compare", { profile: "standard" });
    expect(sent).toHaveLength(2);

    await db
      .prepare(
        "UPDATE import_jobs SET status = 'failed', error_code = 'ai_unavailable' WHERE id = ?1",
      )
      .bind(sent[0]?.jobId ?? "")
      .run();
    const retried = await owner.post("/imports/compare", { profile: "qwen" });

    expect(CompareResponse.parse(await retried.json())).toEqual({ started: 1, waiting: 0 });
    expect(sent[2]?.jobId).toBe(sent[0]?.jobId);
    expect((await loadImportJob(db, sent[0]?.jobId ?? ""))?.status).toBe("queued");
  });

  it("fails a comparison whose recipe has been deleted, and leaves it out of the cook's list", async () => {
    await startAgain();
    const { id, input } = await inReview();
    const recipe = await save(id, input, "Deleted Oat Biscuits");
    await owner.post("/imports/compare", { profile: "gemma" });
    await owner.delete(`/recipes/${recipe.id}`);

    await runImportJob(
      sent[0]?.jobId ?? "",
      IMPORT_HANDLERS,
      toolsWith([chatAnswer(built())]).tools,
      null,
    );

    expect(await loadImportJob(db, sent[0]?.jobId ?? "")).toMatchObject({
      status: "failed",
      error: { code: "nothing_to_compare" },
    });
  });
});

describe("comparing a photographed card", () => {
  /** A real picture, one pixel square, with a byte after its end to tell two apart. */
  const png = (mark: number) =>
    Uint8Array.from([
      ...Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        ),
        (character) => character.charCodeAt(0),
      ),
      mark,
    ]);
  const reading = { readable: true, sides: [TEXT], unsure: [] };

  it("shows the other profile the photos the card was read from, which the recipe now has", async () => {
    await startAgain();
    const photos: string[] = [];
    for (const mark of [41, 42]) {
      const uploaded = await owner.upload("/assets?role=original", png(mark), "image/png");
      photos.push(Asset.parse(await uploaded.json()).id);
    }
    const created = await owner.post("/imports", { kind: "photo", photos, card: 3 });
    const job = ImportJob.parse(await created.json());
    const first = toolsWith([chatAnswer(reading), chatAnswer(built())]);
    await runImportJob(job.id, IMPORT_HANDLERS, first.tools, null);
    await runImportJob(job.id, IMPORT_HANDLERS, first.tools, "build");
    const draft = (await loadImportJob(db, job.id))?.result?.draft;
    if (!draft) {
      throw new Error("the card has no draft");
    }
    const response = await owner.post("/recipes", {
      ...draftToInput(draft, lists).input,
      title: "Card Oat Biscuits",
      importJobId: job.id,
      assets: photos.map((id) => ({ id, role: "original" })),
    });
    expect(response.status).toBe(201);
    sent.length = 0;

    await owner.post("/imports/compare", { profile: "qwen" });
    const comparison = sent[0]?.jobId ?? "";
    const second = toolsWith([chatAnswer(reading), chatAnswer(built())]);
    await runImportJob(comparison, IMPORT_HANDLERS, second.tools, null);
    await runImportJob(comparison, IMPORT_HANDLERS, second.tools, "build");

    // The reader was the profile's, and it was shown both sides of the card.
    expect(second.binding.calls[0]?.model).toBe(AI_PROFILES.qwen?.models.read.id);
    const messages = (second.binding.calls[0]?.inputs.messages ?? []) as { content: unknown }[];
    const shown = messages[1]?.content;
    expect((shown as { type: string }[]).filter((part) => part.type === "image_url")).toHaveLength(
      2,
    );
    expect(await recordOf(comparison)).toMatchObject({
      profile: "qwen",
      ingredients: { same: 3, changed: 0 },
      steps: { same: 2, changed: 0 },
    });
    // The photos are still the recipe's, and the card keeps its number in the report.
    const { cards } = await report();
    expect(cards[0]).toMatchObject({
      kind: "photo",
      card: 3,
      comparisons: [{ status: "compared" }],
    });
    expect(
      Recipe.parse(await (await owner.get("/recipes/card-oat-biscuits")).json()).assets,
    ).toHaveLength(2);
  });
});
