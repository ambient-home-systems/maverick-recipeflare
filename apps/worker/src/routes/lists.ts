import {
  type DuplicateBody,
  FoodInput,
  type FoodListResponse,
  Id,
  type InUseBody,
  LabelInput,
  type LabelListResponse,
  OrganizerCreate,
  OrganizerInput,
  type OrganizerListResponse,
  UnitInput,
  type UnitListResponse,
} from "@recipeflare/schema";
import { type Context, Hono } from "hono";
import type { AppEnv } from "../auth/types";
import {
  createFood,
  createLabel,
  createOrganizer,
  createUnit,
  deleteFood,
  deleteLabel,
  deleteOrganizer,
  deleteUnit,
  type ListResult,
  listFoods,
  listLabels,
  listOrganizers,
  listUnits,
  renameOrganizer,
  updateFood,
  updateLabel,
  updateUnit,
} from "../db/lists";
import { errorBody, invalid, jsonBody, notFound } from "../http";

type Refusal = Exclude<ListResult<unknown>, { ok: true }>;

/** The response for each way a change to a list can be refused. */
function refuse(c: Context, result: Refusal) {
  switch (result.reason) {
    case "duplicate": {
      const body: DuplicateBody = {
        ...errorBody("duplicate", "That name is already in use"),
        existingId: result.existingId,
      };
      return c.json(body, 409);
    }
    case "in_use": {
      const body: InUseBody = {
        ...errorBody("in_use", "Recipes use this, so it cannot be deleted"),
        recipeCount: result.recipeCount,
      };
      return c.json(body, 409);
    }
    case "invalid":
      return invalid(c, result.issues);
    default:
      return notFound(c);
  }
}

/** The ID in the address, or null when it is not one. */
const idParam = (c: Context) => Id.safeParse(c.req.param("id")).data ?? null;

/** `/api/v1/organizers`: categories, tags and tools. */
export const organizerRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const body: OrganizerListResponse = { items: await listOrganizers(c.env.DB) };
    return c.json(body);
  })
  .post("/", jsonBody(OrganizerCreate), async (c) => {
    const result = await createOrganizer(c.env.DB, c.req.valid("json"));
    return result.ok ? c.json(result.value, 201) : refuse(c, result);
  })
  .put("/:id", jsonBody(OrganizerInput), async (c) => {
    const id = idParam(c);
    if (!id) {
      return notFound(c);
    }
    const result = await renameOrganizer(c.env.DB, id, c.req.valid("json"));
    return result.ok ? c.json(result.value) : refuse(c, result);
  })
  .delete("/:id", async (c) => {
    const id = idParam(c);
    const result = id ? await deleteOrganizer(c.env.DB, id) : null;
    return result?.ok ? c.body(null, 204) : result ? refuse(c, result) : notFound(c);
  });

/** `/api/v1/foods`. */
export const foodRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const body: FoodListResponse = { items: await listFoods(c.env.DB) };
    return c.json(body);
  })
  .post("/", jsonBody(FoodInput), async (c) => {
    const result = await createFood(c.env.DB, c.req.valid("json"));
    return result.ok ? c.json(result.value, 201) : refuse(c, result);
  })
  .put("/:id", jsonBody(FoodInput), async (c) => {
    const id = idParam(c);
    if (!id) {
      return notFound(c);
    }
    const result = await updateFood(c.env.DB, id, c.req.valid("json"));
    return result.ok ? c.json(result.value) : refuse(c, result);
  })
  .delete("/:id", async (c) => {
    const id = idParam(c);
    const result = id ? await deleteFood(c.env.DB, id) : null;
    return result?.ok ? c.body(null, 204) : result ? refuse(c, result) : notFound(c);
  });

/** `/api/v1/units`. */
export const unitRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const body: UnitListResponse = { items: await listUnits(c.env.DB) };
    return c.json(body);
  })
  .post("/", jsonBody(UnitInput), async (c) => {
    const result = await createUnit(c.env.DB, c.req.valid("json"));
    return result.ok ? c.json(result.value, 201) : refuse(c, result);
  })
  .put("/:id", jsonBody(UnitInput), async (c) => {
    const id = idParam(c);
    if (!id) {
      return notFound(c);
    }
    const result = await updateUnit(c.env.DB, id, c.req.valid("json"));
    return result.ok ? c.json(result.value) : refuse(c, result);
  })
  .delete("/:id", async (c) => {
    const id = idParam(c);
    const result = id ? await deleteUnit(c.env.DB, id) : null;
    return result?.ok ? c.body(null, 204) : result ? refuse(c, result) : notFound(c);
  });

/** `/api/v1/labels`. */
export const labelRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const body: LabelListResponse = { items: await listLabels(c.env.DB) };
    return c.json(body);
  })
  .post("/", jsonBody(LabelInput), async (c) => {
    const result = await createLabel(c.env.DB, c.req.valid("json"));
    return result.ok ? c.json(result.value, 201) : refuse(c, result);
  })
  .put("/:id", jsonBody(LabelInput), async (c) => {
    const id = idParam(c);
    if (!id) {
      return notFound(c);
    }
    const result = await updateLabel(c.env.DB, id, c.req.valid("json"));
    return result.ok ? c.json(result.value) : refuse(c, result);
  })
  .delete("/:id", async (c) => {
    const id = idParam(c);
    const result = id ? await deleteLabel(c.env.DB, id) : null;
    return result?.ok ? c.body(null, 204) : result ? refuse(c, result) : notFound(c);
  });
