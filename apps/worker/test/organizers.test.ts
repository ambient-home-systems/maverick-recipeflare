import { env } from "cloudflare:workers";
import { fixtureMember, fixtureOrganizers } from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ORGANIZE_PROMPT } from "../src/ai/prompts";
import { createAiRunner } from "../src/ai/runner";
import { createImportJob, loadImportJob, loadImportJobForRun } from "../src/db/importJobs";
import { IMPORT_HANDLERS } from "../src/imports/handlers";
import { ownOnly, suggestOrganizers } from "../src/imports/organizers";
import { type ImportTools, runImportJob } from "../src/imports/runner";
import { chatAnswer, noAi, seedLists, standInBinding } from "./helpers";

/**
 * Organizers for a recipe a model wrote up: chosen from the household's own
 * lists, and checked against them. The model is a stand-in and the recipe is
 * invented.
 */

const db = env.DB;

beforeAll(async () => {
  await seedLists(db);
});

const TEXT = `Leek and Potato Soup

2 cups stock
1 clove garlic

Simmer everything in a Dutch oven. Blend.`;

const built = {
  recipe: true,
  title: "Leek and Potato Soup",
  description: "",
  yield: null,
  prepTime: null,
  cookTime: null,
  totalTime: null,
  source: null,
  ingredients: [
    { section: null, line: "2 cups stock", doubt: null },
    { section: null, line: "1 clove garlic", doubt: null },
  ],
  steps: [{ section: null, text: "Simmer everything in a Dutch oven. Blend.", doubt: null }],
  notes: [],
};

const choice = (changes: object = {}) =>
  chatAnswer({ categories: ["Soup"], tags: ["Vegetarian"], tools: ["Dutch oven"], ...changes });

const toolsWith = (answers: unknown[], organizers?: unknown) => {
  const binding = standInBinding(answers, organizers);
  const tools: ImportTools = { fetch, env, ai: createAiRunner(binding, {}), send: async () => {} };
  return { binding, tools };
};

const pasted = () =>
  createImportJob(db, { kind: "text", sourceUrl: null, input: { text: TEXT } }, fixtureMember.id);

describe("keeping only the household's own", () => {
  it("refuses a name that is not on the list", () => {
    expect(ownOnly(["Soup", "Comfort food", "Starters"], "category", fixtureOrganizers)).toEqual([
      "Soup",
    ]);
  });

  it("gives the household's spelling, whatever the model's", () => {
    expect(ownOnly(["family FAVORITE", " weeknight "], "tag", fixtureOrganizers)).toEqual([
      "Family favorite",
      "Weeknight",
    ]);
  });

  it("does not take a name from another kind's list", () => {
    // "Soup" is a category of theirs, not a tag.
    expect(ownOnly(["Soup"], "tag", fixtureOrganizers)).toEqual([]);
    expect(ownOnly(["Dutch oven"], "category", fixtureOrganizers)).toEqual([]);
  });

  it("gives each name once, and no more than a recipe would wear", () => {
    expect(ownOnly(["Soup", "soup", "Dinner", "Dessert"], "category", fixtureOrganizers)).toEqual([
      "Soup",
      "Dinner",
    ]);
  });
});

