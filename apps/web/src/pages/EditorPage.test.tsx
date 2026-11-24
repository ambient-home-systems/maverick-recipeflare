import { newId, type Recipe, RecipeInput, slugify } from "@recipeflare/schema";
import {
  fixtureFoods,
  fixtureMember,
  fixtureOrganizers,
  fixtureRecipes,
  fixtureUnits,
} from "@recipeflare/schema/fixtures";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-utils";

afterEach(() => {
  cleanup();
});

const NOW = "2026-11-23T09:00:00.000Z";
const CHICKEN: Recipe = (() => {
  const found = fixtureRecipes.find(
    (recipe) => recipe.slug === "roast-chicken-with-lemon-and-thyme",
  );
  if (!found) {
    throw new Error("the chicken fixture is missing");
  }
  return found;
})();
if (!CHICKEN) {
  throw new Error("the chicken fixture is missing");
}

type Call = { method: string; path: string; body: Record<string, unknown> | null };

/**
 * A stand-in for the API that behaves like it: lists that grow when something
 * is created, a name that is taken refused with who has it, recipes saved and
 * read back, and a stale save refused with the recipe as it is now.
 */
function fakeApi(seed: Recipe[] = []) {
  const units = fixtureUnits.map((unit) => ({ ...unit, recipeCount: 0 }));
  const foods = fixtureFoods.map((food) => ({ ...food, recipeCount: 0 }));
  const organizers = fixtureOrganizers.map((entry) => ({ ...entry, recipeCount: 0 }));
  const recipes = new Map(seed.map((recipe) => [recipe.id, recipe]));
  const calls: Call[] = [];
  /** Set to answer the next recipe save with something else, once. */
  const next: { save?: () => Response } = {};

  const refusal = (status: number, code: string, extra: object = {}) =>
    Response.json({ error: { code, message: code }, ...extra }, { status });

  function built(body: Record<string, unknown>, was?: Recipe): Recipe {
    const input = RecipeInput.parse(body);
    const refs = (ids: string[]) =>
      ids.flatMap((id) => {
        const entry = organizers.find((other) => other.id === id);
        return entry ? [{ id: entry.id, name: entry.name, slug: entry.slug }] : [];
      });
    return {
      id: was?.id ?? newId(),
      slug: slugify(input.title),
      version: (was?.version ?? 0) + 1,
      title: input.title,
      description: input.description,
      servings: input.servings,
      yieldQuantity: input.yieldQuantity,
      yieldUnit: input.yieldUnit,
      prepTimeSeconds: input.prepTimeSeconds,
      cookTimeSeconds: input.cookTimeSeconds,
      totalTimeSeconds: input.totalTimeSeconds,
      nutrition: input.nutrition,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      ingredientSections: input.ingredientSections.map((section) => ({
        title: section.title,
        items: section.items.map((line) => {
          const unit = units.find((entry) => entry.id === line.unitId);
          const food = foods.find((entry) => entry.id === line.foodId);
          return {
            id: line.id,
            originalText: line.originalText,
            quantity: line.quantity,
            unit: unit
              ? {
                  id: unit.id,
                  name: unit.name,
                  pluralName: unit.pluralName,
                  abbreviation: unit.abbreviation,
                  pluralAbbreviation: unit.pluralAbbreviation,
                  useAbbreviation: unit.useAbbreviation,
                  fraction: unit.fraction,
                }
              : null,
            food: food ? { id: food.id, name: food.name, pluralName: food.pluralName } : null,
            note: line.note,
          };
        }),
      })),
      stepSections: input.stepSections,
      notes: input.notes,
      categories: refs(input.categoryIds),
      tags: refs(input.tagIds),
      tools: refs(input.toolIds),
      assets: was?.assets ?? [],
      createdBy: fixtureMember.id,
      createdAt: was?.createdAt ?? NOW,
      updatedAt: NOW,
    };
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ method, path, body });

    if (method === "GET") {
      if (path === "/units") {
        return Response.json({ items: units });
      }
      if (path === "/foods") {
        return Response.json({ items: foods });
      }
      if (path === "/organizers") {
        return Response.json({ items: organizers });
      }
      if (path === "/recipes") {
        return Response.json({ items: [], page: 1, perPage: 30, total: 0, libraryTotal: 0 });
      }
      const key = decodeURIComponent(path.replace("/recipes/", ""));
      const found = [...recipes.values()].find(
        (recipe) => recipe.id === key || recipe.slug === key,
      );
      return found ? Response.json(found) : refusal(404, "not_found");
    }

    if (method === "POST" && path === "/units") {
      const taken = units.find((unit) => unit.name.toLowerCase() === body.name.toLowerCase());
      if (taken) {
        return refusal(409, "duplicate", { existingId: taken.id });
      }
      const unit = { ...units[0], ...body, id: newId(), aliases: [], abbreviation: null };
      units.push(unit);
      return Response.json(unit, { status: 201 });
    }
    if (method === "POST" && path === "/foods") {
      const taken = foods.find((food) => food.name.toLowerCase() === body.name.toLowerCase());
      if (taken) {
        return refusal(409, "duplicate", { existingId: taken.id });
      }
      const food = { ...foods[0], ...body, id: newId(), pluralName: null, aliases: [] };
      foods.push(food);
      return Response.json(food, { status: 201 });
    }
    if (method === "POST" && path === "/organizers") {
      const entry = {
        ...organizers[0],
        ...body,
        id: newId(),
        slug: slugify(body.name),
        color: null,
      };
      organizers.push(entry);
      return Response.json(entry, { status: 201 });
    }

    if (next.save) {
      const answer = next.save;
      next.save = undefined;
      return answer();
    }
    if (method === "POST" && path === "/recipes") {
      const recipe = built(body);
      recipes.set(recipe.id, recipe);
      return Response.json(recipe, { status: 201 });
    }
    if (method === "PUT") {
      const was = recipes.get(path.replace("/recipes/", ""));
      if (!was) {
        return refusal(404, "not_found");
      }
      if (body.version !== was.version) {
        return refusal(409, "version_conflict", { current: was });
      }
      const recipe = built(body, was);
      recipes.set(recipe.id, recipe);
      return Response.json(recipe);
    }
    return refusal(404, "not_found");
  });
  vi.stubGlobal("fetch", fetchMock);

  const sent = (method: string, path?: string) =>
    calls.filter((call) => call.method === method && (path === undefined || call.path === path));
  return { calls, sent, next, recipes, foods, units, organizers };
}

