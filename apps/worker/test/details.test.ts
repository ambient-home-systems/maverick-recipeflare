import { env } from "cloudflare:workers";
import {
  ErrorBody,
  ImportDetail,
  matchReading,
  ReadIngredientsResponse,
} from "@recipeflare/schema";
import { fixtureFoods, fixtureMember, fixtureUnits } from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LINES_PROMPT } from "../src/ai/prompts";
import { createAiRunner } from "../src/ai/runner";
import { createImportJob, loadImportJob, loadImportJobForRun } from "../src/db/importJobs";
import { checkReading, type LineReadings, readLines, statedAmount } from "../src/imports/details";
import { IMPORT_HANDLERS } from "../src/imports/handlers";
import { type ImportTools, runImportJob } from "../src/imports/runner";
import { chatAnswer, noAi, seedLists, signedIn, standInBinding } from "./helpers";

/**
 * Ingredient lines the rules cannot read, read by a model and checked against
 * the line. The model is a stand-in and the lines are invented. What a real
 * model makes of a real line is seen on staging.
 */

const db = env.DB;

beforeAll(async () => {
  await seedLists(db);
});

type Said = LineReadings["lines"][number];
/** A model's reading of one line. Tests change one thing at a time. */
const said = (changes: Partial<Said> = {}): Said => ({
  number: 1,
  quantity: 2,
  unit: null,
  food: "lemons",
  note: "Juice of",
  ...changes,
});

/** The words a call was sent, after the rules: the numbered lines. */
function linesAsked(call: { inputs: Record<string, unknown> } | undefined): string {
  const messages = (call?.inputs.messages ?? []) as { content: unknown }[];
  return String(messages[1]?.content ?? "");
}

describe("the amount a line states", () => {
  it.each([
    ["Juice of 2 lemons", 2],
    ["Zest of 1 1/2 oranges", 1.5],
    ["about ½ cup stock", 0.5],
    ["one large onion", 1],
    ["half a lemon", 0.5],
    ["a dozen eggs", 12],
    // Two amounts where one belongs: neither is the line's amount.
    ["4 to 6 cups water", null],
    ["2-3 carrots", null],
    ["2 or 3 cloves", null],
    // No amount at all.
    ["Salt and pepper to taste", null],
    ["a knob of butter", null],
  ])("of %j is %j", (line, amount) => {
    expect(statedAmount(line)).toBe(amount);
  });
});

describe("checking a model's reading against its line", () => {
  const LINE = "Juice of 2 lemons";

  it("keeps a reading the line bears out", () => {
    expect(checkReading(LINE, said())).toEqual({
      quantity: 2,
      unitName: null,
      foodName: "lemons",
      note: "Juice of",
    });
  });

  it("drops an amount the line does not state, and keeps the rest", () => {
    expect(checkReading(LINE, said({ quantity: 3 }))).toMatchObject({
      quantity: null,
      foodName: "lemons",
    });
    // A dozen is twelve, but the line has to say so.
    expect(checkReading("a few eggs", said({ quantity: 3, food: "eggs", note: "" }))).toEqual({
      quantity: null,
      unitName: null,
      foodName: "eggs",
      note: "",
    });
  });

  it("drops a unit the line does not have", () => {
    expect(checkReading(LINE, said({ unit: "whole" }))).toMatchObject({
      quantity: 2,
      unitName: null,
    });
    expect(
      checkReading("a knob of butter", said({ quantity: null, unit: "knob", food: "butter" })),
    ).toMatchObject({ quantity: null, unitName: "knob", foodName: "butter" });
  });

  it("drops a food that is not in the line, word for word", () => {
    // The model tidied the name: "lemon juice" is not written here.
    expect(checkReading(LINE, said({ food: "lemon juice" }))).toMatchObject({
      quantity: 2,
      foodName: null,
    });
    // A food has to be words; a mark on its own is not one.
    expect(checkReading(LINE, said({ food: "-" }))).toMatchObject({ foodName: null });
  });

  it("drops a note with a word the line does not have", () => {
    expect(checkReading(LINE, said({ note: "freshly squeezed" }))).toMatchObject({
      foodName: "lemons",
      note: "",
    });
  });

  it("gives nothing when no field is left that says what the ingredient is", () => {
    expect(
      checkReading(
        "Salt and pepper to taste",
        said({ quantity: 1, unit: "tsp", food: "sea salt" }),
      ),
    ).toBeNull();
    // A note alone does not make a reading.
    expect(
      checkReading(LINE, said({ quantity: null, unit: null, food: null, note: "Juice of" })),
    ).toBeNull();
  });

  it("gives no amount for a range, whichever end the model picked", () => {
    const line = "4 to 6 cups water";
    for (const quantity of [4, 6, 5]) {
      expect(
        checkReading(line, said({ quantity, unit: "cups", food: "water", note: "" })),
      ).toMatchObject({ quantity: null, unitName: "cups", foodName: "water" });
    }
  });
});

