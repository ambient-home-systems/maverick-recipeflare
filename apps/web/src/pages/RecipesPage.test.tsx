import type { RecipeSummary } from "@recipeflare/schema";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-utils";

afterEach(() => {
  cleanup();
});

const TIME = "2026-11-20T10:00:00.000Z";
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;

const organizer = (n: number, kind: string, name: string, color: string | null = null) => ({
  id: id(n),
  kind,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  color,
  createdAt: TIME,
  updatedAt: TIME,
  recipeCount: 1,
});
const ORGANIZERS = [
  organizer(1, "category", "Dinner", "salmon"),
  organizer(2, "category", "Dessert", "sky"),
  organizer(3, "tag", "Weeknight"),
  organizer(4, "tool", "Dutch oven"),
];
const FOODS = [
  {
    id: id(20),
    name: "Brown sugar",
    pluralName: null,
    description: "",
    aliases: [],
    labelId: null,
    createdAt: TIME,
    updatedAt: TIME,
    recipeCount: 2,
  },
];

function summary(n: number, title: string, extra: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id: id(100 + n),
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    title,
    description: "",
    sourceName: null,
    servings: null,
    prepTimeSeconds: null,
    cookTimeSeconds: null,
    totalTimeSeconds: null,
    cover: null,
    categories: [],
    tags: [],
    createdAt: TIME,
    updatedAt: TIME,
    ...extra,
  };
}

const page = (items: RecipeSummary[], extra: Record<string, number> = {}) =>
  Response.json({
    items,
    page: 1,
    perPage: 30,
    total: items.length,
    libraryTotal: items.length,
    ...extra,
  });

/** What `fetch` gives back for a redirect it was told not to follow. */
const redirectedToSignIn = () =>
  ({ type: "opaqueredirect", status: 0, ok: false }) as unknown as Response;

type Answer = Response | Error | (() => Response);

