import { env } from "cloudflare:workers";
import { Asset, ErrorBody, ImportDetail, ImportJob, Recipe } from "@recipeflare/schema";
import { fixtureMember } from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { aiFor } from "../src/ai";
import { READ_PROMPT } from "../src/ai/prompts";
import { type AiSettings, createAiRunner } from "../src/ai/runner";
import { STAND_IN_CARD } from "../src/ai/standIn";
import { loadImportJob, loadImportJobForRun } from "../src/db/importJobs";
import { doubtsAbout } from "../src/imports/build";
import { IMPORT_HANDLERS } from "../src/imports/handlers";
import { type ImportTools, runImportJob } from "../src/imports/runner";
import { chatAnswer, seedLists, signedIn, standInBinding } from "./helpers";

/**
 * Importing a photographed card, with a stand-in for the model. The pictures
 * are made here and the card's words are invented. What a real model makes
 * of a real card is seen on staging.
 */

const db = env.DB;
const queue = { send: async () => {} } as unknown as Queue;
const api = signedIn({ ...env, IMPORT_QUEUE: queue }, fixtureMember.email ?? "");

beforeAll(async () => {
  await seedLists(db);
});

/** A real picture, one pixel square. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);
/** The same picture with bytes after its end, so that two uploads can be told apart. */
const pngMarked = (mark: number) => Uint8Array.from([...PNG, mark]);

async function uploaded(bytes: Uint8Array = PNG, role = "original") {
  const response = await api.upload(`/assets?role=${role}`, bytes, "image/png");
  expect(response.status).toBe(201);
  return Asset.parse(await response.json());
}
async function card(...sides: Uint8Array[]) {
  const photos = [];
  for (const side of sides) {
    photos.push((await uploaded(side)).id);
  }
  const response = await api.post("/imports", { kind: "photo", photos });
  expect(response.status).toBe(202);
  return { job: ImportJob.parse(await response.json()), photos };
}
const detail = async (id: string) =>
  ImportDetail.parse(await (await api.get(`/imports/${id}`)).json());
type Part = { type: string; text?: string; image_url?: { url: string } };
/** What a call's two messages said: the rules, then this card's words and pictures. */
function messagesOf(call: { inputs: Record<string, unknown> } | undefined) {
  const messages = (call?.inputs.messages ?? []) as { content: unknown }[];
  return { system: messages[0]?.content, user: messages[1]?.content };
}
const toolsWith = (answers: unknown[]) => {
  const binding = standInBinding(answers);
  const tools: ImportTools = {
    fetch,
    env,
    ai: createAiRunner(binding, {}),
    send: async () => {},
  };
  return { binding, tools };
};

const FRONT = `Shortbread
1 cup butter
1/2 c. sugar
2 cups flour`;
const BACK = `Cream butter and sugar.
Work in flour. Press in pan.
Bake 325 till pale gold.`;
const read = (changes: object = {}) => ({
  readable: true,
  sides: [FRONT, BACK],
  unsure: [],
  ...changes,
});
const built = (changes: object = {}) => ({
  recipe: true,
  title: "Shortbread",
  description: "",
  yield: null,
  prepTime: null,
  cookTime: null,
  totalTime: null,
  source: null,
  ingredients: [
    { section: null, line: "1 cup butter", doubt: null },
    { section: null, line: "1/2 c. sugar", doubt: null },
    { section: null, line: "2 cups flour", doubt: null },
  ],
  steps: [
    { section: null, text: "Cream butter and sugar.", doubt: null },
    { section: null, text: "Work in flour. Press in pan.", doubt: null },
    { section: null, text: "Bake 325 till pale gold.", doubt: null },
  ],
  notes: [],
  ...changes,
});

