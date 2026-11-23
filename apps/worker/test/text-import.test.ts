import { env } from "cloudflare:workers";
import { AiCheckResponse, ErrorBody, ImportDetail, ImportJob } from "@recipeflare/schema";
import { fixtureMember, pastedLemonBars } from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { aiFor } from "../src/ai";
import { BUILD_PROMPT } from "../src/ai/prompts";
import { type AiSettings, createAiRunner } from "../src/ai/runner";
import { readByRule } from "../src/ai/standIn";
import { createImportJob, loadImportJob, loadImportJobForRun } from "../src/db/importJobs";
import { buildDraft, draftFromReading, type Reading } from "../src/imports/build";
import { IMPORT_HANDLERS } from "../src/imports/handlers";
import { type ImportTools, PermanentImportError, runImportJob } from "../src/imports/runner";
import { sourceOf, wordsOf } from "../src/imports/sourceCheck";
import { chatAnswer, seedLists, signedIn, standInBinding } from "./helpers";

/**
 * Importing from pasted text, with a stand-in for the model. The texts are
 * invented. What a real model makes of real text is seen on staging.
 */

const db = env.DB;

beforeAll(async () => {
  await seedLists(db);
});

const TEXT = `Garlic Bread

Serves 4. Prep: 10 minutes. Cook: 15 min.

1 loaf crusty bread
4 tbsp butter, soft
2 cloves garlic, crushed

Mix the butter and garlic. Spread on the bread.
Bake at 400 until crisp.

Tip: good with soup.`;

/** A faithful reading of TEXT. Tests change one thing at a time. */
const reading = (changes: Partial<Reading> = {}): Reading => ({
  recipe: true,
  title: "Garlic Bread",
  description: "",
  yield: "Serves 4",
  prepTime: "10 minutes",
  cookTime: "15 min",
  totalTime: null,
  source: null,
  ingredients: [
    { section: null, line: "1 loaf crusty bread", doubt: null },
    { section: null, line: "4 tbsp butter, soft", doubt: null },
    { section: null, line: "2 cloves garlic, crushed", doubt: null },
  ],
  steps: [
    { section: null, text: "Mix the butter and garlic. Spread on the bread.", doubt: null },
    { section: null, text: "Bake at 400 until crisp.", doubt: null },
  ],
  notes: ["good with soup."],
  ...changes,
});

const thrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
};

describe("the words of a text", () => {
  it("are its words and numbers, in one plain form", () => {
    expect(wordsOf("• 1½ cups Flour, sifted")).toEqual(["1", "1/2", "cups", "flour", "sifted"]);
    expect(wordsOf("2.5 kg; 1,000 g; 3/4 tsp")).toEqual(["2.5", "kg", "1,000", "g", "3/4", "tsp"]);
    expect(wordsOf("Grandma’s crème brûlée")).toEqual(["grandma's", "creme", "brulee"]);
    expect(wordsOf("1. Bake.\n2) Cool!")).toEqual(["1", "bake", "2", "cool"]);
    expect(wordsOf("   ")).toEqual([]);
  });

  it("can be asked what a line has that the text does not", () => {
    const source = sourceOf(TEXT);

    expect(source.missing("4 tbsp butter, soft")).toEqual([]);
    expect(source.missing("4 tbsp unsalted butter, softened")).toEqual(["unsalted", "softened"]);
    expect(source.missing("3 cloves garlic")).toEqual(["3"]);
    // Each missing word is said once.
    expect(source.missing("extra extra garlic")).toEqual(["extra"]);
  });

  it("can be asked whether the text has a line's words together, in order", () => {
    const source = sourceOf(TEXT);

    expect(source.hasRun("2 cloves garlic, crushed")).toBe(true);
    expect(source.hasRun("- 2 CLOVES garlic crushed")).toBe(true);
    // Every word is in the text, but not as this line.
    expect(source.hasRun("4 cloves garlic")).toBe(false);
    expect(source.hasRun("garlic 2 cloves")).toBe(false);
  });
});