describe("matching a reading to the household's own", () => {
  const lists = { units: fixtureUnits, foods: fixtureFoods };
  const lemon = fixtureFoods.find((food) => food.name === "lemon");
  const cup = fixtureUnits.find((unit) => unit.name === "cup");

  it("finds a food the household has, written in the plural", () => {
    expect(
      matchReading({ quantity: 2, unitName: null, foodName: "lemons", note: "juice of" }, lists),
    ).toEqual({ quantity: 2, unitId: null, foodId: lemon?.id, newFood: null, note: "juice of" });
  });

  it("carries a food the household lacks as a new food, and creates nothing", () => {
    expect(
      matchReading({ quantity: 1, unitName: "cups", foodName: "quince", note: "" }, lists),
    ).toEqual({ quantity: 1, unitId: cup?.id, foodId: null, newFood: "quince", note: "" });
  });

  it("leaves out a unit the household does not have", () => {
    expect(
      matchReading({ quantity: null, unitName: "knob", foodName: "butter", note: "" }, lists),
    ).toMatchObject({ unitId: null, newFood: null });
  });

  it("is nothing when nothing matched and nothing is left", () => {
    expect(
      matchReading({ quantity: null, unitName: "knob", foodName: null, note: "soft" }, lists),
    ).toBeNull();
  });
});

describe("asking a model to read lines", () => {
  it("asks once for all the lines, numbered, and gives each its own answer", async () => {
    const binding = standInBinding([
      chatAnswer({
        lines: [
          // Out of order, and one line left out.
          said({ number: 3, quantity: null, unit: "knob", food: "butter", note: "" }),
          said({ number: 1 }),
        ],
      }),
    ]);

    const read = await readLines(
      ["Juice of 2 lemons", "Salt and pepper to taste", "a knob of butter"],
      createAiRunner(binding, {}),
    );

    expect(binding.calls).toHaveLength(1);
    expect(linesAsked(binding.calls[0])).toBe(
      "The lines:\n\n1. Juice of 2 lemons\n2. Salt and pepper to taste\n3. a knob of butter",
    );
    expect(read).toEqual([
      { quantity: 2, unitName: null, foodName: "lemons", note: "Juice of" },
      null,
      { quantity: null, unitName: "knob", foodName: "butter", note: "" },
    ]);
  });

  it("asks nothing when there is nothing to read", async () => {
    expect(await readLines([], noAi)).toEqual([]);
  });
});

/** Pasted text whose second and fourth lines the rules cannot read. */
const TEXT = `Lemon Rice

2 cups rice
Juice of 2 lemons
1 clove garlic
a knob of butter

Boil the rice. Stir in the rest.`;

const built = {
  recipe: true,
  title: "Lemon Rice",
  description: "",
  yield: null,
  prepTime: null,
  cookTime: null,
  totalTime: null,
  source: null,
  ingredients: [
    { section: null, line: "2 cups rice", doubt: null },
    { section: null, line: "Juice of 2 lemons", doubt: null },
    { section: null, line: "1 clove garlic", doubt: null },
    { section: null, line: "a knob of butter", doubt: null },
  ],
  steps: [{ section: null, text: "Boil the rice. Stir in the rest.", doubt: null }],
  notes: [],
};

const pasted = (text = TEXT) =>
  createImportJob(db, { kind: "text", sourceUrl: null, input: { text } }, fixtureMember.id);