describe("POST /api/v1/imports with a photographed card", () => {
  it("takes the card on as one job, with its photos the job's own, front first", async () => {
    const { job, photos } = await card(pngMarked(1), pngMarked(2));

    expect(job).toMatchObject({ kind: "photo", status: "queued", sourceUrl: null, stage: null });
    const sides = (await detail(job.id)).assets;
    expect(sides.map((side) => side.id)).toEqual(photos);
    // A card's sides are the recipe's original card once it is saved.
    expect(sides.map((side) => [side.role, side.position])).toEqual([
      ["original", 0],
      ["original", 1],
    ]);
  });

  it("keeps the card's place in its sitting, and says it wherever the job is listed", async () => {
    const side = await uploaded(pngMarked(40));

    const response = await api.post("/imports", { kind: "photo", photos: [side.id], card: 7 });

    const job = ImportJob.parse(await response.json());
    expect(job.card).toBe(7);
    expect((await detail(job.id)).card).toBe(7);
    const listed = (await (await api.get("/imports")).json()) as { items: ImportJob[] };
    expect(listed.items.find((item) => item.id === job.id)?.card).toBe(7);
  });

  it("gives no place to a card that was sent without one, or to another kind of import", async () => {
    const { job } = await card(pngMarked(41));
    expect("card" in job).toBe(false);

    const pasted = await api.post("/imports", { kind: "text", text: "Toast\n\n1 slice bread" });
    expect("card" in ImportJob.parse(await pasted.json())).toBe(false);
  });

  it("keeps the order given, not the order the photos were uploaded in", async () => {
    const first = await uploaded(pngMarked(3));
    const second = await uploaded(pngMarked(4));

    const response = await api.post("/imports", { kind: "photo", photos: [second.id, first.id] });

    const job = ImportJob.parse(await response.json());
    expect((await detail(job.id)).assets.map((side) => side.id)).toEqual([second.id, first.id]);
  });

  it.each([
    ["no photos", () => [] as string[]],
    [
      "five photos",
      () => Array.from({ length: 5 }, (_, n) => `0193d0a0-0000-7000-8000-00000000000${n}`),
    ],
    ["something that is not an ID", () => ["front"]],
  ])("refuses a card with %s", async (_what, photos) => {
    const response = await api.post("/imports", { kind: "photo", photos: photos() });

    expect(response.status).toBe(400);
  });

  it("refuses a photo that is not there, one listed twice, and one that is already someone's", async () => {
    const mine = await uploaded(pngMarked(5));
    const refusal = async (photos: string[]) => {
      const response = await api.post("/imports", { kind: "photo", photos });
      expect(response.status).toBe(400);
      return ErrorBody.parse(await response.json()).error.issues?.[0];
    };

    expect(await refusal(["0193d0a0-0000-7000-8000-0000000000aa"])).toMatchObject({
      path: ["photos"],
      message: expect.stringContaining("not here"),
    });
    expect((await refusal([mine.id, mine.id]))?.message).toContain("twice");

    // Once a card has taken it, no other card can.
    expect((await api.post("/imports", { kind: "photo", photos: [mine.id] })).status).toBe(202);
    expect((await refusal([mine.id]))?.message).toContain("already belongs");
  });

  it("refuses a file that is not a picture", async () => {
    const pdf = await api.upload(
      "/assets?role=attachment",
      new TextEncoder().encode("%PDF-1.7\n% invented\n"),
      "application/pdf",
    );
    const { id } = Asset.parse(await pdf.json());

    const response = await api.post("/imports", { kind: "photo", photos: [id] });

    expect(response.status).toBe(400);
    expect(ErrorBody.parse(await response.json()).error.issues?.[0]?.message).toContain("pictures");
  });
});