describe("a draft from what a model read", () => {
  it("keeps a faithful reading as it is, with no doubts", () => {
    const draft = draftFromReading(reading(), TEXT);

    expect(draft).toMatchObject({
      title: "Garlic Bread",
      servings: 4,
      prepTimeSeconds: 600,
      cookTimeSeconds: 900,
      totalTimeSeconds: null,
      sourceUrl: null,
      imageUrl: null,
      doubts: [],
    });
    expect(draft.ingredientSections).toEqual([
      {
        title: null,
        items: [
          expect.objectContaining({ originalText: "1 loaf crusty bread", quantity: null }),
          expect.objectContaining({ originalText: "4 tbsp butter, soft", foodName: null }),
          expect.objectContaining({ originalText: "2 cloves garlic, crushed", unitName: null }),
        ],
      },
    ]);
    expect(draft.stepSections[0]?.steps.map((step) => step.text)).toEqual([
      "Mix the butter and garlic. Spread on the bread.",
      "Bake at 400 until crisp.",
    ]);
    expect(draft.notes).toEqual([{ title: "", text: "good with soup." }]);
  });

  it("keeps an ingredient line with a word the text does not have, and flags it", () => {
    const draft = draftFromReading(
      reading({
        ingredients: [
          { section: null, line: "1 loaf crusty bread", doubt: null },
          { section: null, line: "4 tbsp unsalted butter, soft", doubt: null },
        ],
      }),
      TEXT,
    );

    expect(draft.ingredientSections[0]?.items[1]?.originalText).toBe(
      "4 tbsp unsalted butter, soft",
    );
    expect(draft.doubts).toEqual([
      { where: "ingredient:1", why: 'Has a word that is not in the text: "unsalted".' },
    ]);
  });

  it("flags an ingredient the text does not have at all", () => {
    const draft = draftFromReading(
      reading({
        ingredients: [
          { section: null, line: "1 loaf crusty bread", doubt: null },
          { section: null, line: "1 tsp dried parsley", doubt: null },
        ],
      }),
      TEXT,
    );

    expect(draft.doubts).toEqual([
      {
        where: "ingredient:1",
        why: 'Has words that are not in the text: "tsp", "dried", "parsley".',
      },
    ]);
  });

  it("flags an amount that was moved onto another line", () => {
    const draft = draftFromReading(
      reading({ ingredients: [{ section: null, line: "4 cloves garlic, crushed", doubt: null }] }),
      TEXT,
    );

    expect(draft.doubts).toEqual([
      {
        where: "ingredient:0",
        why: "Is not written this way in the text. Check the amount and the wording.",
      },
    ]);
  });

  it("flags a step with words the text does not have", () => {
    const draft = draftFromReading(
      reading({
        steps: [
          { section: null, text: "Mix the butter and garlic. Spread on the bread.", doubt: null },
          { section: null, text: "Bake at 400 for 12 minutes until crisp.", doubt: null },
        ],
      }),
      TEXT,
    );

    expect(draft.stepSections[0]?.steps[1]?.text).toBe("Bake at 400 for 12 minutes until crisp.");
    expect(draft.doubts).toEqual([
      { where: "step:1", why: 'Has words that are not in the text: "for", "12".' },
    ]);
  });

  it("flags a title, a description and a note that were made up", () => {
    const draft = draftFromReading(
      reading({
        title: "Grandma's Garlic Bread",
        description: "A family favourite.",
        notes: ["Freezes well."],
      }),
      TEXT,
    );

    expect(draft.doubts.map((doubt) => doubt.where)).toEqual(["title", "description", "note:0"]);
    expect(draft.doubts[0]?.why).toBe(
      'The title has a word that is not in the text: "grandma\'s".',
    );
  });

  it("carries what the model itself was unsure of, on the line it was unsure of", () => {
    const draft = draftFromReading(
      reading({
        ingredients: [
          { section: null, line: "1 loaf crusty bread", doubt: null },
          { section: null, line: "4 tbsp butter, soft", doubt: " It could say 4 or 9. " },
        ],
        steps: [{ section: null, text: "Bake at 400 until crisp.", doubt: "No time is given." }],
      }),
      TEXT,
    );

    expect(draft.doubts).toEqual([
      { where: "ingredient:1", why: "It could say 4 or 9." },
      { where: "step:0", why: "No time is given." },
    ]);
  });

  it("drops a yield, a time or a source that the text does not state", () => {
    const draft = draftFromReading(
      reading({
        yield: "Serves 6",
        prepTime: "5 minutes",
        cookTime: "15 min",
        totalTime: "25 minutes",
        source: "Aunt May",
      }),
      TEXT,
    );

    expect(draft).toMatchObject({
      servings: null,
      prepTimeSeconds: null,
      cookTimeSeconds: 900,
      totalTimeSeconds: null,
      sourceName: null,
    });
    // Nothing is left to check, so nothing is flagged.
    expect(draft.doubts).toEqual([]);
  });

  it("gathers lines under the headings the text gives them", () => {
    const draft = draftFromReading(
      {
        ...reading(),
        title: "Lemon Bars",
        yield: "Makes 16",
        prepTime: null,
        cookTime: null,
        source: "the church cookbook",
        ingredients: [
          { section: "For the base:", line: "1 cup flour", doubt: null },
          { section: "For the base:", line: "1/2 cup butter, cold", doubt: null },
          { section: "For the top", line: "2 eggs", doubt: null },
          { section: "For the filling", line: "1 cup sugar", doubt: null },
        ],
        steps: [
          { section: "Method", text: "Bake again until set. Cool before cutting.", doubt: null },
        ],
        notes: [],
      },
      pastedLemonBars,
    );

    expect(
      draft.ingredientSections.map((section) => [section.title, section.items.length]),
    ).toEqual([
      ["For the base", 2],
      ["For the top", 1],
      // A heading the text does not have is not kept as one.
      [null, 1],
    ]);
    // "Method" says what the list is, not which part of the recipe it is for.
    expect(draft.stepSections[0]?.title).toBeNull();
    expect(draft).toMatchObject({ servings: 16, sourceName: "the church cookbook" });
  });

  it("is refused as too thin when the model found no recipe", () => {
    const none = reading({ recipe: false, ingredients: [], steps: [] });
    const empty = reading({ ingredients: [{ section: null, line: "  ", doubt: null }], steps: [] });

    for (const answer of [none, empty]) {
      const error = thrown(() => draftFromReading(answer, TEXT));
      expect(error).toBeInstanceOf(PermanentImportError);
      expect((error as PermanentImportError).code).toBe("too_thin");
    }
  });

  it("keeps a recipe that has ingredients and no steps, for review to say so", () => {
    const draft = draftFromReading(reading({ steps: [] }), TEXT);

    expect(draft.stepSections).toEqual([]);
    expect(draft.ingredientSections[0]?.items).toHaveLength(3);
  });
});

