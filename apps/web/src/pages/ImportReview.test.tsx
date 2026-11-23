import { type Asset, type ImportJob, newId, type Recipe, slugify } from "@recipeflare/schema";
import {
  fixtureFoods,
  fixtureOrganizers,
  fixtureRecipes,
  fixtureUnits,
  importNeedsReview,
  importPastedText,
  importRunning,
  pastedLemonBars,
} from "@recipeflare/schema/fixtures";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeSentPage } from "../api/sentPage";
import { renderAt } from "../test-utils";

afterEach(() => {
  cleanup();
});

const BASE: Recipe = (() => {
  const found = fixtureRecipes[0];
  if (!found) {
    throw new Error("there are no fixture recipes");
  }
  return found;
})();

type Call = { method: string; path: string; body: Record<string, unknown> | null };

/**
 * A stand-in for the API with imports in it: the lists the editor needs, the
 * imports waiting for a person, and recipes saved from them. Saving a recipe
 * with an import's ID completes that import, as the server does.
 */
function fakeApi(
  options: {
    jobs?: ImportJob[];
    duplicate?: { slug: string; title: string };
    assets?: Asset[];
    refuseStart?: boolean;
    refuseDiscard?: boolean;
  } = {},
) {
  const jobs = new Map((options.jobs ?? [importNeedsReview]).map((job) => [job.id, job]));
  const recipes = new Map<string, Recipe>();
  const calls: Call[] = [];
  const refusal = (status: number, code: string) =>
    Response.json({ error: { code, message: code } }, { status });
  const list = (items: unknown[]) => Response.json({ items });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ method, path, body });

    if (method === "GET") {
      switch (path) {
        case "/units":
          return list(fixtureUnits.map((unit) => ({ ...unit, recipeCount: 0 })));
        case "/foods":
          return list(fixtureFoods.map((food) => ({ ...food, recipeCount: 0 })));
        case "/organizers":
          return list(fixtureOrganizers.map((entry) => ({ ...entry, recipeCount: 0 })));
        case "/recipes":
          return Response.json({ items: [], page: 1, perPage: 30, total: 0, libraryTotal: 0 });
        case "/imports":
          return list([...jobs.values()].filter((job) => job.status !== "completed"));
      }
      if (path.startsWith("/imports/")) {
        const job = jobs.get(path.replace("/imports/", ""));
        return job
          ? Response.json({
              ...job,
              duplicate: options.duplicate ?? null,
              assets: options.assets ?? [],
            })
          : refusal(404, "not_found");
      }
      const slug = decodeURIComponent(path.replace("/recipes/", ""));
      const found = [...recipes.values()].find((recipe) => recipe.slug === slug);
      return found ? Response.json(found) : refusal(404, "not_found");
    }
    if (method === "POST" && path === "/imports") {
      if (options.refuseStart) {
        return refusal(500, "internal");
      }
      const job: ImportJob = {
        ...importRunning,
        id: newId(),
        status: "queued",
        stage: null,
        ...(body.kind === "text"
          ? { kind: "text" as const, sourceUrl: null }
          : { sourceUrl: String(body.url) }),
      };
      jobs.set(job.id, job);
      return Response.json(job, { status: 202 });
    }
    if (method === "DELETE" && path.startsWith("/imports/")) {
      if (options.refuseDiscard) {
        return refusal(500, "internal");
      }
      return jobs.delete(path.replace("/imports/", ""))
        ? new Response(null, { status: 204 })
        : refusal(404, "not_found");
    }
    if (method === "POST" && path === "/recipes") {
      const recipe: Recipe = {
        ...BASE,
        id: newId(),
        title: String(body.title),
        slug: slugify(String(body.title)),
      };
      recipes.set(recipe.id, recipe);
      const job = typeof body.importJobId === "string" ? jobs.get(body.importJobId) : undefined;
      if (job) {
        jobs.set(job.id, { ...job, status: "completed", recipeId: recipe.id });
      }
      return Response.json(recipe, { status: 201 });
    }
    if (method === "POST" && path === "/foods") {
      return Response.json(
        { ...fixtureFoods[0], id: newId(), name: body.name, recipeCount: 0 },
        { status: 201 },
      );
    }
    return refusal(404, "not_found");
  });
  vi.stubGlobal("fetch", fetchMock);

  const sent = (method: string, path?: string) =>
    calls.filter((call) => call.method === method && (path === undefined || call.path === path));
  return { calls, sent, jobs, recipes };
}