describe("reading a photographed card", () => {
  it("makes one draft of a two-sided card: read front then back, then written up", async () => {
    const { job, photos } = await card(pngMarked(11), pngMarked(12));
    const { binding, tools } = toolsWith([chatAnswer(read()), chatAnswer(built())]);

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);
    expect(await loadImportJob(db, job.id)).toMatchObject({ status: "running", stage: "build" });
    await runImportJob(job.id, IMPORT_HANDLERS, tools, "build");

    // The reader was shown both photos, in the card's order, after the words.
    const shown = messagesOf(binding.calls[0]).user as Part[];
    expect(shown[0]).toEqual({
      type: "text",
      text: "The card has 2 photographs, in order: the front first, then the back.",
    });
    const sent = shown.slice(1).map((part) => atob(part.image_url?.url.split(",")[1] ?? ""));
    expect(sent.map((bytes) => bytes.charCodeAt(bytes.length - 1))).toEqual([11, 12]);
    expect(shown[1]?.image_url?.url.startsWith("data:image/png;base64,")).toBe(true);
    expect(messagesOf(binding.calls[0]).system).toBe(READ_PROMPT.system);
    // The writer was given what the reader read, front before back.
    expect(messagesOf(binding.calls[1]).user).toBe(`The text:\n\n${FRONT}\n\n${BACK}`);

    const after = await detail(job.id);
    expect(after.status).toBe("needs_review");
    expect(after.result).toMatchObject({ readBy: "ai", sourceText: `${FRONT}\n\n${BACK}` });
    expect(after.result?.draft.title).toBe("Shortbread");
    expect(
      after.result?.draft.ingredientSections[0]?.items.map((item) => item.originalText),
    ).toEqual(["1 cup butter", "1/2 c. sugar", "2 cups flour"]);
    expect(after.result?.issues).toEqual([]);
    // Both photos are beside the draft in review.
    expect(after.assets.map((side) => side.id)).toEqual(photos);
    // And what each call took can be looked up afterwards.
    expect(after.calls.map((call) => [call.task, call.failed])).toEqual([
      ["read", null],
      ["build", null],
    ]);
    // Two model calls, each kept with the job under the task it was for.
    const kept = (await loadImportJobForRun(db, job.id))?.work;
    expect(kept?.calls?.map((call) => call.task)).toEqual(["read", "build"]);
  });

  it("keeps both photos as the saved recipe's original card, front first", async () => {
    const { job, photos } = await card(pngMarked(13), pngMarked(14));
    const { tools } = toolsWith([chatAnswer(read()), chatAnswer(built())]);
    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);
    await runImportJob(job.id, IMPORT_HANDLERS, tools, "build");

    const response = await api.post("/recipes", {
      title: "Shortbread From A Card",
      importJobId: job.id,
      assets: photos.map((id) => ({ id, role: "original" })),
    });

    expect(response.status).toBe(201);
    const recipe = Recipe.parse(await response.json());
    expect(recipe.assets.map((asset) => [asset.id, asset.role])).toEqual(
      photos.map((id) => [id, "original"]),
    );
    expect((await loadImportJob(db, job.id))?.status).toBe("completed");
  });

  it("fails with unreadable when nothing is written on the card", async () => {
    const { job } = await card(pngMarked(15));
    const { binding, tools } = toolsWith([chatAnswer(read({ readable: false, sides: [] }))]);

    expect(await runImportJob(job.id, IMPORT_HANDLERS, tools, null)).toEqual({ ack: true });

    expect(await loadImportJob(db, job.id)).toMatchObject({
      status: "failed",
      error: { code: "unreadable" },
    });
    // The writer is never asked to make a recipe of nothing.
    expect(binding.calls).toHaveLength(1);
  });

  it("waits twice as long for the reader as for the writer", async () => {
    const { job } = await card(pngMarked(42));
    const { binding, tools } = toolsWith([chatAnswer(read()), chatAnswer(built())]);
    const asked: (number | undefined)[] = [];
    const watched: ImportTools = {
      ...tools,
      ai: {
        profile: () => tools.ai.profile(),
        run: (request) => {
          asked.push(request.timeoutMs);
          return tools.ai.run(request);
        },
      },
    };

    await runImportJob(job.id, IMPORT_HANDLERS, watched, null);
    await runImportJob(job.id, IMPORT_HANDLERS, watched, "build");

    // Three minutes to read the photographs; the writer keeps the usual wait.
    expect(asked).toEqual([180_000, undefined]);
    expect(binding.calls).toHaveLength(2);
  });

  it("counts sides with nothing on them as nothing read", async () => {
    const { job } = await card(pngMarked(16), pngMarked(17));
    const { tools } = toolsWith([chatAnswer(read({ sides: ["  ", ""] }))]);

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);

    expect((await loadImportJob(db, job.id))?.error?.code).toBe("unreadable");
  });

  it("reads a one-sided card, and says so to the reader", async () => {
    const { job } = await card(pngMarked(18));
    const { binding, tools } = toolsWith([
      chatAnswer(read({ sides: [`${FRONT}\n${BACK}`] })),
      chatAnswer(built()),
    ]);

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);
    await runImportJob(job.id, IMPORT_HANDLERS, tools, "build");

    const shown = messagesOf(binding.calls[0]).user as Part[];
    expect(shown[0]?.text).toBe("The card has one photograph.");
    expect(shown).toHaveLength(2);
    expect((await loadImportJob(db, job.id))?.status).toBe("needs_review");
  });

  it("says what the reader was unsure of, on the line it is about", async () => {
    const { job } = await card(pngMarked(19), pngMarked(20));
    const { tools } = toolsWith([
      chatAnswer(
        read({
          unsure: [
            { words: "1/2 c. sugar", why: "The amount is written over; it could be 1/3." },
            { words: "325", why: "The last digit is smudged." },
            { words: "Aunt Vi", why: "A name in the corner, partly torn off." },
          ],
        }),
      ),
      chatAnswer(built()),
    ]);

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);
    await runImportJob(job.id, IMPORT_HANDLERS, tools, "build");

    const after = await detail(job.id);
    expect(after.result?.draft.doubts).toEqual([
      { where: "ingredient:1", why: "The amount is written over; it could be 1/3." },
      { where: "step:2", why: "The last digit is smudged." },
      // It is on no line of the recipe, and is still said.
      { where: "card", why: "“Aunt Vi”: A name in the corner, partly torn off." },
    ]);
    expect(after.result?.issues.map((issue) => [issue.code, issue.path])).toEqual([
      ["doubt", ["ingredientSections", 0, "items", 1]],
      ["doubt", ["stepSections", 0, "steps", 2]],
      ["doubt", []],
    ]);
  });

  it("flags a line the writer changed from what the reader read", async () => {
    const { job } = await card(pngMarked(21), pngMarked(22));
    const { tools } = toolsWith([
      chatAnswer(read()),
      chatAnswer(
        built({
          ingredients: [
            { section: null, line: "1 cup butter", doubt: null },
            { section: null, line: "1/2 cup sugar", doubt: null },
          ],
        }),
      ),
    ]);

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);
    await runImportJob(job.id, IMPORT_HANDLERS, tools, "build");

    // The card says "1/2 c. sugar". "cup" is on the card, on another line, so
    // no word is new: what gives the change away is that the line is not on the card.
    expect((await detail(job.id)).result?.draft.doubts).toEqual([
      {
        where: "ingredient:1",
        why: "Is not written this way in the text. Check the amount and the wording.",
      },
    ]);
  });

  it("does not read the card again when only the writing up is tried again", async () => {
    const { job } = await card(pngMarked(23));
    const { binding, tools } = toolsWith([
      chatAnswer(read()),
      chatAnswer({ not: "a reading" }),
      chatAnswer({ not: "a reading" }),
      chatAnswer(built()),
    ]);
    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);
    await runImportJob(job.id, IMPORT_HANDLERS, tools, "build");
    expect(await loadImportJob(db, job.id)).toMatchObject({
      status: "failed",
      stage: "build",
      error: { code: "ai_answer" },
    });

    expect((await api.post(`/imports/${job.id}/retry`, {})).status).toBe(202);
    await runImportJob(job.id, IMPORT_HANDLERS, tools, "build");

    expect((await loadImportJob(db, job.id))?.status).toBe("needs_review");
    // One reading, then three tries at writing it up.
    expect(
      binding.calls.map(
        (call) =>
          (call.inputs.response_format as { json_schema: { name: string } }).json_schema.name,
      ),
    ).toEqual(["card_reading", "recipe_reading", "recipe_reading", "recipe_reading"]);
  });

  it("removes the card's photos when the import is removed", async () => {
    const { job, photos } = await card(pngMarked(24), pngMarked(25));

    expect((await api.delete(`/imports/${job.id}`)).status).toBe(204);
    await api.settled();

    for (const id of photos) {
      expect((await api.get(`/assets/${id}/original`)).status).toBe(404);
    }
  });
});

