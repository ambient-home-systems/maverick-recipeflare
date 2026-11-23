import { env } from "cloudflare:workers";
import {
  ConflictBody,
  ErrorBody,
  newId,
  Recipe,
  RecipeListResponse,
  recipeToUpdate,
} from "@recipeflare/schema";
import { fixtureFoods, fixtureMember, fixtureOrganizers } from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { seedLists, signedIn } from "./helpers";

const api = signedIn(env, fixtureMember.email ?? "");

beforeAll(async () => {
  await seedLists(env.DB);
});

const tag = fixtureOrganizers.find((o) => o.kind === "tag");
const category = fixtureOrganizers.find((o) => o.kind === "category");
const butter = fixtureFoods.find((f) => f.name === "butter");

async function create(body: Record<string, unknown>): Promise<Recipe> {
  const response = await api.post("/recipes", body);
  expect(response.status).toBe(201);
  return Recipe.parse(await response.json());
}

async function errorOf(response: Response) {
  return ErrorBody.parse(await response.json()).error;
}

describe("creating a recipe", () => {
  it("saves it for the signed-in member and returns it whole", async () => {
    const recipe = await create({
      title: "  Apple Crumble ",
      servings: 6,
      ingredientSections: [
        {
          title: "Topping",
          items: [{ id: newId(), originalText: "1 cup butter", foodId: butter?.id, note: "" }],
        },
      ],
      tagIds: [tag?.id],
    });

    expect(recipe).toMatchObject({
      title: "Apple Crumble",
      slug: "apple-crumble",
      version: 1,
      servings: 6,
      createdBy: fixtureMember.id,
    });
    expect(recipe.ingredientSections[0]?.items[0]?.food?.name).toBe("butter");
    expect(recipe.tags.map((t) => t.id)).toEqual([tag?.id]);
  });

  it("needs only a title", async () => {
    expect((await create({ title: "Toast" })).slug).toBe("toast");
  });

  it("refuses a body the shared schema refuses, naming each field", async () => {
    const response = await api.post("/recipes", {
      title: " ",
      servings: -1,
      ingredientSections: [{ title: null, items: [{ id: "not-an-id", originalText: null }] }],
    });

    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("validation_failed");
    const paths = error.issues?.map((issue) => issue.path.join("."));
    expect(paths).toContain("title");
    expect(paths).toContain("servings");
    expect(paths).toContain("ingredientSections.0.items.0.id");
  });

  it("refuses a recipe that names a food the household does not have", async () => {
    const response = await api.post("/recipes", {
      title: "Dangling",
      ingredientSections: [
        { title: null, items: [{ id: newId(), originalText: "1 x", foodId: newId() }] },
      ],
    });

    expect(response.status).toBe(400);
    expect((await errorOf(response)).issues?.[0]?.path).toEqual([
      "ingredientSections",
      0,
      "items",
      0,
      "foodId",
    ]);
  });

  it("answers 400 to a body that is not JSON, in the shared error shape", async () => {
    const broken = await api.send("POST", "/recipes", "{ not json", {
      "Content-Type": "application/json",
    });
    expect(broken.status).toBe(400);
    expect((await errorOf(broken)).code).toBe("bad_request");
  });

  it("answers 413 to a body far larger than any recipe", async () => {
    const response = await api.post("/recipes", {
      title: "Big",
      description: "x".repeat(3_000_000),
    });

    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("too_large");
  });

  it("refuses to confirm an import that does not exist", async () => {
    const response = await api.post("/recipes", { title: "From A Page", importJobId: newId() });

    expect(response.status).toBe(400);
    expect((await errorOf(response)).issues?.[0]?.path).toEqual(["importJobId"]);
  });

  it("is refused without sign-in", async () => {
    const stranger = signedIn(env, "");
    expect((await stranger.post("/recipes", { title: "Nope" })).status).toBe(401);
    expect((await stranger.get("/recipes")).status).toBe(401);
  });
});

describe("reading a recipe", () => {
  it("finds it by ID and by slug", async () => {
    const recipe = await create({ title: "Found Either Way" });

    const byId = await api.get(`/recipes/${recipe.id}`);
    const bySlug = await api.get("/recipes/found-either-way");

    expect(Recipe.parse(await byId.json())).toEqual(recipe);
    expect(Recipe.parse(await bySlug.json())).toEqual(recipe);
  });

  it("answers 404 in the shared error shape when there is none", async () => {
    const response = await api.get("/recipes/no-such-recipe");

    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("not_found");
  });
});

describe("updating a recipe", () => {
  it("saves the change and raises the version", async () => {
    const recipe = await create({ title: "Draft Stew" });

    const response = await api.put(`/recipes/${recipe.id}`, {
      ...recipeToUpdate(recipe),
      title: "Finished Stew",
      description: "Better the next day.",
    });

    expect(response.status).toBe(200);
    expect(Recipe.parse(await response.json())).toMatchObject({
      id: recipe.id,
      title: "Finished Stew",
      slug: "finished-stew",
      description: "Better the next day.",
      version: 2,
    });
  });

  it("answers 409 with the current recipe when someone else saved first, and changes nothing", async () => {
    const recipe = await create({ title: "Contested" });
    const loaded = recipeToUpdate(recipe);
    await api.put(`/recipes/${recipe.id}`, { ...loaded, description: "Theirs" });

    const response = await api.put(`/recipes/${recipe.id}`, { ...loaded, description: "Mine" });

    expect(response.status).toBe(409);
    const body = ConflictBody.parse(await response.json());
    expect(body.error.code).toBe("version_conflict");
    expect(body.current).toMatchObject({ description: "Theirs", version: 2 });
    const now = Recipe.parse(await (await api.get(`/recipes/${recipe.id}`)).json());
    expect(now.description).toBe("Theirs");
  });

  it("needs the version the editor loaded", async () => {
    const recipe = await create({ title: "Versionless" });

    const response = await api.put(`/recipes/${recipe.id}`, { title: "Versionless" });

    expect(response.status).toBe(400);
    expect((await errorOf(response)).issues?.[0]?.path).toEqual(["version"]);
  });

  it("answers 404 for a recipe that is not there, and for an address that is not an ID", async () => {
    const body = { title: "Ghost", version: 1 };

    expect((await api.put(`/recipes/${newId()}`, body)).status).toBe(404);
    expect((await api.put("/recipes/ghost", body)).status).toBe(404);
  });
});