const REVIEW = `/imports/${importNeedsReview.id}/review`;
const sheet = (name: string | RegExp) => within(screen.getByRole("dialog", { name }));
const reviewOpen = async () => {
  await screen.findByRole("heading", { level: 1, name: "Review import" });
  return (await screen.findByLabelText("Title")) as HTMLInputElement;
};
const addStep = (text: string) => {
  const entry = screen.getByLabelText("Add a step");
  fireEvent.change(entry, { target: { value: text } });
  fireEvent.keyDown(entry, { key: "Enter" });
};

describe("starting an import from Add", () => {
  it("hands the link to the server and shows the import on the list", async () => {
    const api = fakeApi({ jobs: [] });
    const { router } = await renderAt("/add");

    fireEvent.change(await screen.findByLabelText("Recipe page address"), {
      target: { value: " https://recipes.example.com/plum-cake " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(api.sent("POST", "/imports")[0]?.body).toEqual({
      kind: "url",
      url: "https://recipes.example.com/plum-cake",
    });
    const imports = await screen.findByRole("list", { name: "Imports" });
    expect(imports.textContent).toContain("recipes.example.com");
    expect(imports.textContent).toContain("Waiting to start");
  });

  it("does not ask the server about something that is not a link", async () => {
    const api = fakeApi({ jobs: [] });
    await renderAt("/add");

    fireEvent.change(await screen.findByLabelText("Recipe page address"), {
      target: { value: "plum cake" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/does not look like a web address/)).toBeTruthy();
    expect(api.sent("POST")).toEqual([]);
  });

  it("says so when the import could not be started, and keeps the link", async () => {
    fakeApi({ jobs: [], refuseStart: true });
    const { router } = await renderAt("/add");
    const box = (await screen.findByLabelText("Recipe page address")) as HTMLInputElement;

    fireEvent.change(box, { target: { value: "https://recipes.example.com/plum-cake" } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("The import could not be started. Try again.")).toBeTruthy();
    expect(box.value).toBe("https://recipes.example.com/plum-cake");
    expect(router.state.location.pathname).toBe("/add");
  });
});

describe("starting an import from pasted text", () => {
  it("hands the text to the server and shows the import on the list, being written up", async () => {
    const api = fakeApi({ jobs: [] });
    const { router } = await renderAt("/add");

    fireEvent.change(await screen.findByLabelText("Recipe text"), {
      target: { value: `\n${pastedLemonBars}\n` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import text" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(api.sent("POST", "/imports")[0]?.body).toEqual({ kind: "text", text: pastedLemonBars });
    const imports = await screen.findByRole("list", { name: "Imports" });
    expect(imports.textContent).toContain("Pasted text");
    expect(imports.textContent).toContain("Waiting to start");
  });

  it("does not ask the server when nothing was pasted", async () => {
    const api = fakeApi({ jobs: [] });
    await renderAt("/add");

    fireEvent.click(await screen.findByRole("button", { name: "Import text" }));

    expect(await screen.findByText("Paste a recipe's text first.")).toBeTruthy();
    expect(api.sent("POST")).toEqual([]);
  });

  it("does not send more text than can be read at once", async () => {
    const api = fakeApi({ jobs: [] });
    await renderAt("/add");

    fireEvent.change(await screen.findByLabelText("Recipe text"), {
      target: { value: "flour ".repeat(9000) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import text" }));

    expect(await screen.findByText(/more text than can be read at once/)).toBeTruthy();
    expect(api.sent("POST")).toEqual([]);
  });

  it("says so under the text, not under the link, when the import could not be started", async () => {
    fakeApi({ jobs: [], refuseStart: true });
    await renderAt("/add");
    const box = (await screen.findByLabelText("Recipe text")) as HTMLTextAreaElement;

    fireEvent.change(box, { target: { value: pastedLemonBars } });
    fireEvent.click(screen.getByRole("button", { name: "Import text" }));

    const problem = await screen.findByText("The import could not be started. Try again.");
    expect(box.getAttribute("aria-describedby")).toBe(problem.closest("[id]")?.id);
    expect(screen.getByLabelText("Recipe page address").getAttribute("aria-invalid")).toBeNull();
    expect(box.value).toBe(pastedLemonBars);
  });
});

describe("an import being written up from text", () => {
  it("says so on its row", async () => {
    fakeApi({
      jobs: [{ ...importRunning, kind: "text", sourceUrl: null, stage: null }],
    });
    await renderAt("/");

    const imports = await screen.findByRole("list", { name: "Imports" });
    expect(imports.textContent).toContain("Pasted text");
    expect(imports.textContent).toContain("Writing it up");
  });

  it("says why there was nothing to make a recipe from", async () => {
    fakeApi({
      jobs: [
        {
          ...importRunning,
          kind: "text",
          sourceUrl: null,
          stage: null,
          status: "failed",
          error: { code: "too_thin", message: "There was not enough there to make a recipe from." },
        },
      ],
    });
    await renderAt("/");

    const imports = await screen.findByRole("list", { name: "Imports" });
    expect(imports.textContent).toContain("There was not enough there to make a recipe from.");
    expect(within(imports).getByRole("button", { name: "Remove" })).toBeTruthy();
  });
});

describe("reviewing an import an AI model wrote up from pasted text", () => {
  const PASTED = `/imports/${importPastedText.id}/review`;

  it("says a model wrote it, and lists what the model was unsure of", async () => {
    fakeApi({ jobs: [importPastedText] });
    await renderAt(PASTED);

    expect((await reviewOpen()).value).toBe("Lemon Bars");
    expect(screen.getByText(/Written up by AI from/).textContent).toContain(
      "Written up by AI from pasted text. Check it against the original: it can misread.",
    );
    // Among whatever else there is to check, such as foods the household does not have.
    expect(screen.getByRole("heading", { name: /things to check$/ })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: '1/2 tsp baking powder: Has a word that is not in the text: "powder".',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Step 4: The text does not say how long to bake the second time.",
      }),
    ).toBeTruthy();
  });

  it("marks the line and the step in doubt, and not the steps that are not", async () => {
    fakeApi({ jobs: [importPastedText] });
    await renderAt(PASTED);
    await reviewOpen();

    const marked = screen
      .getAllByText("check")
      .map((mark) => mark.closest("button")?.textContent ?? "")
      .filter((text) => text !== "");
    expect(marked.some((text) => text.includes("baking powder"))).toBe(true);
    expect(marked.filter((text) => text.includes("Edit step"))).toHaveLength(1);
    expect(marked.find((text) => text.includes("Edit step"))).toContain("Bake again until set.");
  });

  it("shows the text as it was pasted, to check the draft against", async () => {
    fakeApi({ jobs: [importPastedText] });
    await renderAt(PASTED);
    await reviewOpen();

    const original = screen.getByRole("complementary", { name: "Original" });
    expect(within(original).getByText("The text as you pasted it.")).toBeTruthy();
    // As pasted, misspelling and all.
    expect(original.querySelector("[data-original-text]")?.textContent).toBe(pastedLemonBars);
    // There is no page to open and no picture.
    expect(screen.queryByRole("link", { name: /Open the page/ })).toBeNull();
    expect(within(original).queryByRole("img")).toBeNull();
  });

  it("saves like any other import", async () => {
    const api = fakeApi({ jobs: [importPastedText] });
    const { router } = await renderAt(PASTED);
    await reviewOpen();

    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    const foods = await screen.findByRole("dialog", { name: /Add \d+ foods?\?/ });
    fireEvent.click(within(foods).getByRole("button", { name: /^Add/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/lemon-bars"));
    const saved = api.sent("POST", "/recipes")[0]?.body;
    expect(saved).toMatchObject({ title: "Lemon Bars", importJobId: importPastedText.id });
  });
});

describe("reviewing an import", () => {
  it("opens from Review on the import's row, filled in from what was read", async () => {
    fakeApi();
    const { router } = await renderAt("/");

    fireEvent.click(await screen.findByRole("button", { name: "Review" }));

    expect((await reviewOpen()).value).toBe("Skillet Cornbread");
    expect(router.state.location.pathname).toBe(REVIEW);
    // Where it was read from, with the way back to the page.
    expect(screen.getByText("recipes.example.com")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open the page/ }).getAttribute("href")).toBe(
      "https://recipes.example.com/skillet-cornbread",
    );
    // What needs a look is listed: the page had no steps.
    expect(screen.getByText("No steps were found.")).toBeTruthy();
    // No recipe exists yet.
    expect(screen.getByRole("button", { name: "Save recipe" })).toBeTruthy();
  });

  it("saves the recipe with the import's ID, and lands on the recipe", async () => {
    const api = fakeApi();
    const { router } = await renderAt(REVIEW);
    await reviewOpen();

    addStep("Bake until golden.");
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    // Foods the household does not have are confirmed once, as for a typed recipe.
    const foods = await screen.findByRole("dialog", { name: /Add \d+ foods?\?/ });
    fireEvent.click(within(foods).getByRole("button", { name: /^Add/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/skillet-cornbread"));
    const saved = api.sent("POST", "/recipes")[0]?.body;
    expect(saved).toMatchObject({
      title: "Skillet Cornbread",
      importJobId: importNeedsReview.id,
      sourceUrl: "https://recipes.example.com/skillet-cornbread",
      sourceName: "Example Kitchen",
    });
    expect(api.jobs.get(importNeedsReview.id)?.status).toBe("completed");
    // Nothing was discarded on the way out.
    expect(api.sent("DELETE")).toEqual([]);
  });

  it("asks before discarding, then removes the import and returns to the list", async () => {
    const api = fakeApi();
    const { router } = await renderAt(REVIEW);
    await reviewOpen();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(sheet("Discard this import?").getByText(/thrown away/)).toBeTruthy();
    expect(api.sent("DELETE")).toEqual([]);
    fireEvent.click(sheet("Discard this import?").getByRole("button", { name: "Discard import" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(api.sent("DELETE", `/imports/${importNeedsReview.id}`)).toHaveLength(1);
    expect(api.sent("POST", "/recipes")).toEqual([]);
  });

  it("stays, and says so, when the import could not be discarded", async () => {
    fakeApi({ refuseDiscard: true });
    const { router } = await renderAt(REVIEW);
    await reviewOpen();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(sheet("Discard this import?").getByRole("button", { name: "Discard import" }));

    expect(await screen.findByText(/The import was not discarded/)).toBeTruthy();
    expect(router.state.location.pathname).toBe(REVIEW);
  });

  it("leaves a corrected import in the list when the cook goes elsewhere, after asking", async () => {
    const api = fakeApi();
    const { router } = await renderAt(REVIEW);
    const title = await reviewOpen();
    fireEvent.change(title, { target: { value: "Cast Iron Cornbread" } });

    void router.navigate({ to: "/manage" });

    const question = await screen.findByRole("dialog", { name: "Leave this review?" });
    expect(question.textContent).toContain("The import stays in the list");
    fireEvent.click(within(question).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/manage"));
    expect(api.sent("DELETE")).toEqual([]);
    expect(api.jobs.get(importNeedsReview.id)?.status).toBe("needs_review");
  });

  it("goes elsewhere without asking when nothing was corrected", async () => {
    const api = fakeApi();
    const { router } = await renderAt(REVIEW);
    await reviewOpen();

    void router.navigate({ to: "/manage" });

    await waitFor(() => expect(router.state.location.pathname).toBe("/manage"));
    expect(api.sent("DELETE")).toEqual([]);
  });

  it("says when the household already has a recipe from the same link, and links to it", async () => {
    fakeApi({ duplicate: { slug: "skillet-cornbread", title: "Skillet Cornbread (Nan's)" } });
    const { router } = await renderAt(REVIEW);
    await reviewOpen();

    fireEvent.click(screen.getByRole("button", { name: "Skillet Cornbread (Nan's)" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/skillet-cornbread"));
  });

  it("says so at the address of an import that is gone", async () => {
    fakeApi({ jobs: [] });
    await renderAt(REVIEW);

    expect(await screen.findByText("This import is not here")).toBeTruthy();
    expect(screen.getByRole("link", { name: "All recipes" })).toBeTruthy();
  });

  it("says so at the address of an import that is still being read", async () => {
    fakeApi({ jobs: [importRunning] });
    await renderAt(`/imports/${importRunning.id}/review`);

    expect(await screen.findByText("This import is not ready to review")).toBeTruthy();
  });

  it("keeps the review among Recipes in the navigation", async () => {
    fakeApi();
    await renderAt(REVIEW);
    await reviewOpen();

    const current = screen
      .getAllByRole("link", { current: "page" })
      .map((link) => link.textContent?.trim());
    expect(current).toContain("Recipes");
  });
});

describe("a recipe sent from the browser's bookmark", () => {
  const RECIPE_BLOCK = JSON.stringify({
    "@type": "Recipe",
    name: "Refused Plum Cake",
    recipeIngredient: ["8 plums"],
  });
  const PAGE = {
    url: "https://www.refusing.example.com/plum-cake",
    siteName: "Refusing Kitchen",
    blocks: [RECIPE_BLOCK],
  };
  const sentAt = (page: typeof PAGE) => `/add${encodeSentPage(page)}`;
  /** The app is opened by the bookmark at an address that carries the page after the #. */
  async function arrive(page: typeof PAGE = PAGE) {
    window.history.replaceState(null, "", sentAt(page));
    return renderAt(sentAt(page));
  }

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("is offered by name and site, and is not imported until the cook says so", async () => {
    const api = fakeApi({ jobs: [] });
    await arrive();

    const panel = within(await screen.findByRole("region", { name: "Sent from your browser" }));
    expect(panel.getByText("Refused Plum Cake")).toBeTruthy();
    expect(panel.getByText("refusing.example.com")).toBeTruthy();
    expect(api.sent("POST")).toEqual([]);
  });

  it("is imported with what the browser read, so the server does not ask the site", async () => {
    const api = fakeApi({ jobs: [] });
    const { router } = await arrive();

    fireEvent.click(await screen.findByRole("button", { name: "Import this recipe" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(api.sent("POST", "/imports")[0]?.body).toEqual({
      kind: "url",
      url: PAGE.url,
      page: { siteName: "Refusing Kitchen", blocks: [RECIPE_BLOCK] },
    });
    expect((await screen.findByRole("list", { name: "Imports" })).textContent).toContain(
      "refusing.example.com",
    );
  });

  it("can be let go, and then a refresh does not bring it back", async () => {
    const api = fakeApi({ jobs: [] });
    const { router } = await arrive();

    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Sent from your browser" })).toBeNull(),
    );
    await waitFor(() => expect(router.state.location.hash).toBe(""));
    expect(api.sent("POST")).toEqual([]);
  });

  it("says so when the page it was pressed on describes no recipe, and offers nothing to import", async () => {
    fakeApi({ jobs: [] });
    await arrive({ ...PAGE, blocks: [JSON.stringify({ "@type": "Article" })] });

    expect(
      await screen.findByText(/No recipe was found on that page of refusing.example.com/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Import this recipe" })).toBeNull();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("stays, and says so, when the import could not be started", async () => {
    fakeApi({ jobs: [], refuseStart: true });
    const { router } = await arrive();

    fireEvent.click(await screen.findByRole("button", { name: "Import this recipe" }));

    expect(await screen.findByText("The import could not be started. Try again.")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/add");
    expect(screen.getByRole("button", { name: "Import this recipe" })).toBeTruthy();
  });

  it("is offered as a bookmark on Add: a link whose address is a script made for this app", async () => {
    fakeApi({ jobs: [] });
    await renderAt("/add");

    const bookmark = await screen.findByRole("link", { name: "Send to Recipeflare" });
    await waitFor(() =>
      expect(bookmark.getAttribute("href")?.startsWith("javascript:")).toBe(true),
    );
    expect(decodeURIComponent(bookmark.getAttribute("href") ?? "")).toContain(
      `${window.location.origin}/add#page=`,
    );
    // Pressed on the Add page itself it only explains where it goes.
    fireEvent.click(bookmark);
    expect(screen.getByText(/It does nothing here/)).toBeTruthy();
  });
});
