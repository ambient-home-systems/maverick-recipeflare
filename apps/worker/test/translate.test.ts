import { env } from "cloudflare:workers";
import { ErrorBody, ImportJob, RecipeDraft } from "@recipeflare/schema";
import { fixtureMember } from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TRANSLATE_PROMPT } from "../src/ai/prompts";
import { createAiRunner } from "../src/ai/runner";
import { createImportJob, loadImportJob, loadImportJobForRun } from "../src/db/importJobs";
import { IMPORT_HANDLERS } from "../src/imports/handlers";
import { type ImportTools, runImportJob } from "../src/imports/runner";
import { ORIGINAL_NOTE, sameAmounts, translateDraft } from "../src/imports/translate";
import { chatAnswer, noAi, seedLists, signedIn, standInBinding } from "./helpers";

/**
 * Translating a draft into English, when the cook asks for it in review. The
 * model is a stand-in and the recipes are invented.
 */

const db = env.DB;

beforeAll(async () => {
  await seedLists(db);
});

const GERMAN = `Kartoffelsuppe

500 g Kartoffeln, geschält
1 Zwiebel, fein gehackt
1,5 l Gemüsebrühe

Die Zwiebel in Butter anschwitzen. Kartoffeln und Brühe dazugeben und 20 Minuten kochen lassen.
Mit Salz und Pfeffer abschmecken.`;

/** What a model made of GERMAN, in its own language: the build stage copies, it does not translate. */
const built = {
  recipe: true,
  title: "Kartoffelsuppe",
  description: "",
  yield: null,
  prepTime: null,
  cookTime: null,
  totalTime: null,
  source: null,
  ingredients: [
    { section: null, line: "500 g Kartoffeln, geschält", doubt: null },
    { section: null, line: "1 Zwiebel, fein gehackt", doubt: null },
    { section: null, line: "1,5 l Gemüsebrühe", doubt: null },
  ],
  steps: [
    {
      section: null,
      text: "Die Zwiebel in Butter anschwitzen. Kartoffeln und Brühe dazugeben und 20 Minuten kochen lassen.",
      doubt: null,
    },
    { section: null, text: "Mit Salz und Pfeffer abschmecken.", doubt: null },
  ],
  notes: [],
};

/** The six pieces of that draft, in English, as a model would give them. Tests change one at a time. */
const english = (changes: Record<number, string | null> = {}) =>
  chatAnswer({
    pieces: Object.entries({
      1: "Potato Soup",
      2: "500 g potatoes, peeled",
      3: "1 onion, finely chopped",
      4: "1.5 l vegetable stock",
      5: "Sweat the onion in butter. Add the potatoes and the stock and simmer for 20 minutes.",
      6: "Season with salt and pepper.",
      ...changes,
    }).flatMap(([number, text]) => (text === null ? [] : [{ number: Number(number), text }])),
  });

const draft = RecipeDraft.parse({
  title: built.title,
  ingredientSections: [
    { title: null, items: built.ingredients.map((entry) => ({ originalText: entry.line })) },
  ],
  stepSections: [{ title: null, steps: built.steps.map((entry) => ({ text: entry.text })) }],
});

const toolsWith = (answers: unknown[]) => {
  const binding = standInBinding(answers);
  const tools: ImportTools = { fetch, env, ai: createAiRunner(binding, {}), send: async () => {} };
  return { binding, tools };
};

/** A pasted import that a model has written up and that waits in review. */
async function inReview(text = GERMAN, reading: object = built) {
  const job = await createImportJob(
    db,
    { kind: "text", sourceUrl: null, input: { text } },
    fixtureMember.id,
  );
  // Written up, and then, where the rules cannot read a line in its own
  // language, one more stage; the stand-in has nothing to add to those lines.
  const { tools } = toolsWith([chatAnswer(reading), chatAnswer({ lines: [] })]);
  await runImportJob(job.id, IMPORT_HANDLERS, tools, null);
  if ((await loadImportJob(db, job.id))?.stage === "details") {
    await runImportJob(job.id, IMPORT_HANDLERS, tools, "details");
  }
  expect((await loadImportJob(db, job.id))?.status).toBe("needs_review");
  return job;
}

