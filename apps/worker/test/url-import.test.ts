import { env } from "cloudflare:workers";
import {
  draftToInput,
  ImportDetail,
  ImportJob,
  ImportListResponse,
  Recipe,
  RecipeDraft,
  type RecipeInput,
} from "@recipeflare/schema";
import {
  fixtureFoods,
  fixtureMember,
  fixtureOrganizers,
  fixtureUnits,
} from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createImportJob, loadImportJob } from "../src/db/importJobs";
import { createRecipe } from "../src/db/recipes";
import { IMPORT_HANDLERS } from "../src/imports/handlers";
import { PermanentImportError, RetryableImportError, runImportJob } from "../src/imports/runner";
import {
  checkedUrl,
  findRecipe,
  importFromUrl,
  plainText,
  readInstructions,
  readYield,
} from "../src/imports/url";
import {
  articlePage,
  barePage,
  brokenBlockPage,
  graphPage,
  listPage,
  mainEntityPage,
  plainPage,
} from "./fixtures/recipe-pages";
import { countingDatabase, seedLists, signedIn } from "./helpers";

const db = env.DB;

beforeAll(async () => {
  await seedLists(db);
});

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    ...init,
    headers: { "Content-Type": "text/html; charset=utf-8", ...init.headers },
  });

/** A stand-in for the network: the answer for each address, and a record of what was asked. */
function site(pages: Record<string, () => Response | Promise<Response>>) {
  return vi.fn<typeof fetch>(async (input) => {
    const answer = pages[String(input)];
    if (!answer) {
      throw new Error(`nothing is served at ${String(input)}`);
    }
    return answer();
  });
}

const JOB = { id: "", kind: "url" } as unknown as ImportJob;

/** Runs the handler on one page and returns the draft as the runner would store it. */
async function draftOf(body: string, url = "https://kitchen.example.com/recipes/a-dish") {
  const fetcher = site({ [url]: () => html(body) });
  return RecipeDraft.parse(await importFromUrl(JOB, { url }, { fetch: fetcher, env }));
}

async function failureOf(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    return error;
  }
  throw new Error("the import did not fail");
}