const sheet = (name: string | RegExp) => within(screen.getByRole("dialog", { name }));
const typeLine = (text: string) => {
  const entry = screen.getByLabelText("Add an ingredient");
  fireEvent.change(entry, { target: { value: text } });
  fireEvent.keyDown(entry, { key: "Enter" });
};
const typeStep = (text: string) => {
  const entry = screen.getByLabelText("Add a step");
  fireEvent.change(entry, { target: { value: text } });
  fireEvent.keyDown(entry, { key: "Enter" });
};
/** A row's button is named by what it does and then everything the row shows. */
const startsWith = (text: string) => (name: string) => name.startsWith(text);
const rowOf = (text: string) =>
  screen.getByRole("button", { name: startsWith(`Edit ${text}`) }).closest("li");
const read = (row: HTMLElement | null | undefined) =>
  [...(row?.querySelector("[data-testid=line-read]")?.querySelectorAll(".font-semibold") ?? [])]
    .map((part) => part.textContent)
    .join(" · ");
const title = () => screen.getByLabelText("Title") as HTMLInputElement;
const editorOpen = () => screen.findByLabelText("Title");
const foodNamed = (name: string) => fixtureFoods.find((food) => food.name === name)?.id;
const unitNamed = (name: string) => fixtureUnits.find((unit) => unit.name === name)?.id;

type SavedLine = {
  originalText: string;
  quantity: number;
  unitId: string;
  foodId: string;
  note: string;
};
const linesOf = (call: Call | undefined) =>
  ((call?.body?.ingredientSections ?? []) as { items: SavedLine[] }[]).flatMap(
    (section) => section.items,
  );