describe("asking which organizers fit", () => {
  it("shows the model the household's lists by kind, and the recipe, and nothing else", async () => {
    const { binding, tools } = toolsWith([], choice());

    await suggestOrganizers(TEXT, tools);

    expect(binding.organizerCalls).toHaveLength(1);
    const messages = binding.organizerCalls[0]?.inputs.messages as { content: string }[];
    expect(messages[0]?.content).toBe(ORGANIZE_PROMPT.system);
    expect(messages[1]?.content).toBe(
      [
        "The household's own lists:",
        "Categories:\nBreakfast\nDessert\nDinner\nSoup",
        "Tags:\nFamily favorite\nFreezes well\nHoliday\nVegetarian\nWeeknight",
        "Tools:\nDutch oven\nGriddle\nRoasting pan\nStand mixer",
        `The recipe:\n\n${TEXT}`,
      ].join("\n\n"),
    );
  });

  it("keeps what is theirs and refuses the rest", async () => {
    const { tools } = toolsWith(
      [],
      choice({
        categories: ["Soup", "Starters"],
        tags: ["Vegan", "Vegetarian"],
        tools: ["Blender"],
      }),
    );

    expect(await suggestOrganizers(TEXT, tools)).toEqual({
      suggestedCategories: ["Soup"],
      suggestedTags: ["Vegetarian"],
      suggestedTools: [],
    });
  });

  it.each([
    ["is busy", new Error("3040: Capacity temporarily exceeded, please try again.")],
    ["answers with something else", chatAnswer({ organizers: ["Soup"] })],
  ])("suggests nothing when the model %s", async (_how, answer) => {
    const { tools } = toolsWith([], answer);

    expect(await suggestOrganizers(TEXT, tools)).toEqual({
      suggestedCategories: [],
      suggestedTags: [],
      suggestedTools: [],
    });
  });

  it("asks nothing about text with nothing in it", async () => {
    expect(await suggestOrganizers("  ", { fetch, env, ai: noAi })).toMatchObject({
      suggestedCategories: [],
    });
  });
});

describe("an import a model writes up", () => {
  it("arrives with the household's organizers that fit, as suggestions", async () => {
    const job = await pasted();
    const { binding, tools } = toolsWith([chatAnswer(built)], choice({ tags: ["Vegan"] }));

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);

    const draft = (await loadImportJob(db, job.id))?.result?.draft;
    expect(draft).toMatchObject({
      title: "Leek and Potato Soup",
      suggestedCategories: ["Soup"],
      // "Vegan" is not one of theirs.
      suggestedTags: [],
      suggestedTools: ["Dutch oven"],
    });
    // One question to write it up, and one, beside it, about organizers.
    expect(binding.calls).toHaveLength(1);
    expect(binding.organizerCalls).toHaveLength(1);
    const calls = (await loadImportJobForRun(db, job.id))?.work.calls ?? [];
    expect(calls.map((call) => call.prompt).sort()).toEqual(
      [ORGANIZE_PROMPT.version, expect.stringMatching(/^build-/)].sort(),
    );
  });

  it("still arrives when the question about organizers gets no answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const job = await pasted();
    const { tools } = toolsWith(
      [chatAnswer(built)],
      new Error("3040: Capacity temporarily exceeded, please try again."),
    );

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);

    const after = await loadImportJob(db, job.id);
    expect(after).toMatchObject({ status: "needs_review", error: null });
    expect(after?.result?.draft.suggestedCategories).toEqual([]);
    // The call that gave nothing is on the job's record.
    const calls = (await loadImportJobForRun(db, job.id))?.work.calls ?? [];
    expect(calls.some((call) => call.prompt === ORGANIZE_PROMPT.version && call.failed)).toBe(true);
  });

  it("fails as it would have when the recipe itself cannot be written up", async () => {
    const job = await pasted();
    const { tools } = toolsWith([chatAnswer({ ...built, recipe: false })], choice());

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);

    expect(await loadImportJob(db, job.id)).toMatchObject({
      status: "failed",
      error: { code: "too_thin" },
    });
  });
});

// Last in the file: it empties the household's organizers, which the tests above need.
describe("a household with no organizers", () => {
  it("gets no suggestions, and no model is asked about them", async () => {
    await db.prepare("DELETE FROM organizers").run();
    const job = await pasted();
    const { binding, tools } = toolsWith([chatAnswer(built)], choice());

    await runImportJob(job.id, IMPORT_HANDLERS, tools, null);

    const draft = (await loadImportJob(db, job.id))?.result?.draft;
    expect(draft).toMatchObject({
      suggestedCategories: [],
      suggestedTags: [],
      suggestedTools: [],
    });
    expect(binding.organizerCalls).toHaveLength(0);
    expect(binding.calls).toHaveLength(1);
  });
});