describe("placing what a reader was unsure of", () => {
  const draft = {
    title: "Shortbread",
    ingredientSections: [
      { title: null, items: [{ originalText: "1 cup butter" }, { originalText: "1/2 c. sugar" }] },
    ],
    stepSections: [{ title: null, steps: [{ text: "Bake 325 till pale gold." }] }],
  } as Parameters<typeof doubtsAbout>[0];

  it("finds the line, the step or the title that has the words", () => {
    expect(
      doubtsAbout(draft, [
        { words: "c. sugar", why: "Smudged." },
        { words: "pale gold", why: "Faint." },
        { words: "Shortbread", why: "Underlined twice." },
      ]).map((doubt) => doubt.where),
    ).toEqual(["ingredient:1", "step:0", "title"]);
  });

  it("says a doubt with no words to place, and says a repeated one once", () => {
    expect(
      doubtsAbout(draft, [
        { words: "", why: "The corner is torn off." },
        { words: "", why: "The corner is torn off." },
        { words: "butter", why: "" },
      ]),
    ).toEqual([
      { where: "card", why: "The corner is torn off." },
      { where: "ingredient:0", why: "Hard to read on the card." },
    ]);
  });
});

describe("the scripted stand-in model, shown a card", () => {
  const standIn: Cloudflare.Env & AiSettings = { ...env, AI_MODE: "stand-in" };

  it("reads its one card from any photo, well enough to try the screens with", async () => {
    const big = Uint8Array.from([...PNG, ...new Uint8Array(900)]);
    const { job } = await card(big);
    const tools: ImportTools = { fetch, env: standIn, ai: aiFor(standIn), send: async () => {} };

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);
    await runImportJob(job.id, IMPORT_HANDLERS, tools, "build");

    const after = await detail(job.id);
    expect(after.status).toBe("needs_review");
    expect(after.result?.draft.title).toBe("Stand-in Shortbread");
    expect(after.result?.sourceText).toBe(STAND_IN_CARD);
    expect(after.result?.draft.doubts).toEqual([
      { where: "ingredient:1", why: "The amount is written over." },
    ]);
  });

  it("finds nothing on a photo too small to be one, as a blank card would be", async () => {
    const { job } = await card(PNG);
    const tools: ImportTools = { fetch, env: standIn, ai: aiFor(standIn), send: async () => {} };

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);

    expect((await loadImportJob(db, job.id))?.error?.code).toBe("unreadable");
  });
});