describe("typing a new recipe", () => {
  it("reads each line as it is entered, with the household's own units and foods", async () => {
    fakeApi();
    await renderAt("/recipes/new");
    await editorOpen();

    typeLine("2 T butter, melted");
    typeLine("Salt and pepper to taste");

    expect(read(rowOf("2 T butter, melted"))).toBe("2 · tablespoon · butter · melted");
    expect(rowOf("Salt and pepper to taste")?.textContent).toContain("as written");
  });

  it("saves the recipe and opens it", async () => {
    const api = fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();

    fireEvent.change(title(), { target: { value: "Garlic Butter" } });
    typeLine("2 T butter, melted");
    typeLine("3 cloves garlic");
    typeStep("Stir the garlic into the butter.");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/garlic-butter"));
    const [saved] = api.sent("POST", "/recipes");
    expect(saved?.body).toMatchObject({ title: "Garlic Butter" });
    expect(linesOf(saved)).toMatchObject([
      {
        originalText: "2 T butter, melted",
        quantity: 2,
        unitId: unitNamed("tablespoon"),
        foodId: foodNamed("butter"),
        note: "melted",
      },
      {
        originalText: "3 cloves garlic",
        quantity: 3,
        unitId: unitNamed("clove"),
        foodId: foodNamed("garlic"),
      },
    ]);
    // Nothing was created along the way: every food and unit was already the household's.
    expect(api.sent("POST").map((call) => call.path)).toEqual(["/recipes"]);
    // The recipe view shows what was saved.
    expect(await screen.findByRole("heading", { level: 1, name: "Garlic Butter" })).toBeTruthy();
  });

  it("saves each step with the time it states and the ingredients it names", async () => {
    const api = fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();
    fireEvent.change(title(), { target: { value: "Butter Toast" } });
    typeLine("2 T butter, melted");
    typeLine("Salt and pepper to taste");
    typeStep("Brush with the butter and toast for 3 minutes.");
    typeStep("Season and serve.");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/butter-toast"));

    const [saved] = api.sent("POST", "/recipes");
    const [butter] = linesOf(saved) as unknown as { id: string }[];
    const steps = (
      (saved?.body?.stepSections ?? []) as {
        steps: { durationSeconds: number | null; ingredientIds: string[] }[];
      }[]
    ).flatMap((section) => section.steps);
    expect(steps).toMatchObject([
      { durationSeconds: 180, ingredientIds: [butter?.id] },
      // No time stated and nothing named: a line kept as written has no food to go by.
      { durationSeconds: null, ingredientIds: [] },
    ]);
  });

  it("asks once before adding new foods, creates them, and points each line at its food", async () => {
    const api = fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();

    fireEvent.change(title(), { target: { value: "Quince Paste" } });
    typeLine("2 quinces, peeled");
    typeLine("1 cup sugar");
    typeLine("3 quinces");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Nothing is sent until the cook has agreed.
    const asking = sheet("Add 1 food?");
    expect(asking.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["quinces"]);
    expect(api.sent("POST")).toEqual([]);

    fireEvent.click(asking.getByRole("button", { name: "Add it and save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/quince-paste"));
    expect(api.sent("POST").map((call) => call.path)).toEqual(["/foods", "/recipes"]);
    expect(api.sent("POST", "/foods")[0]?.body).toEqual({ name: "quinces" });
    const quince = api.foods.find((food) => food.name === "quinces");
    const [first, sugar] = linesOf(api.sent("POST", "/recipes")[0]);
    expect(first).toMatchObject({ quantity: 2, foodId: quince?.id, note: "peeled" });
    expect(sugar).toMatchObject({ foodId: foodNamed("sugar") });
  });

  it("uses the food that already has the name when another device added it meanwhile", async () => {
    const api = fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();
    fireEvent.change(title(), { target: { value: "Parsnip Soup" } });
    typeLine("4 parsnips");
    // While this recipe was being typed, someone else added the food.
    api.foods.push({ ...api.foods[0], id: newId(), name: "Parsnips", aliases: [] } as never);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(sheet("Add 1 food?").getByRole("button", { name: "Add it and save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/parsnip-soup"));
    const theirs = api.foods.find((food) => food.name === "Parsnips");
    expect(linesOf(api.sent("POST", "/recipes")[0])[0]?.foodId).toBe(theirs?.id);
    expect(api.foods.filter((food) => food.name.toLowerCase() === "parsnips")).toHaveLength(1);
  });

  it("creates a unit and a tag made in their pickers only when the recipe is saved", async () => {
    const api = fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();
    fireEvent.change(title(), { target: { value: "Trail Mix" } });
    typeLine("2 cups nuts");

    // A unit the household lacks, made from the unit picker of an open line.
    fireEvent.click(screen.getByRole("button", { name: startsWith("Edit 2 cups nuts") }));
    fireEvent.click(screen.getByRole("button", { name: /^Unit\b/ }));
    fireEvent.change(sheet("Unit").getByLabelText("Find a unit"), { target: { value: "handful" } });
    fireEvent.click(sheet("Unit").getByRole("button", { name: "Create the unit “handful”" }));
    expect(screen.getByRole("button", { name: /^Unit\b/ }).textContent).toBe("handful");

    // A tag made in place.
    fireEvent.click(screen.getByRole("button", { name: "Choose tags" }));
    fireEvent.change(sheet("Tags").getByLabelText("Find a tag"), { target: { value: "Hiking" } });
    fireEvent.click(sheet("Tags").getByRole("button", { name: "Create the tag “Hiking”" }));
    fireEvent.click(sheet("Tags").getByRole("button", { name: "Done" }));

    // Neither exists on the server yet: abandoning the recipe would leave nothing behind.
    expect(api.sent("POST")).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/trail-mix"));
    expect(api.sent("POST").map((call) => call.path)).toEqual([
      "/units",
      "/organizers",
      "/recipes",
    ]);
    expect(api.sent("POST", "/organizers")[0]?.body).toEqual({ kind: "tag", name: "Hiking" });
    const handful = api.units.find((unit) => unit.name === "handful");
    const hiking = api.organizers.find((entry) => entry.name === "Hiking");
    const saved = api.sent("POST", "/recipes")[0];
    // The recipe is saved with the IDs the server gave, not the editor's own.
    expect(linesOf(saved)[0]?.unitId).toBe(handful?.id);
    expect(saved?.body?.tagIds).toEqual([hiking?.id]);
  });

  it("reads later lines with a unit made in the picker", async () => {
    fakeApi();
    await renderAt("/recipes/new");
    await editorOpen();
    typeLine("2 cups nuts");
    fireEvent.click(screen.getByRole("button", { name: startsWith("Edit 2 cups nuts") }));
    fireEvent.click(screen.getByRole("button", { name: /^Unit\b/ }));
    fireEvent.change(sheet("Unit").getByLabelText("Find a unit"), { target: { value: "handful" } });
    fireEvent.click(sheet("Unit").getByRole("button", { name: "Create the unit “handful”" }));

    typeLine("1 handful nuts");

    expect(read(rowOf("1 handful nuts"))).toBe("1 · handful · nuts");
  });

  it("refuses to save without a title, marks the field, and sends nothing", async () => {
    const api = fakeApi();
    await renderAt("/recipes/new");
    await editorOpen();
    typeLine("1 egg");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert").textContent).toContain("One thing needs fixing");
    expect(title().getAttribute("aria-invalid")).toBe("true");
    expect(api.sent("POST")).toEqual([]);
  });

  it("says so when the save does not go through, keeps what was typed, and saves on a second try", async () => {
    const api = fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();
    fireEvent.change(title(), { target: { value: "Stubborn Stew" } });
    api.next.save = () =>
      Response.json({ error: { code: "internal_error", message: "No" } }, { status: 500 });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("alert")).textContent).toContain("was not saved");
    expect(title().value).toBe("Stubborn Stew");
    expect(router.state.location.pathname).toBe("/recipes/new");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/stubborn-stew"));
  });

  it("has a place for photos, for the original card and for other files", async () => {
    fakeApi();
    await renderAt("/recipes/new");
    await editorOpen();

    expect(screen.getByText("Photos and files")).toBeTruthy();
    expect(screen.getByLabelText("Add photos")).toBeTruthy();
    expect(screen.getByLabelText("Add the card")).toBeTruthy();
    expect(screen.getByLabelText("Add files")).toBeTruthy();
  });
});