describe("the amounts in a translation", () => {
  it.each([
    ["500 g Kartoffeln", "500 g potatoes"],
    ["1,5 l Gemüsebrühe", "1.5 l vegetable stock"],
    ["2 EL Öl und 1 TL Salz", "1 tsp salt and 2 tbsp oil"],
    ["½ Zitrone", "1/2 lemon"],
    ["Mit Salz abschmecken.", "Season with salt."],
  ])("are the same in %j and %j", (original, translated) => {
    expect(sameAmounts(original, translated)).toBe(true);
  });

  it.each([
    // Converted, rounded, lost or made up.
    ["250 g Mehl", "2 cups flour"],
    ["250 g Mehl", "about 9 oz flour"],
    ["2 Eier", "eggs"],
    ["Eine Prise Salz", "1 pinch of salt"],
    ["20 Minuten kochen", "cook for 25 minutes"],
  ])("are not the same in %j and %j", (original, translated) => {
    expect(sameAmounts(original, translated)).toBe(false);
  });
});

describe("translating a draft", () => {
  it("asks once, for every piece by number, and puts each translation in its place", async () => {
    const binding = standInBinding([english()]);

    const translated = await translateDraft(draft, GERMAN, createAiRunner(binding, {}));

    expect(binding.calls).toHaveLength(1);
    const messages = binding.calls[0]?.inputs.messages as { content: string }[];
    expect(messages[0]?.content).toBe(TRANSLATE_PROMPT.system);
    expect(messages[1]?.content).toBe(
      [
        "The pieces:\n",
        "1. Kartoffelsuppe",
        "2. 500 g Kartoffeln, geschält",
        "3. 1 Zwiebel, fein gehackt",
        "4. 1,5 l Gemüsebrühe",
        "5. Die Zwiebel in Butter anschwitzen. Kartoffeln und Brühe dazugeben und 20 Minuten kochen lassen.",
        "6. Mit Salz und Pfeffer abschmecken.",
      ].join("\n"),
    );
    expect(translated.title).toBe("Potato Soup");
    expect(translated.ingredientSections[0]?.items.map((item) => item.originalText)).toEqual([
      "500 g potatoes, peeled",
      "1 onion, finely chopped",
      "1.5 l vegetable stock",
    ]);
    expect(translated.stepSections[0]?.steps.map((step) => step.text)).toEqual([
      "Sweat the onion in butter. Add the potatoes and the stock and simmer for 20 minutes.",
      "Season with salt and pepper.",
    ]);
    expect(translated.doubts).toEqual([]);
  });

  it("keeps the words as written, as a note the cook can delete", async () => {
    const translated = await translateDraft(
      draft,
      GERMAN,
      createAiRunner(standInBinding([english()]), {}),
    );

    expect(translated.notes).toEqual([{ title: ORIGINAL_NOTE, text: GERMAN }]);
  });

  it("does not use a translation that changed an amount: the line stays as written, and says so", async () => {
    const translated = await translateDraft(
      draft,
      GERMAN,
      // The model turned grams into cups.
      createAiRunner(standInBinding([english({ 2: "2 cups potatoes, peeled" })]), {}),
    );

    expect(translated.ingredientSections[0]?.items.map((item) => item.originalText)).toEqual([
      "500 g Kartoffeln, geschält",
      "1 onion, finely chopped",
      "1.5 l vegetable stock",
    ]);
    expect(translated.doubts).toEqual([
      {
        where: "ingredient:0",
        why: "Was not translated: the translation changed an amount. It is as it was written.",
      },
    ]);
  });

  it("leaves a piece the model skipped as written, and says so", async () => {
    const translated = await translateDraft(
      draft,
      GERMAN,
      createAiRunner(standInBinding([english({ 6: null })]), {}),
    );

    expect(translated.stepSections[0]?.steps[1]?.text).toBe("Mit Salz und Pfeffer abschmecken.");
    expect(translated.doubts).toEqual([
      { where: "step:1", why: "Was not translated. It is as it was written." },
    ]);
  });

  it("lets go of what was read from a line's old words", async () => {
    const read = RecipeDraft.parse({
      ...draft,
      ingredientSections: [
        {
          title: null,
          items: [
            {
              originalText: "Saft von 2 Zitronen",
              quantity: 2,
              foodName: "Zitronen",
              note: "Saft von",
            },
          ],
        },
      ],
      stepSections: [],
    });
    const answer = chatAnswer({
      pieces: [
        { number: 1, text: "Potato Soup" },
        { number: 2, text: "Juice of 2 lemons" },
      ],
    });

    const translated = await translateDraft(read, "", createAiRunner(standInBinding([answer]), {}));

    expect(translated.ingredientSections[0]?.items[0]).toEqual({
      originalText: "Juice of 2 lemons",
      quantity: null,
      unitName: null,
      foodName: null,
      note: "",
    });
    // With no words as written to keep, there is no note.
    expect(translated.notes).toEqual([]);
  });
});