describe("reading a recipe from a page", () => {
  it("maps a plain recipe: who it is from, yield, times, lines, steps, nutrition and suggestions", async () => {
    const draft = await draftOf(plainPage);

    expect(draft).toMatchObject({
      title: "Skillet Corn Cakes",
      description: "Crisp-edged corn cakes for a weeknight.",
      sourceName: "Odalys Brandt",
      sourceUrl: "https://kitchen.example.com/recipes/a-dish",
      // An address written from the site's root is made whole.
      imageUrl: "https://kitchen.example.com/pictures/corn-cakes-wide.jpg",
      servings: 4,
      yieldQuantity: null,
      prepTimeSeconds: 600,
      cookTimeSeconds: 1200,
      totalTimeSeconds: 1800,
      suggestedCategories: ["Side dishes"],
      suggestedTags: ["corn", "skillet", "quick", "Invented"],
    });
    expect(draft.nutrition).toMatchObject({ calories: "210 kcal", proteinContent: "6 g" });
    expect(draft.ingredientSections).toHaveLength(1);
    // Every line is kept as the page wrote it; reading it is the parser's job, later.
    expect(draft.ingredientSections[0]?.items.map((item) => item.originalText)).toEqual([
      "1 cup cornmeal",
      "1/2 cup flour",
      "1 egg",
      "3/4 cup buttermilk",
      "2 Tbsp butter, melted",
    ]);
    expect(draft.ingredientSections[0]?.items.every((item) => item.quantity === null)).toBe(true);
    expect(draft.stepSections).toEqual([
      {
        title: null,
        steps: [
          expect.objectContaining({ text: "Whisk the cornmeal and flour together." }),
          expect.objectContaining({ text: "Stir in the egg, buttermilk and butter." }),
          expect.objectContaining({
            text: "Fry spoonfuls in a hot skillet until golden on both sides.",
          }),
        ],
      },
    ]);
  });

  it("finds the recipe inside a graph, and keeps the sections its method is written in", async () => {
    const draft = await draftOf(graphPage);

    expect(draft.title).toBe("Plum Slump");
    // The author is only a pointer here, so the publisher is who it is from.
    expect(draft.sourceName).toBe("Graph Kitchen");
    expect(draft.imageUrl).toBe("https://graph.example.com/plum.jpg");
    expect(draft).toMatchObject({ servings: null, yieldQuantity: 1, yieldUnit: "dish" });
    expect(draft.stepSections.map((section) => section.title)).toEqual(["Fruit", "Topping"]);
    expect(draft.stepSections[0]?.steps.map((step) => step.text)).toEqual([
      "Simmer the plums until soft.",
      "Sweeten to taste.",
    ]);
  });

  it("finds a recipe in a list, typed as two things, and reads text as a person would", async () => {
    const draft = await draftOf(listPage);

    expect(draft.title).toBe("Pan Toast & Jam");
    expect(draft.servings).toBe(2);
    expect(draft.totalTimeSeconds).toBe(4500);
    expect(draft.ingredientSections[0]?.items.map((item) => item.originalText)).toEqual([
      "4 slices bread",
      "½ cup jam",
      "butter for the pan",
    ]);
    // One string for the whole method: each line of it is a step.
    expect(draft.stepSections[0]?.steps.map((step) => step.text)).toEqual([
      "Butter the pan.",
      "Toast the bread on both sides.",
      "Spread with jam.",
    ]);
    expect(draft.suggestedTags).toEqual(["breakfast", "toast"]);
    expect(draft.sourceName).toBeNull();
  });

  it("passes over a block that is not JSON and mends one with a line break in a string", async () => {
    expect((await draftOf(brokenBlockPage)).title).toBe("Mended Soup");
  });

  it("finds a recipe that is the page's main entity", async () => {
    const draft = await draftOf(mainEntityPage);

    expect(draft.title).toBe("Nested Noodles");
    expect(draft).toMatchObject({ yieldQuantity: 24, yieldUnit: "dumplings", servings: null });
  });

  it("takes the site's name when the page names no author", async () => {
    const page = plainPage.replace('"author":{"@type":"Person","name":"Odalys Brandt"},', "");

    expect((await draftOf(page)).sourceName).toBe("The Invented Kitchen");
  });

  it.each([
    ["an article", articlePage],
    ["a page with no structured data", barePage],
  ])(
    "fails for good on %s, saying no recipe was found, and guesses nothing",
    async (_name, body) => {
      const error = await failureOf(draftOf(body));

      expect(error).toBeInstanceOf(PermanentImportError);
      expect(error).toMatchObject({ code: "no_recipe" });
    },
  );
});