describe("reading a line with AI", () => {
  /** Answers the editor's question about a line, in front of the rest of the API. */
  function aiAnswers(answer: (lines: string[]) => Response | Promise<Response>) {
    const rest = globalThis.fetch;
    const asked: string[][] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(input), "http://localhost").pathname === "/api/v1/ai/ingredients") {
        const { lines } = JSON.parse(String(init?.body)) as { lines: string[] };
        asked.push(lines);
        return answer(lines);
      }
      return rest(input, init);
    });
    return asked;
  }
  const ask = async (line: string) => {
    await renderAt("/recipes/new");
    await editorOpen();
    typeLine(line);
    fireEvent.click(screen.getByRole("button", { name: startsWith(`Edit ${line}`) }));
    fireEvent.click(screen.getByRole("button", { name: "Read with AI" }));
  };

  it("sends the line, and matches what comes back to the household's own foods and units", async () => {
    fakeApi();
    const asked = aiAnswers(() =>
      Response.json({
        lines: [{ quantity: 2, unitName: null, foodName: "lemons", note: "Juice of" }],
      }),
    );
    await ask("Juice of 2 lemons");

    expect(await screen.findByText(/^Read by AI\./)).toBeTruthy();
    expect(asked).toEqual([["Juice of 2 lemons"]]);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    // "lemons" is the household's lemon; nothing was created to say so.
    expect(read(rowOf("Juice of 2 lemons"))).toBe("2 · lemon · Juice of");
  });

  it("carries a food the household lacks as a new food, to be confirmed at save", async () => {
    const api = fakeApi();
    aiAnswers(() =>
      Response.json({
        lines: [{ quantity: 1, unitName: null, foodName: "quince", note: "Zest of" }],
      }),
    );
    await ask("Zest of 1 quince");
    await screen.findByText(/^Read by AI\./);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(read(rowOf("Zest of 1 quince"))).toBe("1 · quince · new · Zest of");
    expect(api.sent("POST", "/foods")).toEqual([]);
  });

  it("says so when the model had nothing to add", async () => {
    fakeApi();
    aiAnswers(() => Response.json({ lines: [null] }));
    await ask("Salt and pepper to taste");

    expect(
      await screen.findByText("AI could not read any more from this line. It stays as written."),
    ).toBeTruthy();
  });

  it.each([
    [503, "ai_unavailable", "The AI could not be reached. Try again later."],
    [429, "ai_limit", "The allowance for AI is used up for now. Try again later."],
    [502, "ai_setup", "The line could not be read with AI."],
  ])("says what went wrong when the answer is %i %s", async (status, code, words) => {
    fakeApi();
    aiAnswers(() => Response.json({ error: { code, message: code } }, { status }));
    await ask("Juice of 2 lemons");

    expect((await screen.findByRole("alert")).textContent).toBe(words);
    // The line is as it was, and can be asked about again.
    expect(screen.getByRole("button", { name: "Read with AI" })).toBeTruthy();
  });

  it("says it needs a connection when there is none", async () => {
    fakeApi();
    aiAnswers(() => {
      throw new TypeError("Failed to fetch");
    });
    await ask("Juice of 2 lemons");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Reading with AI needs a connection.",
    );
  });
});