describe("asking a model for a draft", () => {
  it("gives it the text and the rules, and asks for the reading's shape", async () => {
    const binding = standInBinding([chatAnswer(reading())]);

    const draft = await buildDraft(TEXT, createAiRunner(binding, {}));

    expect(draft.title).toBe("Garlic Bread");
    const inputs = binding.calls[0]?.inputs as {
      messages: { role: string; content: string }[];
      response_format: { json_schema: { name: string; schema: { required: string[] } } };
    };
    expect(inputs.messages[0]?.content).toBe(BUILD_PROMPT.system);
    expect(inputs.messages[1]?.content).toBe(`The text:\n\n${TEXT}`);
    expect(inputs.response_format.json_schema.name).toBe("recipe_reading");
    // Every field is asked for, so a model's structured output has nothing to leave out.
    expect(inputs.response_format.json_schema.schema.required).toHaveLength(11);
  });

  it("does not ask at all for text that is blank", async () => {
    const binding = standInBinding([chatAnswer(reading())]);

    const error = await buildDraft("  \n ", createAiRunner(binding, {})).catch((e: unknown) => e);

    expect((error as PermanentImportError).code).toBe("too_thin");
    expect(binding.calls).toHaveLength(0);
  });
});

describe("importing pasted text", () => {
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
  const pasted = (text = TEXT) =>
    createImportJob(db, { kind: "text", sourceUrl: null, input: { text } }, fixtureMember.id);
  const job = async (id: string) => ImportJob.parse(await loadImportJob(db, id));

  it("lands in review with the draft, the text beside it, and a note that a model read it", async () => {
    const created = await pasted();
    const { tools } = toolsWith([chatAnswer(reading())]);

    expect(await runImportJob(created.id, IMPORT_HANDLERS, tools, null)).toEqual({ ack: true });

    const after = await job(created.id);
    expect(after).toMatchObject({ kind: "text", status: "needs_review", sourceUrl: null });
    expect(after.result).toMatchObject({ readBy: "ai", sourceText: TEXT, issues: [] });
    expect(after.result?.draft.title).toBe("Garlic Bread");
    // The job says which wording of the prompt it was read with.
    const kept = (await loadImportJobForRun(db, created.id))?.work;
    expect(kept?.calls?.[0]).toMatchObject({ task: "build", prompt: BUILD_PROMPT.version });
  });

  it("keeps an invented line and tells review to check it", async () => {
    const created = await pasted();
    const { tools } = toolsWith([
      chatAnswer(
        reading({
          ingredients: [
            { section: null, line: "1 loaf crusty bread", doubt: null },
            { section: null, line: "1 tsp dried parsley", doubt: null },
          ],
        }),
      ),
    ]);

    await runImportJob(created.id, IMPORT_HANDLERS, tools, null);

    const after = await job(created.id);
    expect(after.status).toBe("needs_review");
    expect(after.result?.draft.ingredientSections[0]?.items[1]?.originalText).toBe(
      "1 tsp dried parsley",
    );
    expect(after.result?.issues).toEqual([
      {
        code: "doubt",
        path: ["ingredientSections", 0, "items", 1],
        message: 'Has words that are not in the text: "tsp", "dried", "parsley".',
      },
    ]);
  });

  it("fails with too_thin when the text has no recipe in it", async () => {
    const created = await pasted("Running late, back by six. Can you feed the cat?");
    const { tools } = toolsWith([
      chatAnswer(reading({ recipe: false, ingredients: [], steps: [] })),
    ]);

    expect(await runImportJob(created.id, IMPORT_HANDLERS, tools, null)).toEqual({ ack: true });

    expect(await job(created.id)).toMatchObject({
      status: "failed",
      error: { code: "too_thin" },
      result: null,
    });
  });

  it("asks once more for an answer that is not the reading, then fails clearly", async () => {
    const created = await pasted();
    const { binding, tools } = toolsWith([chatAnswer({ title: "Garlic Bread", ingredients: [] })]);

    await runImportJob(created.id, IMPORT_HANDLERS, tools, null);

    expect(binding.calls).toHaveLength(2);
    expect(await job(created.id)).toMatchObject({ status: "failed", error: { code: "ai_answer" } });
  });

  it("lands in review when the second answer is the reading", async () => {
    const created = await pasted();
    const { binding, tools } = toolsWith([
      chatAnswer("Here is the recipe!"),
      chatAnswer(reading()),
    ]);

    await runImportJob(created.id, IMPORT_HANDLERS, tools, null);

    expect(binding.calls).toHaveLength(2);
    expect((await job(created.id)).status).toBe("needs_review");
  });
});