describe("POST /api/v1/imports/{id}/translate", () => {
  const sent: unknown[] = [];
  const queue = {
    send: async (message: unknown) => {
      sent.push(message);
    },
  } as unknown as Queue;
  const api = signedIn({ ...env, IMPORT_QUEUE: queue }, fixtureMember.email ?? "", { ai: noAi });

  it("sends a draft that is not in English back to be translated", async () => {
    const job = await inReview();
    sent.length = 0;

    const response = await api.post(`/imports/${job.id}/translate`, {});

    expect(response.status).toBe(202);
    expect(ImportJob.parse(await response.json())).toMatchObject({
      id: job.id,
      status: "queued",
      stage: "translate",
      result: null,
    });
    expect(sent).toEqual([{ jobId: job.id, stage: "translate" }]);
    // The draft and the words it was made from wait in the job's work, with the calls made so far.
    const work = (await loadImportJobForRun(db, job.id))?.work;
    expect(work).toMatchObject({ draft: { title: "Kartoffelsuppe" }, text: GERMAN });
    expect(work?.calls?.length).toBeGreaterThan(0);
  });

  it("does not send one that is already in English", async () => {
    const job = await inReview(
      "Garlic Bread\n\n1 loaf crusty bread\n4 tbsp butter\n\nMix the butter and garlic and spread it on the bread. Bake until crisp and serve with the soup.",
      {
        ...built,
        title: "Garlic Bread",
        ingredients: [
          { section: null, line: "1 loaf crusty bread", doubt: null },
          { section: null, line: "4 tbsp butter", doubt: null },
        ],
        steps: [
          {
            section: null,
            text: "Mix the butter and garlic and spread it on the bread. Bake until crisp and serve with the soup.",
            doubt: null,
          },
        ],
      },
    );
    sent.length = 0;

    const response = await api.post(`/imports/${job.id}/translate`, {});

    expect(response.status).toBe(409);
    expect(ErrorBody.parse(await response.json()).error.code).toBe("already_english");
    expect(sent).toEqual([]);
    expect((await loadImportJob(db, job.id))?.status).toBe("needs_review");
  });

  it("is only for an import that is waiting in review", async () => {
    const queued = await createImportJob(
      db,
      { kind: "text", sourceUrl: null, input: { text: GERMAN } },
      fixtureMember.id,
    );

    expect((await api.post(`/imports/${queued.id}/translate`, {})).status).toBe(404);
    expect(
      (await api.post("/imports/00000000-0000-7000-8000-00000000dead/translate", {})).status,
    ).toBe(404);
  });
});

describe("the translate stage", () => {
  const api = signedIn(
    { ...env, IMPORT_QUEUE: { send: async () => {} } as unknown as Queue },
    fixtureMember.email ?? "",
    { ai: noAi },
  );

  it("hands the draft back to review in English, with the original beside it and kept as a note", async () => {
    const job = await inReview();
    await api.post(`/imports/${job.id}/translate`, {});
    const { binding, tools } = toolsWith([english()]);

    await runImportJob(job.id, IMPORT_HANDLERS, tools, "translate");

    const after = await loadImportJob(db, job.id);
    expect(after).toMatchObject({ status: "needs_review", error: null });
    expect(after?.result).toMatchObject({ readBy: "ai", sourceText: GERMAN });
    expect(after?.result?.draft.title).toBe("Potato Soup");
    expect(after?.result?.draft.notes).toEqual([{ title: ORIGINAL_NOTE, text: GERMAN }]);
    expect(binding.calls).toHaveLength(1);
    const calls = (await loadImportJobForRun(db, job.id))?.work.calls ?? [];
    expect(calls.at(-1)).toMatchObject({ task: "translate", prompt: TRANSLATE_PROMPT.version });
  });

  it.each([
    ["is busy", new Error("3040: Capacity temporarily exceeded, please try again.")],
    ["answers with something else", chatAnswer({ translation: "Potato Soup" })],
  ])("hands the draft back as it was when the model %s, and says so", async (_how, answer) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const job = await inReview();
    await api.post(`/imports/${job.id}/translate`, {});

    await runImportJob(job.id, IMPORT_HANDLERS, toolsWith([answer]).tools, "translate");

    const after = await loadImportJob(db, job.id);
    expect(after).toMatchObject({ status: "needs_review", error: null });
    expect(after?.result?.draft.title).toBe("Kartoffelsuppe");
    expect(after?.result?.draft.doubts.at(-1)).toEqual({
      where: "recipe",
      why: "It could not be translated: the AI gave no answer. It can be asked again.",
    });
    // Still not English, so it can be asked for again.
    expect((await api.post(`/imports/${job.id}/translate`, {})).status).toBe(202);
  });
});
