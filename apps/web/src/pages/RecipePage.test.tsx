import { fixtureOrganizers, fixtureRecipes } from "@recipeflare/schema/fixtures";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-utils";

afterEach(() => {
  cleanup();
});

const bySlug = (slug: string) => {
  const found = fixtureRecipes.find((recipe) => recipe.slug === slug);
  if (!found) {
    throw new Error(`no fixture recipe "${slug}"`);
  }
  return found;
};
const LENTIL = bySlug("lemony-red-lentil-soup");
const TOAST = bySlug("cinnamon-toast");

const refusal = (status: number, code: string) =>
  Response.json({ error: { code, message: code } }, { status });

type Answer = Response | Error | (() => Response);

/**
 * The API as the page sees it. `recipe` answers a read of one recipe and
 * `remove` a delete; both can be changed between requests.
 */
function stubApi(recipe: Answer, remove: Answer = () => new Response(null, { status: 204 })) {
  const state = { recipe, remove };
  const give = (answer: Answer) => {
    if (answer instanceof Error) {
      throw answer;
    }
    return typeof answer === "function" ? answer() : answer.clone();
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/organizers")) {
      return Response.json({
        items: fixtureOrganizers.map((entry) => ({ ...entry, recipeCount: 1 })),
      });
    }
    if (url.pathname.endsWith("/foods")) {
      return Response.json({ items: [] });
    }
    if (url.pathname.endsWith("/recipes")) {
      return Response.json({ items: [], page: 1, perPage: 30, total: 0, libraryTotal: 0 });
    }
    return give(init?.method === "DELETE" ? state.remove : state.recipe);
  });
  vi.stubGlobal("fetch", fetchMock);
  const requests = (method: string) =>
    fetchMock.mock.calls
      .filter(([, init]) => (init?.method ?? "GET") === method)
      .map(([input]) => new URL(String(input), "http://localhost").pathname);
  return { state, requests };
}

const ingredients = () => within(screen.getByRole("region", { name: "Ingredients" }));
const lines = () =>
  ingredients()
    .getAllByRole("listitem")
    .map((item) => item.textContent);

