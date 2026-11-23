import {
  type ConflictBody,
  Id,
  RecipeCreate,
  RecipeListQuery,
  RecipeUpdate,
} from "@recipeflare/schema";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "../auth/types";
import { listRecipes } from "../db/recipeList";
import { createRecipe, deleteRecipe, loadRecipe, updateRecipe } from "../db/recipes";
import { errorBody, invalid, jsonBody, notFound, queryParams } from "../http";

/** A recipe at every size cap is under 1 MB of JSON. */
const recipeBody = bodyLimit({
  maxSize: 2 * 1024 * 1024,
  onError: (c) => c.json(errorBody("too_large", "This recipe is too large to save"), 413),
});

/** `/api/v1/recipes`. Every handler has a member on its context. */
export const recipeRoutes = new Hono<AppEnv>()
  .get("/", queryParams(RecipeListQuery), async (c) => {
    return c.json(await listRecipes(c.env.DB, c.req.valid("query")));
  })
  .post("/", recipeBody, jsonBody(RecipeCreate), async (c) => {
    const { importJobId, ...input } = c.req.valid("json");
    // With an import's ID, the same save confirms the import.
    const result = await createRecipe(c.env.DB, input, c.get("member").id, importJobId);
    if (result.ok) {
      return c.json(result.recipe, 201);
    }
    return result.reason === "invalid" ? invalid(c, result.issues) : notFound(c);
  })
  // By ID or by slug, an ID first.
  .get("/:idOrSlug", async (c) => {
    const recipe = await loadRecipe(c.env.DB, c.req.param("idOrSlug"));
    return recipe ? c.json(recipe) : notFound(c);
  })
  .put("/:id", recipeBody, jsonBody(RecipeUpdate), async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) {
      return notFound(c);
    }
    const result = await updateRecipe(c.env.DB, id.data, c.req.valid("json"), c.get("member").id);
    if (result.ok) {
      return c.json(result.recipe);
    }
    if (result.reason === "conflict") {
      const body: ConflictBody = {
        ...errorBody("version_conflict", "Someone else changed this recipe since you opened it"),
        current: result.current,
      };
      return c.json(body, 409);
    }
    return result.reason === "invalid" ? invalid(c, result.issues) : notFound(c);
  })
  .delete("/:id", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success || !(await deleteRecipe(c.env.DB, id.data))) {
      return notFound(c);
    }
    return c.body(null, 204);
  });
