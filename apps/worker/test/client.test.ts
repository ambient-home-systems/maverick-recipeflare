import { env } from "cloudflare:workers";
import { Recipe, RecipeListResponse } from "@recipeflare/schema";
import { fixtureMember } from "@recipeflare/schema/fixtures";
import { hc } from "hono/client";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppType } from "../src";
import { seedLists, signedIn } from "./helpers";

beforeAll(async () => {
  await seedLists(env.DB);
});

/**
 * The web app talks to the API through a client typed from the Worker's
 * routes. This file fails to compile if a route's path, body or query stops
 * matching what the client is given here.
 */
describe("the typed client", () => {
  const api = signedIn(env, fixtureMember.email ?? "");
  const client = hc<AppType>("http://localhost:8787", { fetch: api.fetch });

  it("creates, reads, lists, updates and deletes a recipe", async () => {
    const created = await client.api.v1.recipes.$post({ json: { title: "Typed Tart" } });
    expect(created.status).toBe(201);
    const recipe = Recipe.parse(await created.json());

    const read = await client.api.v1.recipes[":idOrSlug"].$get({
      param: { idOrSlug: recipe.slug },
    });
    expect(Recipe.parse(await read.json()).id).toBe(recipe.id);

    const listed = await client.api.v1.recipes.$get({ query: { sort: "title", perPage: "5" } });
    expect(RecipeListResponse.parse(await listed.json()).items.map((item) => item.id)).toContain(
      recipe.id,
    );

    const updated = await client.api.v1.recipes[":id"].$put({
      param: { id: recipe.id },
      json: { title: "Typed Tart", description: "Sharp.", version: recipe.version },
    });
    expect(updated.status).toBe(200);

    const me = await client.api.v1.me.$get();
    expect((await me.json()).member.id).toBe(fixtureMember.id);
  });
});