describe("a recipe on the household's own data", () => {
  it("fetches the recipe the address names and shows it", async () => {
    const api = stubApi(Response.json(LENTIL));
    await renderAt(`/recipes/${LENTIL.slug}`);

    expect(await screen.findByRole("heading", { level: 1, name: LENTIL.title })).toBeTruthy();
    expect(api.requests("GET")).toContain(`/api/v1/recipes/${LENTIL.slug}`);
    expect(lines()).toContain("2 tbsp olive oil");
    expect(lines()).toContain("6 cups water or vegetable stock");
  });

  it("stands the recipe behind its category's divider, which leads back to the list at that category", async () => {
    stubApi(Response.json(LENTIL));
    await renderAt(`/recipes/${LENTIL.slug}`);
    await screen.findByRole("heading", { level: 1, name: LENTIL.title });

    const category = LENTIL.categories[0];
    const back = within(screen.getByRole("navigation", { name: "Filed under" }));
    expect(back.getByRole("link", { name: "All recipes" }).getAttribute("href")).toBe("/");
    expect(back.getByRole("link", { name: category?.name }).getAttribute("href")).toBe(
      `/?category=${category?.slug}`,
    );
  });

  it("scales the amounts it read and leaves a line kept as written alone, saying so", async () => {
    stubApi(Response.json(LENTIL));
    const { router } = await renderAt(`/recipes/${LENTIL.slug}`);
    await screen.findByRole("heading", { level: 1, name: LENTIL.title });
    expect(ingredients().queryByText("not doubled")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Double" }));

    await waitFor(() => expect(lines()).toContain("4 tbsp olive oil"));
    // The scale is in the address, so a reload keeps it.
    expect(router.state.location.search).toEqual({ scale: 2 });
    // The line as written still says 6 cups, and is marked.
    expect(lines()).toContain("6 cups water or vegetable stocknot doubled");
    expect(ingredients().getAllByText("not doubled")).toHaveLength(3);
  });

  it("opens already scaled when the address says so", async () => {
    stubApi(Response.json(LENTIL));
    await renderAt(`/recipes/${LENTIL.slug}?scale=0.5`);
    await screen.findByRole("heading", { level: 1, name: LENTIL.title });

    expect((screen.getByRole("radio", { name: "Half" }) as HTMLInputElement).checked).toBe(true);
    expect(lines()).toContain("1 tbsp olive oil");
  });

  it("shows a recipe that is only a title", async () => {
    stubApi(Response.json(TOAST));
    await renderAt(`/recipes/${TOAST.slug}`);

    expect(await screen.findByRole("heading", { name: "Only a title so far" })).toBeTruthy();
  });

  it("does not offer Cook or Edit until those screens are connected", async () => {
    stubApi(Response.json(LENTIL));
    await renderAt(`/recipes/${LENTIL.slug}`);
    await screen.findByRole("heading", { level: 1, name: LENTIL.title });

    expect(screen.queryByRole("button", { name: "Cook" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});

describe("deleting a recipe", () => {
  it("asks first, names the recipe, and deletes nothing if the cook keeps it", async () => {
    const api = stubApi(Response.json(LENTIL));
    const { router } = await renderAt(`/recipes/${LENTIL.slug}`);
    await screen.findByRole("heading", { level: 1, name: LENTIL.title });

    fireEvent.click(screen.getByRole("button", { name: "Delete recipe" }));
    const sheet = within(screen.getByRole("dialog", { name: "Delete this recipe?" }));
    expect(sheet.getByText(LENTIL.title)).toBeTruthy();
    expect(sheet.getByText(/This cannot be undone/)).toBeTruthy();

    fireEvent.click(sheet.getByRole("button", { name: "Keep it" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.requests("DELETE")).toEqual([]);
    expect(router.state.location.pathname).toBe(`/recipes/${LENTIL.slug}`);
  });

  it("deletes on the second press and goes back to the list", async () => {
    const api = stubApi(Response.json(LENTIL));
    const { router } = await renderAt(`/recipes/${LENTIL.slug}`);
    await screen.findByRole("heading", { level: 1, name: LENTIL.title });

    fireEvent.click(screen.getByRole("button", { name: "Delete recipe" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete recipe" }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(api.requests("DELETE")).toEqual([`/api/v1/recipes/${LENTIL.id}`]);
  });

  it("says so when the delete does not go through, and leaves the recipe on screen", async () => {
    const api = stubApi(Response.json(LENTIL), refusal(500, "internal_error"));
    const { router } = await renderAt(`/recipes/${LENTIL.slug}`);
    await screen.findByRole("heading", { level: 1, name: LENTIL.title });

    fireEvent.click(screen.getByRole("button", { name: "Delete recipe" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete recipe" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain("could not be deleted");
    expect(router.state.location.pathname).toBe(`/recipes/${LENTIL.slug}`);
    expect(screen.getByRole("heading", { level: 1, name: LENTIL.title })).toBeTruthy();
    expect(api.requests("DELETE")).toHaveLength(1);
  });
});

describe("when there is no recipe to show", () => {
  it("says so when the address leads to no recipe, and leads back to the list", async () => {
    stubApi(refusal(404, "not_found"));
    await renderAt("/recipes/no-such-recipe");

    expect(await screen.findByRole("heading", { name: "This recipe is not here" })).toBeTruthy();
    expect(
      within(screen.getByRole("main"))
        .getAllByRole("link", { name: "All recipes" })
        .map((link) => link.getAttribute("href")),
    ).toContain("/");
  });

  it("says so when the recipe could not be loaded, and loads it when asked to try again", async () => {
    const api = stubApi(refusal(500, "internal_error"));
    await renderAt(`/recipes/${LENTIL.slug}`);

    expect((await screen.findByRole("alert")).textContent).toContain("could not be loaded");

    api.state.recipe = Response.json(LENTIL);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { level: 1, name: LENTIL.title })).toBeTruthy();
  });

  it("offers to sign in again when the session has run out, back to this recipe", async () => {
    // With the session gone, every request is answered with the redirect to the sign-in page.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ type: "opaqueredirect", status: 0, ok: false }) as unknown as Response),
    );
    await renderAt(`/recipes/${LENTIL.slug}?scale=2`);

    expect(await screen.findByRole("heading", { name: "Sign in to see this recipe" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe(
      `/api/v1/auth/refresh?return=${encodeURIComponent(`/recipes/${LENTIL.slug}?scale=2`)}`,
    );
  });

  it("shows lines in outline while the recipe loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    await renderAt(`/recipes/${LENTIL.slug}`);

    expect(screen.getByText("Loading the recipe")).toBeTruthy();
  });
});

describe("getting to a recipe", () => {
  it("is one press from its row on the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname.endsWith("/recipes")) {
          return Response.json({
            items: [
              {
                id: LENTIL.id,
                slug: LENTIL.slug,
                title: LENTIL.title,
                description: "",
                sourceName: null,
                servings: null,
                prepTimeSeconds: null,
                cookTimeSeconds: null,
                totalTimeSeconds: null,
                cover: null,
                categories: [],
                tags: [],
                createdAt: LENTIL.createdAt,
                updatedAt: LENTIL.updatedAt,
              },
            ],
            page: 1,
            perPage: 30,
            total: 1,
            libraryTotal: 1,
          });
        }
        return Response.json({ items: [] });
      }),
    );
    await renderAt("/");

    const row = await screen.findByRole("link", { name: new RegExp(LENTIL.title) });
    expect(row.getAttribute("href")).toBe(`/recipes/${LENTIL.slug}`);
  });
});
