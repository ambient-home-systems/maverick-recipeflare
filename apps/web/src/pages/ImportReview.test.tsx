import { type Asset, type ImportJob, newId, type Recipe, slugify } from "@recipeflare/schema";
import {
  fixtureFoods,
  fixtureOrganizers,
  fixtureRecipes,
  fixtureUnits,
  importNeedsReview,
  importRunning,
} from "@recipeflare/schema/fixtures";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
        sourceUrl: String(body.url),
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