/** The API as the page sees it. `recipes` answers the list; it can be changed between requests. */
function stubApi(recipes: Answer | ((url: URL) => Answer)) {
  const state = { recipes };
  const give = (answer: Answer) => {
    if (answer instanceof Error) {
      throw answer;
    }
    return typeof answer === "function" ? answer() : answer.clone();
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/organizers")) {
      return Response.json({ items: ORGANIZERS });
    }
    if (url.pathname.endsWith("/foods")) {
      return Response.json({ items: FOODS });
    }
    const answer = state.recipes;
    return give(
      typeof answer === "function" && answer.length === 1
        ? (answer as (url: URL) => Answer)(url)
        : (answer as Answer),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const listRequests = () =>
    fetchMock.mock.calls
      .map(([input]) => new URL(String(input), "http://localhost"))
      .filter((url) => url.pathname.endsWith("/recipes"));
  return { state, fetchMock, listRequests };
}

const rowTitles = () =>
  within(screen.getByRole("list", { name: "Recipes" }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("span.block")?.textContent)
    .filter((title) => title);

describe("the recipe list on the household's own recipes", () => {
  it("lists what the API returns, under the household's own categories", async () => {
    stubApi(
      page([
        summary(1, "Tomato Soup", {
          totalTimeSeconds: 2400,
          sourceName: "Grandma Rose",
          categories: [{ id: id(1), name: "Dinner", slug: "dinner" }],
          tags: [{ id: id(3), name: "Weeknight", slug: "weeknight" }],
        }),
        summary(2, "Lemon Bars"),
      ]),
    );
    await renderAt("/");

    await waitFor(() => expect(rowTitles()).toEqual(["Tomato Soup", "Lemon Bars"]));
    expect(screen.getByRole("heading", { level: 1, name: "All recipes" })).toBeTruthy();
    expect(screen.getByText("2 recipes")).toBeTruthy();
    const tabs = within(screen.getByRole("tablist", { name: "Categories" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["All", "Dinner", "Dessert"]);
    const row = screen.getByText("Tomato Soup").closest("li");
    expect(row?.textContent).toContain("40 min");
    expect(row?.textContent).toContain("Grandma Rose");
  });

  it("shows the first-run state to a household with no recipes", async () => {
    stubApi(page([]));
    await renderAt("/");

    expect(await screen.findByRole("heading", { name: "No recipes yet" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Recipes" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Type a recipe" }).getAttribute("href")).toBe(
      "/recipes/new",
    );
    // Nothing to search or filter yet.
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("shows rows on their way while the first recipes load", async () => {
    stubApi(() => {
      throw new Error("never answered in this test");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    await renderAt("/");

    expect(screen.getByText("Loading recipes")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Recipes" })).toBeNull();
  });
});

describe("what the list shows is in the address", () => {
  it("asks the API for the search, the filters and the sort the address names", async () => {
    const api = stubApi(page([summary(1, "Apple Pie")], { libraryTotal: 12 }));
    await renderAt("/?q=apple%20pie&category=dessert&tags=weeknight&tools=dutch-oven&sort=title");

    await waitFor(() => expect(rowTitles()).toEqual(["Apple Pie"]));
    const asked = api.listRequests().at(-1)?.searchParams;
    expect(asked?.get("q")).toBe("apple pie");
    expect(asked?.get("category")).toBe("dessert");
    expect(asked?.get("tags")).toBe("weeknight");
    expect(asked?.get("tools")).toBe("dutch-oven");
    expect(asked?.get("sort")).toBe("title");
    expect(asked?.get("page")).toBe("1");
    // The screen shows the same choices.
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("apple pie");
    expect(screen.getByRole("tab", { name: "Dessert" }).getAttribute("aria-selected")).toBe("true");
    expect(
      within(screen.getByRole("list", { name: "Filters in use" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(expect.arrayContaining([expect.stringContaining("Weeknight")]));
  });

  it("sorts by best match while searching and by last changed otherwise, unless told", async () => {
    const api = stubApi(page([summary(1, "Soup")]));
    await renderAt("/?q=soup");
    await waitFor(() => expect(api.listRequests().at(-1)?.searchParams.get("sort")).toBe("match"));
    cleanup();

    const plain = stubApi(page([summary(1, "Soup")]));
    await renderAt("/");
    await waitFor(() =>
      expect(plain.listRequests().at(-1)?.searchParams.get("sort")).toBe("changed"),
    );
  });

  it("names a food in the address by its name and asks the API for it by ID", async () => {
    const api = stubApi(page([summary(1, "Cookies")]));
    await renderAt("/?foods=brown-sugar");

    await waitFor(() => expect(rowTitles()).toEqual(["Cookies"]));
    // One request, made once the foods were known, and it carries the ID.
    expect(api.listRequests().map((url) => url.searchParams.get("foods"))).toEqual([id(20)]);
  });

  it("writes a change of category into the address and asks again", async () => {
    const api = stubApi(page([summary(1, "Soup")]));
    const { router } = await renderAt("/");
    await waitFor(() => expect(rowTitles()).toEqual(["Soup"]));

    fireEvent.click(screen.getByRole("tab", { name: "Dinner" }));

    await waitFor(() => expect(router.state.location.search).toEqual({ category: "dinner" }));
    await waitFor(() =>
      expect(api.listRequests().at(-1)?.searchParams.get("category")).toBe("dinner"),
    );
  });

  it("says what was asked for when nothing matches, and can clear it", async () => {
    stubApi(page([], { libraryTotal: 12 }));
    const { router } = await renderAt("/?q=zucchini");

    expect(await screen.findByRole("heading", { name: "No recipes match" })).toBeTruthy();
    expect(screen.getByText(/Nothing matches “zucchini”/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));

    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });
});

describe("a long list", () => {
  it("counts every match and loads thirty more when asked", async () => {
    const all = Array.from({ length: 31 }, (_, n) => summary(n, `Recipe ${n + 1}`));
    const api = stubApi((url: URL) =>
      url.searchParams.get("page") === "2"
        ? page(all.slice(30), { page: 2, total: 31, libraryTotal: 31 })
        : page(all.slice(0, 30), { total: 31, libraryTotal: 31 }),
    );
    await renderAt("/");

    await waitFor(() => expect(rowTitles()).toHaveLength(30));
    expect(screen.getByText("31 recipes")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show more recipes" }));

    await waitFor(() => expect(rowTitles()).toHaveLength(31));
    expect(rowTitles().at(-1)).toBe("Recipe 31");
    expect(api.listRequests().map((url) => url.searchParams.get("page"))).toEqual(["1", "2"]);
    expect(screen.queryByRole("button", { name: "Show more recipes" })).toBeNull();
  });
});

describe("when the sign-in session has run out", () => {
  it("offers to sign in again, back to this page, and says there is nothing to show", async () => {
    stubApi(redirectedToSignIn);
    await renderAt("/?q=soup");

    const link = await screen.findByRole("link", { name: "Sign in again" });
    expect(link.getAttribute("href")).toBe("/api/v1/auth/refresh?return=%2F%3Fq%3Dsoup");
    expect(screen.getByText(/You have been signed out/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sign in to see your recipes" })).toBeTruthy();
    // It is not called a failure.
    expect(screen.queryByText("The recipes could not be loaded.")).toBeNull();
  });

  it("keeps the recipes that are already on screen", async () => {
    const api = stubApi(page([summary(1, "Tomato Soup")]));
    const { queryClient } = await renderAt("/");
    await waitFor(() => expect(rowTitles()).toEqual(["Tomato Soup"]));

    api.state.recipes = redirectedToSignIn;
    await queryClient.invalidateQueries();

    expect(await screen.findByRole("link", { name: "Sign in again" })).toBeTruthy();
    expect(rowTitles()).toEqual(["Tomato Soup"]);
  });

  it("recovers by itself once a request succeeds again", async () => {
    const api = stubApi(redirectedToSignIn);
    const { queryClient } = await renderAt("/");
    await screen.findByRole("link", { name: "Sign in again" });

    // Signed in again, in this tab or another: the next request gets through.
    api.state.recipes = page([summary(1, "Tomato Soup")]);
    await queryClient.invalidateQueries();

    await waitFor(() => expect(rowTitles()).toEqual(["Tomato Soup"]));
    expect(screen.queryByRole("link", { name: "Sign in again" })).toBeNull();
    expect(screen.queryByText(/You have been signed out/)).toBeNull();
  });
});

describe("when the recipes cannot be loaded", () => {
  it("says so, and loads them when asked to try again", async () => {
    const api = stubApi(
      Response.json({ error: { code: "internal_error", message: "No" } }, { status: 500 }),
    );
    await renderAt("/");

    expect(await screen.findByRole("heading", { name: "Could not load the recipes" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("The recipes could not be loaded.");
    // A refusal is not asked again by itself.
    expect(api.listRequests()).toHaveLength(1);

    api.state.recipes = page([summary(1, "Tomato Soup")]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(rowTitles()).toEqual(["Tomato Soup"]));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tries once more by itself when the server could not be reached", async () => {
    const api = stubApi(new TypeError("Failed to fetch"));
    await renderAt("/");

    expect(await screen.findByRole("heading", { name: "Could not load the recipes" })).toBeTruthy();
    expect(api.listRequests()).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Sign in again" })).toBeNull();
  });

  it("says the device is offline when it is", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    stubApi(new TypeError("Failed to fetch"));
    await renderAt("/");

    expect(await screen.findByRole("heading", { name: "Could not load the recipes" })).toBeTruthy();
    expect(screen.getByText(/You are offline/)).toBeTruthy();
    expect(screen.getByText(/This device is offline/)).toBeTruthy();
  });

  it("keeps what is on screen and says it may be out of date", async () => {
    const api = stubApi(page([summary(1, "Tomato Soup")]));
    const { queryClient } = await renderAt("/");
    await waitFor(() => expect(rowTitles()).toEqual(["Tomato Soup"]));

    api.state.recipes = Response.json(
      { error: { code: "internal_error", message: "No" } },
      { status: 500 },
    );
    await queryClient.invalidateQueries();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not be brought up to date",
    );
    expect(rowTitles()).toEqual(["Tomato Soup"]);
  });
});
