import type { ErrorBody, HealthResponse } from "@recipeflare/schema";
import { Hono } from "hono";

type AppEnv = { Bindings: Env };

/** The app's own API. Bare `/api/...` paths are reserved for Phase 4. */
const v1 = new Hono<AppEnv>().get("/health", (c) => {
  const body: HealthResponse = { status: "ok" };
  return c.json(body);
});

const app = new Hono<AppEnv>().route("/api/v1", v1);

app.notFound((c) => {
  const body: ErrorBody = { error: { code: "not_found", message: "Not found" } };
  return c.json(body, 404);
});

app.onError((err, c) => {
  console.error(err);
  const body: ErrorBody = { error: { code: "internal_error", message: "Something went wrong" } };
  return c.json(body, 500);
});

export type AppType = typeof app;
export default app;