describe("fetching the page", () => {
  const url = "https://kitchen.example.com/a";
  const run = (fetcher: typeof fetch, address = url) =>
    importFromUrl(JOB, { url: address }, { fetch: fetcher, env });

  it.each([
    "http://192.168.1.10/recipe",
    "http://[::1]/recipe",
    "http://2130706433/recipe",
    "http://localhost:8787/recipe",
    "http://printer.local/recipe",
    "http://intranet/recipe",
    "ftp://kitchen.example.com/recipe",
    "not an address",
  ])("refuses %s without asking for it", async (address) => {
    const fetcher = site({});

    const error = await failureOf(run(fetcher, address));

    expect(error).toMatchObject({ code: "bad_link" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts an ordinary address", () => {
    expect(checkedUrl("https://www.example.com/recipes/1?x=2").hostname).toBe("www.example.com");
  });

  it("follows a redirect, and reads addresses on the page from where it landed", async () => {
    const fetcher = site({
      [url]: () =>
        new Response(null, { status: 301, headers: { Location: "https://www.example.org/b" } }),
      "https://www.example.org/b": () => html(plainPage),
    });

    const draft = RecipeDraft.parse(await run(fetcher));

    expect(draft.imageUrl).toBe("https://www.example.org/pictures/corn-cakes-wide.jpg");
    // The link is kept as it was given, so the same link pasted again is recognised.
    expect(draft.sourceUrl).toBe(url);
  });

  it("does not follow a redirect to a machine named by number", async () => {
    const fetcher = site({
      [url]: () =>
        new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/latest" } }),
    });

    expect(await failureOf(run(fetcher))).toMatchObject({ code: "bad_link" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("gives up on a link that leads round in circles", async () => {
    const fetcher = site({
      [url]: () => new Response(null, { status: 302, headers: { Location: url } }),
    });

    expect(await failureOf(run(fetcher))).toMatchObject({ code: "no_page" });
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it.each([
    [403, "blocked"],
    [401, "blocked"],
    [404, "no_page"],
    [410, "no_page"],
  ])("fails for good when the site answers %i", async (status, code) => {
    const error = await failureOf(run(site({ [url]: () => html("no", { status }) })));

    expect(error).toBeInstanceOf(PermanentImportError);
    expect(error).toMatchObject({ code });
  });

  it.each([500, 503, 429])("will try again when the site answers %i", async (status) => {
    const error = await failureOf(run(site({ [url]: () => html("later", { status }) })));

    expect(error).toBeInstanceOf(RetryableImportError);
  });

  it("will try again when the site cannot be reached", async () => {
    const error = await failureOf(run(site({})));

    expect(error).toBeInstanceOf(RetryableImportError);
  });

  it("fails for good on a link that is not a page", async () => {
    const fetcher = site({
      [url]: () => new Response("%PDF-1.7", { headers: { "Content-Type": "application/pdf" } }),
    });

    expect(await failureOf(run(fetcher))).toMatchObject({ code: "not_a_page" });
  });

  it("stops reading a page that is too large, whether or not it says how large it is", async () => {
    const huge = `<html><body>${"x".repeat(3 * 1024 * 1024 + 10)}</body></html>`;
    // A stream has no length to state, so the reader has to count.
    const unsaid = site({
      [url]: () =>
        new Response(new Response(huge).body, { headers: { "Content-Type": "text/html" } }),
    });
    const said = site({
      [url]: () => html("<html></html>", { headers: { "Content-Length": "99999999" } }),
    });

    expect(await failureOf(run(unsaid))).toMatchObject({ code: "too_large" });
    expect(await failureOf(run(said))).toMatchObject({ code: "too_large" });
  });

  it("asks for a page as a browser does, and follows no redirect by itself", async () => {
    const fetcher = site({ [url]: () => html(plainPage) });

    await run(fetcher);

    const init = fetcher.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("User-Agent")).toMatch(/^Mozilla\/5\.0 \(Windows NT .*Chrome\/\d+/);
    expect(headers.get("Accept")).toContain("text/html");
    expect(headers.get("Accept-Language")).toContain("en");
    expect(init?.redirect).toBe("manual");
  });

  it("asks once for a page it is refused: a refusal is not tried again", async () => {
    const fetcher = site({ [url]: () => html("no", { status: 403 }) });

    const error = await failureOf(run(fetcher));

    expect(error).toBeInstanceOf(PermanentImportError);
    expect(error).toMatchObject({ message: "The site does not let apps read its pages." });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("the small readers", () => {
  it("reads a yield as servings or as an amount of something", () => {
    const none = { servings: null, yieldQuantity: null, yieldUnit: null };
    expect(readYield("4")).toEqual({ ...none, servings: 4 });
    expect(readYield(6)).toEqual({ ...none, servings: 6 });
    expect(readYield("4 servings")).toEqual({ ...none, servings: 4 });
    expect(readYield("Serves 4-6")).toEqual({ ...none, servings: 4 });
    expect(readYield("4 to 6 servings")).toEqual({ ...none, servings: 4 });
    expect(readYield(["8", "8 people"])).toEqual({ ...none, servings: 8 });
    expect(readYield("Makes 24 cookies")).toEqual({
      servings: null,
      yieldQuantity: 24,
      yieldUnit: "cookies",
    });
    expect(readYield("1 loaf")).toEqual({ servings: null, yieldQuantity: 1, yieldUnit: "loaf" });
    // Words with no number say nothing the app can use.
    expect(readYield("a crowd")).toEqual(none);
    expect(readYield(undefined)).toEqual(none);
    expect(readYield("0 servings")).toEqual(none);
  });

  it("reads instructions written as plain strings", () => {
    expect(readInstructions(["Mix.", " ", "Bake."])).toEqual([
      { title: null, steps: [{ text: "Mix." }, { text: "Bake." }] },
    ]);
    expect(readInstructions(undefined)).toEqual([]);
  });

  it("keeps loose steps around a section in their place", () => {
    const sections = readInstructions([
      "Heat the oven.",
      { "@type": "HowToSection", name: "Dough", itemListElement: ["Knead.", "Rest."] },
      { "@type": "HowToStep", text: "Bake." },
    ]);

    expect(sections.map((section) => [section.title, section.steps.length])).toEqual([
      [null, 1],
      ["Dough", 2],
      [null, 1],
    ]);
  });

  it("takes tags and entities out of text, and nothing else", () => {
    expect(plainText("<p>Salt &amp; pepper</p>")).toBe("Salt & pepper");
    expect(plainText("350&deg;F for 5&nbsp;minutes")).toBe("350°F for 5 minutes");
    expect(plainText("it&#39;s &#x26; done")).toBe("it's & done");
    expect(plainText("a  b\t\tc")).toBe("a b c");
    expect(plainText({ not: "text" })).toBe("");
    expect(plainText("&unknown; stays")).toBe("&unknown; stays");
  });

  it("finds nothing in blocks that describe no recipe", () => {
    expect(findRecipe(["{", JSON.stringify({ "@type": "Article" }), "[]", "null"])).toBeNull();
  });
});

describe("an import from a link, from the queue to a saved recipe", () => {
  const api = signedIn(env, fixtureMember.email ?? "");
  const lists = { units: fixtureUnits, foods: fixtureFoods, organizers: fixtureOrganizers };

  /** A job taken through the registered handler with the page served locally. */
  async function imported(url: string, body = plainPage) {
    const created = await createImportJob(
      db,
      { kind: "url", sourceUrl: url, input: { url } },
      fixtureMember.id,
    );
    const outcome = await runImportJob(created.id, IMPORT_HANDLERS, {
      fetch: site({ [url]: () => html(body) }),
      env,
    });
    expect(outcome).toEqual({ ack: true });
    const job = await loadImportJob(db, created.id);
    if (!job?.result) {
      throw new Error("the import has no result");
    }
    return { job, draft: job.result.draft };
  }

  const inputFrom = (draft: RecipeDraft, title?: string): RecipeInput => {
    const input = draftToInput(draft, lists).input;
    return { ...input, title: title ?? input.title } as RecipeInput;
  };

  it("lands in review, with its ingredient lines read when it becomes the editor's value", async () => {
    const { job, draft } = await imported("https://kitchen.example.com/corn-cakes");

    expect(job.status).toBe("needs_review");
    expect(job.result?.issues).toEqual([]);
    const lines = draftToInput(draft, lists).input.ingredientSections?.[0]?.items ?? [];
    const flour = lines.find((line) => line.originalText === "1/2 cup flour");
    // The household has flour and cups, so the line is read; the text stays as written.
    expect(flour).toMatchObject({ quantity: 0.5 });
    expect(flour?.foodId).not.toBeNull();
    expect(flour?.unitId).not.toBeNull();
  });

  it("fails with a code the list explains when the page has no recipe", async () => {
    const url = "https://kitchen.example.com/plums";
    const created = await createImportJob(
      db,
      { kind: "url", sourceUrl: url, input: { url } },
      fixtureMember.id,
    );

    await runImportJob(created.id, IMPORT_HANDLERS, {
      fetch: site({ [url]: () => html(articlePage) }),
      env,
    });

    expect(await loadImportJob(db, created.id)).toMatchObject({
      status: "failed",
      error: { code: "no_recipe" },
    });
  });

  it("becomes a recipe when it is saved, and the job is completed in the same save", async () => {
    const { job, draft } = await imported("https://kitchen.example.com/saved?utm_source=mail");

    const response = await api.post("/recipes", { ...inputFrom(draft), importJobId: job.id });

    expect(response.status).toBe(201);
    const recipe = Recipe.parse(await response.json());
    expect(recipe).toMatchObject({
      title: "Skillet Corn Cakes",
      sourceName: "Odalys Brandt",
      sourceUrl: "https://kitchen.example.com/saved",
    });
    expect(await loadImportJob(db, job.id)).toMatchObject({
      status: "completed",
      recipeId: recipe.id,
    });
    // A saved import is no longer among those waiting for a person.
    const open = ImportListResponse.parse(await (await api.get("/imports")).json());
    expect(open.items.map((item) => item.id)).not.toContain(job.id);
  });

  it("confirms an import within the save's two round trips", async () => {
    const { job, draft } = await imported("https://kitchen.example.com/counted");
    const counted = countingDatabase(db);

    const result = await createRecipe(
      counted.db,
      inputFrom(draft, "Counted Corn Cakes"),
      fixtureMember.id,
      job.id,
    );

    expect(result.ok).toBe(true);
    expect(counted.counts()).toEqual({ batches: 2, statementsOutsideABatch: 0 });
  });

  it("refuses to save an import twice, or one that is not ready, and saves nothing", async () => {
    const { job, draft } = await imported("https://kitchen.example.com/twice");
    const body = { ...inputFrom(draft, "Saved Once Only"), importJobId: job.id };
    expect((await api.post("/recipes", body)).status).toBe(201);

    const again = await api.post("/recipes", { ...body, title: "Saved Twice" });

    expect(again.status).toBe(400);
    const error = (await again.json()) as { error: { issues?: { path: unknown[] }[] } };
    expect(error.error.issues?.[0]?.path).toEqual(["importJobId"]);
    expect((await api.get("/recipes/saved-twice")).status).toBe(404);

    const waiting = await createImportJob(
      db,
      { kind: "url", sourceUrl: "https://kitchen.example.com/waiting", input: {} },
      fixtureMember.id,
    );
    const early = await api.post("/recipes", {
      ...body,
      title: "Too Early",
      importJobId: waiting.id,
    });
    expect(early.status).toBe(400);
    expect((await loadImportJob(db, waiting.id))?.status).toBe("queued");
  });

  it("says when the household already has a recipe from the same link", async () => {
    const url = "https://kitchen.example.com/again";
    const first = await imported(url);
    expect(
      ImportDetail.parse(await (await api.get(`/imports/${first.job.id}`)).json()).duplicate,
    ).toBeNull();
    const saved = await api.post("/recipes", {
      ...inputFrom(first.draft, "Corn Cakes The First"),
      importJobId: first.job.id,
    });
    expect(saved.status).toBe(201);

    // The same page again, with the tracking a shared link picks up.
    const second = await imported(`${url}?utm_campaign=newsletter#comments`);
    const detail = ImportDetail.parse(await (await api.get(`/imports/${second.job.id}`)).json());

    expect(detail.duplicate).toEqual({
      slug: "corn-cakes-the-first",
      title: "Corn Cakes The First",
    });
    // It warns and does not refuse: the import can still be saved.
    const other = await api.post("/recipes", {
      ...inputFrom(second.draft, "Corn Cakes The Second"),
      importJobId: second.job.id,
    });
    expect(other.status).toBe(201);
  });

  it("starts from the app with a link, and is handled by the registered handler", async () => {
    const response = await api.post("/imports", {
      kind: "url",
      url: "https://kitchen.example.com/from-the-app",
    });

    expect(response.status).toBe(202);
    expect(ImportJob.parse(await response.json()).status).toBe("queued");
    expect(IMPORT_HANDLERS.url).toBe(importFromUrl);
  });
});