const toolsWith = (answers: unknown[]) => {
  const binding = standInBinding(answers);
  const tools: ImportTools = { fetch, env, ai: createAiRunner(binding, {}), send: async () => {} };
  return { binding, tools };
};

const itemsOf = async (id: string) =>
  (await loadImportJob(db, id))?.result?.draft.ingredientSections.flatMap(
    (section) => section.items,
  ) ?? [];

describe("an import with lines the rules cannot read", () => {
  it("sends only those lines to a model, in one more stage, and keeps what each bears out", async () => {
    const job = await pasted();
    const { binding, tools } = toolsWith([
      chatAnswer(built),
      chatAnswer({
        lines: [
          said({ number: 1 }),
          // The amount is not in the line: it is dropped, and the rest kept.
          said({ number: 2, quantity: 1, unit: "knob", food: "butter", note: "" }),
        ],
      }),
    ]);

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);
    expect(await loadImportJob(db, job.id)).toMatchObject({ status: "running", stage: "details" });
    await runImportJob(job.id, IMPORT_HANDLERS, tools, "details");

    // The lines the rules read were never shown to the model.
    expect(linesAsked(binding.calls[1])).toBe(
      "The lines:\n\n1. Juice of 2 lemons\n2. a knob of butter",
    );
    expect(await itemsOf(job.id)).toEqual([
      { originalText: "2 cups rice", quantity: null, unitName: null, foodName: null, note: "" },
      {
        originalText: "Juice of 2 lemons",
        quantity: 2,
        unitName: null,
        foodName: "lemons",
        note: "Juice of",
      },
      { originalText: "1 clove garlic", quantity: null, unitName: null, foodName: null, note: "" },
      {
        originalText: "a knob of butter",
        quantity: null,
        unitName: "knob",
        foodName: "butter",
        note: "",
      },
    ]);
    const after = await loadImportJob(db, job.id);
    expect(after).toMatchObject({ status: "needs_review", stage: "details" });
    expect(after?.result).toMatchObject({ readBy: "ai", sourceText: TEXT });
    // Both calls are kept with the job, each under its own task and wording.
    const calls = (await loadImportJobForRun(db, job.id))?.work.calls;
    expect(calls?.map((call) => [call.task, call.prompt])).toEqual([
      ["build", expect.any(String)],
      ["details", LINES_PROMPT.version],
    ]);
  });

  it("asks no model a second time when the rules read every line", async () => {
    const job = await pasted("Rice\n\n2 cups rice\n1 clove garlic\n\nBoil the rice.");
    const { binding, tools } = toolsWith([
      chatAnswer({
        ...built,
        title: "Rice",
        ingredients: [
          { section: null, line: "2 cups rice", doubt: null },
          { section: null, line: "1 clove garlic", doubt: null },
        ],
        steps: [{ section: null, text: "Boil the rice.", doubt: null }],
      }),
    ]);

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);

    expect(await loadImportJob(db, job.id)).toMatchObject({ status: "needs_review", stage: null });
    expect(binding.calls).toHaveLength(1);
  });

  it.each([
    ["is busy", new Error("3040: Capacity temporarily exceeded, please try again.")],
    ["answers with something else", chatAnswer({ rows: [] })],
  ])(
    "still hands the draft to review when the model %s, with those lines as written",
    async (_how, answer) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const job = await pasted();
      const { tools } = toolsWith([chatAnswer(built), answer]);

      await runImportJob(job.id, IMPORT_HANDLERS, tools, null);
      await runImportJob(job.id, IMPORT_HANDLERS, tools, "details");

      expect(await loadImportJob(db, job.id)).toMatchObject({
        status: "needs_review",
        error: null,
      });
      expect((await itemsOf(job.id)).map((item) => [item.originalText, item.foodName])).toEqual([
        ["2 cups rice", null],
        ["Juice of 2 lemons", null],
        ["1 clove garlic", null],
        ["a knob of butter", null],
      ]);
      // The call that gave nothing is on the record all the same.
      const calls = (await loadImportJobForRun(db, job.id))?.work.calls;
      expect(calls?.at(-1)).toMatchObject({ task: "details", tries: 0 });
      expect(calls?.at(-1)?.failed).toBeTruthy();
    },
  );

  it("shows the import as being written up while its lines are read", async () => {
    const job = await pasted();
    const { tools } = toolsWith([chatAnswer(built)]);
    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);

    const api = signedIn(env, fixtureMember.email ?? "");
    const shown = ImportDetail.parse(await (await api.get(`/imports/${job.id}`)).json());

    expect(shown).toMatchObject({ status: "running", stage: "details" });
  });
});