describe("leaving the editor", () => {
  it("goes at once when nothing was typed", async () => {
    fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("asks first when Cancel is pressed with something typed", async () => {
    fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();
    fireEvent.change(title(), { target: { value: "Half typed" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(sheet("Leave without saving?").getByRole("button", { name: "Keep editing" }));

    expect(router.state.location.pathname).toBe("/recipes/new");
    expect(title().value).toBe("Half typed");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      sheet("Leave without saving?").getByRole("button", { name: "Discard changes" }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("asks first when the cook goes somewhere else by the navigation", async () => {
    fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();
    fireEvent.change(title(), { target: { value: "Half typed" } });

    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", {
        name: "Manage",
      }),
    );

    // Still in the editor, with the question up.
    const asking = await screen.findByRole("dialog", { name: "Leave without saving?" });
    expect(router.state.location.pathname).toBe("/recipes/new");

    fireEvent.click(within(asking).getByRole("button", { name: "Keep editing" }));
    expect(router.state.location.pathname).toBe("/recipes/new");
    expect(title().value).toBe("Half typed");
    // The router lets go of the first attempt a moment later; nobody presses again that fast.
    await new Promise((resolve) => setTimeout(resolve, 50));

    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", {
        name: "Manage",
      }),
    );
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Leave without saving?" })).getByRole(
        "button",
        { name: "Discard changes" },
      ),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/manage"));
  });

  it("does not ask after a save", async () => {
    fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();
    fireEvent.change(title(), { target: { value: "Saved And Gone" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/saved-and-gone"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("editing a recipe", () => {
  const EDIT = `/recipes/${CHICKEN.slug}/edit`;

  it("opens on the recipe as it is saved, sections and notes and organizers and all", async () => {
    fakeApi([CHICKEN]);
    await renderAt(EDIT);
    await editorOpen();

    expect(screen.getByRole("heading", { level: 1, name: "Edit recipe" })).toBeTruthy();
    expect(title().value).toBe(CHICKEN.title);
    const lines = CHICKEN.ingredientSections.flatMap((section) => section.items);
    expect(
      within(screen.getByRole("list", { name: "Ingredient lines" })).getAllByRole("listitem")
        .length,
    ).toBeGreaterThanOrEqual(lines.length);
    for (const tag of CHICKEN.tags) {
      expect(screen.getByRole("button", { name: `Remove the tag ${tag.name}` })).toBeTruthy();
    }
  });

  it("saves over the copy it loaded and goes back to the recipe, at its new address if the title changed", async () => {
    const api = fakeApi([CHICKEN]);
    const { router } = await renderAt(EDIT);
    await editorOpen();

    fireEvent.change(title(), { target: { value: "Sunday Roast Chicken" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/recipes/sunday-roast-chicken"),
    );
    const [saved] = api.sent("PUT");
    expect(saved?.path).toBe(`/recipes/${CHICKEN.id}`);
    expect(saved?.body).toMatchObject({ title: "Sunday Roast Chicken", version: CHICKEN.version });
    // Every line, step and note kept its ID through the edit.
    expect(linesOf(saved).map((line) => (line as unknown as { id: string }).id)).toEqual(
      CHICKEN.ingredientSections.flatMap((section) => section.items.map((item) => item.id)),
    );
  });

  type SavedStep = {
    id: string;
    text: string;
    durationSeconds: number | null;
    ingredientIds: string[];
  };
  const stepsOf = (call: Call | undefined) =>
    ((call?.body?.stepSections ?? []) as { steps: SavedStep[] }[]).flatMap(
      (section) => section.steps,
    );
  /** The recipe as it was typed before steps said anything of themselves. */
  const BEFORE: Recipe = {
    ...CHICKEN,
    stepSections: CHICKEN.stepSections.map((section) => ({
      ...section,
      steps: section.steps.map((step) => ({ ...step, durationSeconds: null, ingredientIds: [] })),
    })),
  };

  it("leaves the steps of an older recipe as they are until one is edited", async () => {
    const api = fakeApi([BEFORE]);
    const { router } = await renderAt(EDIT);
    await editorOpen();

    // Something else is changed and saved: no step gains a time or an ingredient.
    fireEvent.change(title(), { target: { value: "Sunday Roast Chicken" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/recipes/sunday-roast-chicken"),
    );

    expect(
      stepsOf(api.sent("PUT")[0]).map((step) => [step.durationSeconds, step.ingredientIds]),
    ).toEqual(BEFORE.stepSections.flatMap((section) => section.steps.map(() => [null, []])));
  });

  it("reads a step when its words are edited, and only that step", async () => {
    const api = fakeApi([BEFORE]);
    const { router } = await renderAt(EDIT);
    await editorOpen();

    fireEvent.click(
      screen.getAllByRole("button", { name: startsWith("Edit step 4:") })[0] as Element,
    );
    fireEvent.change(screen.getByLabelText("Step 4"), {
      target: { value: "Move the chicken to a board and rest it for 20 minutes." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/recipes/${CHICKEN.slug}`));

    const saved = stepsOf(api.sent("PUT")[0]);
    expect(saved[3]).toMatchObject({ durationSeconds: 1200, ingredientIds: [] });
    expect(saved.filter((step) => step.durationSeconds !== null)).toHaveLength(1);
    expect(saved.every((step, index) => index === 3 || step.ingredientIds.length === 0)).toBe(true);
  });

  it("goes back to the recipe on Cancel", async () => {
    fakeApi([CHICKEN]);
    const { router } = await renderAt(EDIT);
    await editorOpen();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/recipes/${CHICKEN.slug}`));
  });

  it("says so when the address leads to no recipe", async () => {
    fakeApi();
    await renderAt("/recipes/no-such-recipe/edit");

    expect(await screen.findByRole("heading", { name: "This recipe is not here" })).toBeTruthy();
  });
});

describe("a recipe changed on another device while it was being edited", () => {
  const EDIT = `/recipes/${CHICKEN.slug}/edit`;

  /** Opens the editor, lets another device save, then saves here. */
  async function conflicted() {
    const api = fakeApi([CHICKEN]);
    const rendered = await renderAt(EDIT);
    await editorOpen();
    fireEvent.change(title(), { target: { value: "Mine" } });
    const theirs = { ...CHICKEN, title: "Theirs", version: CHICKEN.version + 1 };
    api.recipes.set(CHICKEN.id, theirs);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("dialog", { name: "Changed on another device" });
    return { api, theirs, ...rendered };
  }

  it("is shown, and nothing is overwritten without a choice", async () => {
    const { api, theirs, router } = await conflicted();

    expect(api.sent("PUT")).toHaveLength(1);
    expect(api.recipes.get(CHICKEN.id)).toEqual(theirs);
    expect(router.state.location.pathname).toBe(EDIT);
    expect(title().value).toBe("Mine");
  });

  it("can be saved over, knowingly, from the newer copy", async () => {
    const { api, theirs, router } = await conflicted();

    fireEvent.click(
      sheet("Changed on another device").getByRole("button", { name: "Save over it" }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/mine"));
    expect(api.sent("PUT").map((call) => call.body?.version)).toEqual([
      CHICKEN.version,
      theirs.version,
    ]);
    expect(api.recipes.get(CHICKEN.id)?.title).toBe("Mine");
  });

  it("can be reloaded, which takes their changes and lets go of what was typed", async () => {
    const { api, router } = await conflicted();

    fireEvent.click(sheet("Changed on another device").getByRole("button", { name: "Reload it" }));

    await waitFor(() => expect(title().value).toBe("Theirs"));
    expect(router.state.location.pathname).toBe(EDIT);
    expect(api.sent("PUT")).toHaveLength(1);

    // A save from here is made from their version, so it goes through.
    fireEvent.change(title(), { target: { value: "Ours" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/ours"));
  });

  it("can be left for later: the editor stays as it was, and asks again at the next save", async () => {
    const { api } = await conflicted();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("dialog", { name: "Changed on another device" });
    expect(api.recipes.get(CHICKEN.id)?.title).toBe("Theirs");
  });
});

describe("getting to the editor", () => {
  it("starts from Add, which offers typing beside importing from a link", async () => {
    fakeApi();
    const { router } = await renderAt("/add");

    expect(screen.getByRole("heading", { name: "From a link" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Type a recipe" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/new"));
    expect(await screen.findByRole("heading", { level: 1, name: "New recipe" })).toBeTruthy();
  });

  it("says so when the lists the editor needs cannot be loaded, and opens when they can", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "internal_error", message: "No" } }, { status: 500 }),
      ),
    );
    await renderAt("/recipes/new");

    expect(
      await screen.findByRole("heading", { name: "Could not load what the editor needs" }),
    ).toBeTruthy();

    fakeApi();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await editorOpen()).toBeTruthy();
  });
});