describe("deleting a recipe", () => {
  it("removes it and answers with no body", async () => {
    const recipe = await create({ title: "Short Lived" });

    const response = await api.delete(`/recipes/${recipe.id}`);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect((await api.get(`/recipes/${recipe.id}`)).status).toBe(404);
    expect((await api.delete(`/recipes/${recipe.id}`)).status).toBe(404);
  });

  it("is refused when another site sends it", async () => {
    const recipe = await create({ title: "Not Yours To Delete" });

    const response = await api.send("DELETE", `/recipes/${recipe.id}`, undefined, {
      "Sec-Fetch-Site": "cross-site",
    });

    expect(response.status).toBe(403);
    expect((await api.get(`/recipes/${recipe.id}`)).status).toBe(200);
  });
});

describe("listing recipes", () => {
  const list = async (query = "") => {
    const response = await api.get(`/recipes${query}`);
    expect(response.status).toBe(200);
    return RecipeListResponse.parse(await response.json());
  };

  beforeAll(async () => {
    // Start from a known set: five recipes, changed in this order.
    await env.DB.prepare("DELETE FROM recipes").run();
    for (const [index, title] of [
      "cherry pie",
      "Apple pie",
      "banana bread",
      "Date loaf",
      "elder cordial",
    ].entries()) {
      const recipe = await create({
        title,
        totalTimeSeconds: 600 * (index + 1),
        sourceName: index === 0 ? "Grandma" : null,
        categoryIds: index === 0 ? [category?.id] : [],
        tagIds: index === 0 ? [tag?.id] : [],
      });
      // Spread the times out; the saves above landed within the same few milliseconds.
      await env.DB.prepare("UPDATE recipes SET created_at = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(
          `2026-11-0${index + 1}T10:00:00.000Z`,
          `2026-11-1${5 - index}T10:00:00.000Z`,
          recipe.id,
        )
        .run();
    }
  });

  it("lists the most recently changed first, with what a row shows", async () => {
    const page = await list();

    expect(page).toMatchObject({ page: 1, perPage: 30, total: 5 });
    expect(page.items.map((item) => item.title)).toEqual([
      "cherry pie",
      "Apple pie",
      "banana bread",
      "Date loaf",
      "elder cordial",
    ]);
    expect(page.items[0]).toMatchObject({
      slug: "cherry-pie",
      sourceName: "Grandma",
      totalTimeSeconds: 600,
      cover: null,
      categories: [{ id: category?.id, name: category?.name }],
      tags: [{ id: tag?.id }],
    });
    expect(page.items[1]).toMatchObject({ categories: [], tags: [] });
  });

  it("sorts by newest and by title, ignoring capitals", async () => {
    expect((await list("?sort=newest")).items.map((item) => item.title)).toEqual([
      "elder cordial",
      "Date loaf",
      "banana bread",
      "Apple pie",
      "cherry pie",
    ]);
    expect((await list("?sort=title")).items.map((item) => item.title)).toEqual([
      "Apple pie",
      "banana bread",
      "cherry pie",
      "Date loaf",
      "elder cordial",
    ]);
  });

  it("pages through the list without skipping or repeating", async () => {
    const first = await list("?sort=title&perPage=2");
    const second = await list("?sort=title&perPage=2&page=2");
    const third = await list("?sort=title&perPage=2&page=3");
    const beyond = await list("?sort=title&perPage=2&page=4");

    expect(
      [first, second, third, beyond].map((page) => page.items.map((item) => item.title)),
    ).toEqual([["Apple pie", "banana bread"], ["cherry pie", "Date loaf"], ["elder cordial"], []]);
    expect(beyond).toMatchObject({ page: 4, perPage: 2, total: 5 });
  });

  it("shows a recipe's cover, or failing that its first photo", async () => {
    const page = await list("?sort=title");
    const [apple, banana] = page.items;
    const asset = (id: string, recipeId: string, role: string, position: number) =>
      env.DB.prepare(
        `INSERT INTO assets (id, recipe_id, role, position, content_type, size_bytes, created_by, created_at)
         VALUES (?1, ?2, ?3, ?4, 'image/webp', 1000, ?5, '2026-11-20T10:00:00.000Z')`,
      ).bind(id, recipeId, role, position, fixtureMember.id);
    const [photo, cover, second, card] = [newId(), newId(), newId(), newId()];
    await env.DB.batch([
      asset(photo, apple?.id ?? "", "photo", 0),
      asset(cover, apple?.id ?? "", "cover", 1),
      asset(card, banana?.id ?? "", "original", 0),
      asset(second, banana?.id ?? "", "photo", 2),
    ]);

    const again = await list("?sort=title");

    expect(again.items[0]?.cover?.id).toBe(cover);
    // A photo of the paper card is not a cover.
    expect(again.items[1]?.cover?.id).toBe(second);
    expect(again.items[2]?.cover).toBeNull();
  });

  it("refuses a sort or a page it does not know", async () => {
    for (const query of ["?sort=random", "?page=0", "?perPage=1000", "?page=abc"]) {
      const response = await api.get(`/recipes${query}`);
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("validation_failed");
    }
  });
});