describe("POST /api/v1/imports with pasted text", () => {
  const queue = () => {
    const sent: unknown[] = [];
    return {
      sent,
      queue: { send: async (body: unknown) => void sent.push(body) } as unknown as Queue,
    };
  };

  it("takes the text on as a job of its own kind, with no link", async () => {
    const { sent, queue: fake } = queue();
    const api = signedIn({ ...env, IMPORT_QUEUE: fake }, fixtureMember.email ?? "");

    const response = await api.post("/imports", { kind: "text", text: `\n${TEXT}\n\n` });

    expect(response.status).toBe(202);
    const created = ImportJob.parse(await response.json());
    expect(created).toMatchObject({ kind: "text", status: "queued", sourceUrl: null });
    expect(sent).toEqual([{ jobId: created.id, stage: null }]);
    // Kept trimmed, and as it was otherwise.
    expect((await loadImportJobForRun(db, created.id))?.input).toEqual({ text: TEXT });

    const detail = ImportDetail.parse(await (await api.get(`/imports/${created.id}`)).json());
    expect(detail.duplicate).toBeNull();
  });

  it.each([
    ["nothing", { kind: "text", text: "   " }],
    ["too much", { kind: "text", text: "x".repeat(50_001) }],
    ["no text at all", { kind: "text" }],
  ])("refuses %s", async (_what, body) => {
    const { sent, queue: fake } = queue();
    const api = signedIn({ ...env, IMPORT_QUEUE: fake }, fixtureMember.email ?? "");

    const response = await api.post("/imports", body);

    expect(response.status).toBe(400);
    expect(ErrorBody.parse(await response.json()).error.code).toBe("validation_failed");
    expect(sent).toEqual([]);
  });
});

describe("the scripted stand-in model", () => {
  const standIn: Cloudflare.Env & AiSettings = { ...env, AI_MODE: "stand-in" };

  it("reads a recipe laid out the usual way, well enough to try the screens with", () => {
    const read = readByRule(pastedLemonBars);

    expect(read.recipe).toBe(true);
    expect(read.title).toBe("Lemon Bars (from the church cookbook)");
    expect(read.ingredients.map((entry) => [entry.section, entry.line])).toEqual([
      ["For the base", "1 cup flour"],
      ["For the base", "1/2 cup butter, cold"],
      ["For the base", "1/4 cup powdered sugar"],
      ["For the top", "2 eggs"],
      ["For the top", "1 cup sugar"],
      ["For the top", "3 tbsp lemon juice"],
      ["For the top", "2 tbsp flour"],
      ["For the top", "1/2 tsp baking powdr"],
    ]);
    expect(read.steps).toHaveLength(4);
    // What it reads passes the same checks a model's reading does.
    expect(draftFromReading(read, pastedLemonBars).doubts).toEqual([]);
  });

  it("finds no recipe in text that has none", () => {
    expect(readByRule("Running late, back by six").recipe).toBe(false);
    expect(readByRule("").recipe).toBe(false);
  });

  it("stands in for the model when the setting says so, through the same runner", async () => {
    const ai = aiFor(standIn);

    const draft = await buildDraft(pastedLemonBars, ai);

    expect(draft.ingredientSections.map((section) => section.title)).toEqual([
      "For the base",
      "For the top",
    ]);
  });

  it("is refused to a request that is not to localhost", async () => {
    // The fixtures' member is this file's owner.
    const here = signedIn(standIn, fixtureMember.email ?? "");

    const local = AiCheckResponse.parse(await (await here.post("/ai/check", {})).json());
    expect(local).toMatchObject({ ok: true, model: "stand-in" });

    expect(() => aiFor(standIn, "https://recipes.example.com/x")).toThrow("localhost only");
  });
});