describe("POST /api/v1/ai/ingredients", () => {
  const apiWith = (answers: unknown[]) => {
    const binding = standInBinding(answers);
    const api = signedIn(env, fixtureMember.email ?? "", { ai: createAiRunner(binding, {}) });
    return { binding, api };
  };

  it("reads a line the rules could not, checked against the line", async () => {
    const { binding, api } = apiWith([chatAnswer({ lines: [said()] })]);

    const response = await api.post("/ai/ingredients", { lines: ["Juice of 2 lemons"] });

    expect(response.status).toBe(200);
    expect(ReadIngredientsResponse.parse(await response.json())).toEqual({
      lines: [{ quantity: 2, unitName: null, foodName: "lemons", note: "Juice of" }],
    });
    expect(binding.calls).toHaveLength(1);
    expect(binding.calls[0]?.inputs).toMatchObject({
      response_format: { json_schema: { name: "ingredient_lines" } },
    });
  });

  it("never sends a model a line the rules read", async () => {
    const { binding, api } = apiWith([chatAnswer({ lines: [said()] })]);

    const response = await api.post("/ai/ingredients", {
      lines: ["2 cups flour", "Juice of 2 lemons", "1 clove garlic"],
    });

    expect(ReadIngredientsResponse.parse(await response.json()).lines).toEqual([
      null,
      { quantity: 2, unitName: null, foodName: "lemons", note: "Juice of" },
      null,
    ]);
    expect(linesAsked(binding.calls[0])).toBe("The lines:\n\n1. Juice of 2 lemons");
  });

  it("asks no model at all when the rules read every line", async () => {
    const api = signedIn(env, fixtureMember.email ?? "", { ai: noAi });

    const response = await api.post("/ai/ingredients", { lines: ["2 cups flour"] });

    expect(ReadIngredientsResponse.parse(await response.json()).lines).toEqual([null]);
  });

  it("gives nothing for a line when nothing the model said is in it", async () => {
    const { api } = apiWith([
      chatAnswer({ lines: [said({ quantity: 9, unit: "tbsp", food: "lemon juice", note: "" })] }),
    ]);

    const response = await api.post("/ai/ingredients", { lines: ["Juice of 2 lemons"] });

    expect(ReadIngredientsResponse.parse(await response.json()).lines).toEqual([null]);
  });

  it.each([
    ["3040: Capacity temporarily exceeded, please try again.", 503, "ai_unavailable"],
    ["3036: You have used up your daily free allocation of 10,000 neurons.", 429, "ai_limit"],
    ["5028: @cf/old/model was deprecated on 2026-11-20.", 502, "ai_setup"],
  ])("says why when the model gives no answer: %j", async (message, status, code) => {
    const { api } = apiWith([new Error(message)]);

    const response = await api.post("/ai/ingredients", { lines: ["Juice of 2 lemons"] });

    expect(response.status).toBe(status);
    expect(ErrorBody.parse(await response.json()).error.code).toBe(code);
  });

  it.each([
    ["no lines", { lines: [] }],
    ["an empty line", { lines: ["  "] }],
    ["too many lines", { lines: Array.from({ length: 31 }, (_, n) => `line ${n}`) }],
  ])("refuses %s", async (_what, body) => {
    const api = signedIn(env, fixtureMember.email ?? "", { ai: noAi });

    const response = await api.post("/ai/ingredients", body);

    expect(response.status).toBe(400);
    expect(ErrorBody.parse(await response.json()).error.code).toBe("validation_failed");
  });

  it("is for members: a stranger is turned away", async () => {
    const response = await signedIn(env, "", { ai: noAi }).post("/ai/ingredients", {
      lines: ["Juice of 2 lemons"],
    });

    expect(response.status).toBe(401);
  });
});
