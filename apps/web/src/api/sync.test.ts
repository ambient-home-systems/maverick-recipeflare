import { type Recipe, toRecipeSummary } from "@recipeflare/schema";
import { fixtureRecipes } from "@recipeflare/schema/fixtures";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { isKept } from "./persist";
import { copyRecipesToDevice } from "./sync";

/** The API with these recipes in it, and a record of what was asked for. */
function library(recipes: Recipe[]) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const path = url.pathname.replace("/api/v1", "");
      asked.push(path + url.search);
      if (path === "/recipes") {
        const page = Number(url.searchParams.get("page"));
        const perPage = Number(url.searchParams.get("perPage"));
        return Response.json({
          items: recipes.slice((page - 1) * perPage, page * perPage).map(toRecipeSummary),
          page,
          perPage,
          total: recipes.length,
          libraryTotal: recipes.length,
        });
      }
      const found = recipes.find((recipe) => path === `/recipes/${recipe.id}`);
      return found
        ? Response.json(found)
        : Response.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
    }),
  );
  return { asked, fetched: () => asked.filter((path) => /^\/recipes\/[^?]/.test(path)) };
}

const copyOf = (client: QueryClient, recipe: Recipe) =>
  client.getQueryData<Recipe>(["recipes", "one", recipe.slug]);

describe("copying the recipes to the device", () => {
  it("fetches every recipe the first time, and each can then be opened by its address", async () => {
    const api = library(fixtureRecipes);
    const client = new QueryClient();

    const result = await copyRecipesToDevice(client);

    expect(result).toEqual({ total: fixtureRecipes.length, fetched: fixtureRecipes.length });
    for (const recipe of fixtureRecipes) {
      expect(copyOf(client, recipe)?.id).toBe(recipe.id);
    }
    expect(api.fetched()).toHaveLength(fixtureRecipes.length);
  });

  it("fetches only what has changed the next time", async () => {
    const client = new QueryClient();
    library(fixtureRecipes);
    await copyRecipesToDevice(client);
    const [first, ...rest] = fixtureRecipes;
    if (!first) {
      throw new Error("the fixtures are missing");
    }
    const edited: Recipe = {
      ...first,
      description: "Edited on another device.",
      updatedAt: "2027-01-01T00:00:00.000Z",
    };
    const api = library([edited, ...rest]);

    const result = await copyRecipesToDevice(client);

    expect(result.fetched).toBe(1);
    expect(api.fetched()).toEqual([`/recipes/${first.id}`]);
    expect(copyOf(client, first)?.description).toBe("Edited on another device.");
  });

  it("forgets a recipe that was deleted, and the old address of one that was renamed", async () => {
    const client = new QueryClient();
    library(fixtureRecipes);
    await copyRecipesToDevice(client);
    const [gone, renamed, ...rest] = fixtureRecipes;
    if (!gone || !renamed) {
      throw new Error("the fixtures are missing");
    }
    const moved: Recipe = {
      ...renamed,
      title: "Renamed Entirely",
      slug: "renamed-entirely",
      updatedAt: "2027-01-01T00:00:00.000Z",
    };
    library([moved, ...rest]);
    // A later visit: the copies are older than the list that is about to be asked for.
    await new Promise((resolve) => setTimeout(resolve, 5));

    await copyRecipesToDevice(client);

    expect(copyOf(client, gone)).toBeUndefined();
    expect(copyOf(client, renamed)).toBeUndefined();
    expect(copyOf(client, moved)?.title).toBe("Renamed Entirely");
  });

  it("keeps a recipe saved on this device while the list was on its way", async () => {
    const [existing, created] = fixtureRecipes;
    if (!existing || !created) {
      throw new Error("the fixtures are missing");
    }
    const client = new QueryClient();
    // The list is answered as it stood before the new recipe was saved...
    let answerList: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/api/v1/recipes") {
          return new Promise<Response>((resolve) => {
            answerList = resolve;
          });
        }
        return Response.json(existing);
      }),
    );
    const copying = copyRecipesToDevice(client);
    await vi.waitFor(() => expect(answerList).not.toHaveLength(0));
    // ...and the save lands in the cache before that answer arrives.
    await new Promise((resolve) => setTimeout(resolve, 5));
    client.setQueryData(["recipes", "one", created.slug], created);
    answerList(
      Response.json({
        items: [toRecipeSummary(existing)],
        page: 1,
        perPage: 100,
        total: 1,
        libraryTotal: 1,
      }),
    );

    await copying;

    expect(copyOf(client, created)?.id).toBe(created.id);
    expect(copyOf(client, existing)?.id).toBe(existing.id);
  });

  it("asks for the library a hundred at a time until it has it all", async () => {
    const [template] = fixtureRecipes;
    if (!template) {
      throw new Error("the fixtures are missing");
    }
    const many = Array.from({ length: 230 }, (_, index): Recipe => {
      const n = String(index).padStart(12, "0");
      return { ...template, id: `00000000-0000-7000-8000-${n}`, slug: `recipe-${index}` };
    });
    const api = library(many);
    const client = new QueryClient();

    const result = await copyRecipesToDevice(client);

    expect(result).toEqual({ total: 230, fetched: 230 });
    expect(api.asked.filter((path) => path.startsWith("/recipes?"))).toHaveLength(3);
  });

  it("stops, and says so, when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(copyRecipesToDevice(new QueryClient())).rejects.toThrow();
  });
});

describe("what is kept on the device between visits", () => {
  const query = (queryKey: unknown[], status = "success") =>
    ({ queryKey, state: { status } }) as unknown as Parameters<typeof isKept>[0];

  it("keeps whole recipes and the household's lists", () => {
    expect(isKept(query(["recipes", "one", "plum-cake"]))).toBe(true);
    expect(isKept(query(["lists", "organizers"]))).toBe(true);
    expect(isKept(query(["lists", "units"]))).toBe(true);
  });

  it("keeps no search results, no imports, and nothing that failed", () => {
    expect(isKept(query(["recipes", "list", { q: "plum" }]))).toBe(false);
    expect(isKept(query(["imports"]))).toBe(false);
    expect(isKept(query(["recipes", "one", "plum-cake"], "error"))).toBe(false);
    expect(isKept(query(["recipes", "one", "plum-cake"], "pending"))).toBe(false);
  });
});
