import { fixtureOrganizers, fixtureRecipes } from "@recipeflare/schema/fixtures";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-utils";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const bySlug = (slug: string) => {
  const found = fixtureRecipes.find((recipe) => recipe.slug === slug);
  if (!found) {
    throw new Error(`no fixture recipe "${slug}"`);
  }
  return found;
};
const CHICKEN = bySlug("roast-chicken-with-lemon-and-thyme");
const LENTIL = bySlug("lemony-red-lentil-soup");
const COOK = `/recipes/${CHICKEN.slug}/cook`;

const redirectedToSignIn = () =>
  ({ type: "opaqueredirect", status: 0, ok: false }) as unknown as Response;

type Answer = Response | Error | (() => Response);

/** The API as cook mode sees it: the recipe, and the organizers for its category's colour. */
function stubApi(recipe: Answer) {
  const state = { recipe };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/organizers")) {
      return Response.json({
        items: fixtureOrganizers.map((entry) => ({ ...entry, recipeCount: 1 })),
      });
    }
    const answer = state.recipe;
    if (answer instanceof Error) {
      throw answer;
    }
    return typeof answer === "function" ? answer() : answer.clone();
  });
  vi.stubGlobal("fetch", fetchMock);
  return { state, fetchMock };
}

const progress = () => screen.getAllByRole("status")[0]?.textContent;
const step = (name: RegExp) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const cooking = () => screen.findByRole("heading", { level: 1, name: CHICKEN.title });

describe("cook mode on the household's own recipe", () => {
  it("fetches the recipe and fills the screen with it: no header, no navigation", async () => {
    const api = stubApi(Response.json(CHICKEN));
    await renderAt(COOK);

    expect(await cooking()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(
      api.fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith(`/api/v1/recipes/${CHICKEN.slug}`),
      ),
    ).toBe(true);
  });

  it("keeps ticks through a reload, on this device and not on the server", async () => {
    const api = stubApi(Response.json(CHICKEN));
    await renderAt(COOK);
    await cooking();

    fireEvent.click(step(/^Step 1\. Heat the oven/));
    expect(progress()).toBe("1 of 7 steps done");
    cleanup();

    await renderAt(COOK);
    await cooking();

    expect(progress()).toBe("1 of 7 steps done");
    expect(step(/^Step 1\. Heat the oven/).checked).toBe(true);
    // Nothing about cooking is sent anywhere: every request was a read.
    expect(api.fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(
      true,
    );
  });

  it("starts at the scale the recipe was showing, and keeps it through a reload", async () => {
    stubApi(Response.json(LENTIL));
    await renderAt(`/recipes/${LENTIL.slug}/cook?scale=2`);

    expect(await screen.findByRole("checkbox", { name: "4 tbsp olive oil" })).toBeTruthy();
    cleanup();

    // The address no longer says so; the device remembers.
    await renderAt(`/recipes/${LENTIL.slug}/cook`);
    expect(await screen.findByRole("checkbox", { name: "4 tbsp olive oil" })).toBeTruthy();
  });

  it("keeps each recipe's ticks apart", async () => {
    stubApi(Response.json(CHICKEN));
    await renderAt(COOK);
    await cooking();
    fireEvent.click(step(/^Step 1\. Heat the oven/));
    cleanup();

    stubApi(Response.json(LENTIL));
    await renderAt(`/recipes/${LENTIL.slug}/cook`);
    await screen.findByRole("heading", { level: 1, name: LENTIL.title });

    expect(progress()).toMatch(/^0 of/);
  });

  it("clears the ticks and goes back to the recipe on Done", async () => {
    stubApi(Response.json(CHICKEN));
    const { router } = await renderAt(COOK);
    await cooking();
    fireEvent.click(step(/^Step 1\. Heat the oven/));

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    // In the middle of a recipe it asks first, so a stray press does not lose the place.
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Finish cooking?" })).getByRole("button", {
        name: "Leave and clear ticks",
      }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe(`/recipes/${CHICKEN.slug}`));
    expect(
      Object.keys(window.localStorage)
        .filter((key) => key.includes(CHICKEN.id))
        .map((key) => `${key}=${window.localStorage.getItem(key)}`),
    ).toEqual([]);
  });

  it("carries the recipe's category colour, from the household's own categories", async () => {
    stubApi(Response.json(CHICKEN));
    await renderAt(COOK);
    await cooking();

    const category = fixtureOrganizers.find((entry) => entry.id === CHICKEN.categories[0]?.id);
    await waitFor(() =>
      expect(document.querySelector(`.bg-stock-${category?.color}`)).toBeTruthy(),
    );
  });
});

describe("cook mode when something is wrong", () => {
  it("carries on when the session runs out, and offers to sign in again", async () => {
    const api = stubApi(Response.json(CHICKEN));
    const { queryClient } = await renderAt(COOK);
    await cooking();

    api.state.recipe = redirectedToSignIn;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => redirectedToSignIn()),
    );
    await queryClient.invalidateQueries();

    expect(await screen.findByText(/You are signed out\. Cooking carries on/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeTruthy();
    fireEvent.click(step(/^Step 1\. Heat the oven/));
    expect(progress()).toBe("1 of 7 steps done");
  });

  it("carries on offline, and says where the recipe is coming from", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    stubApi(Response.json(CHICKEN));
    await renderAt(COOK);
    await cooking();

    expect(screen.getByText(/You are offline\. Cooking carries on/)).toBeTruthy();
  });

  it("says so when the address leads to no recipe, with a way back to the list", async () => {
    stubApi(Response.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 }));
    await renderAt("/recipes/no-such-recipe/cook");

    expect(await screen.findByRole("heading", { name: "This recipe is not here" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "All recipes" }).getAttribute("href")).toBe("/");
  });

  it("says so when the recipe could not be loaded, and loads it when asked to try again", async () => {
    const api = stubApi(
      Response.json({ error: { code: "internal_error", message: "No" } }, { status: 500 }),
    );
    await renderAt(COOK);
    expect(await screen.findByRole("heading", { name: "Could not load the recipe" })).toBeTruthy();

    api.state.recipe = Response.json(CHICKEN);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await cooking()).toBeTruthy();
  });

  it("offers the way back in when there is no session and no copy of the recipe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => redirectedToSignIn()),
    );
    await renderAt(COOK);

    expect(
      await screen.findByRole("heading", { name: "Sign in to cook from this recipe" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe(
      `/api/v1/auth/refresh?return=${encodeURIComponent(COOK)}`,
    );
  });
});
