import type { ErrorBody, HealthResponse, MeResponse } from "@recipeflare/schema";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireMember, sameOriginWrites } from "./auth/middleware";
import type { AppEnv } from "./auth/types";
import { errorBody } from "./http";
import { foodRoutes, labelRoutes, organizerRoutes, unitRoutes } from "./routes/lists";
import { recipeRoutes } from "./routes/recipes";

/**
 * A path within this app, and nothing else: a redirect must never be made to
 * lead to another site. Anything that is not plainly a path becomes the home page.
 */
export function safeReturnPath(value: string | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  // A control character has no place in a path, and browsers disagree about what one means.
  for (const character of value) {
    if (character < " ") {
      return "/";
    }
  }
  return value;
}

export type AppOptions = {
  /** How the Access provider fetches its public keys. Tests pass a stub. */
  fetchKeys?: typeof fetch;
};

/**
 * Builds the Worker's app. Everything under `/api/v1` except the health route
 * is behind the auth middleware, so a route added below it has a member on its
 * context and never looks at headers, cookies or tokens itself.
 */
export function createApp(options: AppOptions = {}) {
  /** The app's own API. Bare `/api/...` paths are reserved for Phase 4. */
  const v1 = new Hono<AppEnv>()
    .get("/health", (c) => {
      const body: HealthResponse = { status: "ok" };
      return c.json(body);
    })
    // Middleware covers the routes registered after it: everything below is signed in.
    .use(sameOriginWrites)
    .use(requireMember({ fetchKeys: options.fetchKeys }))
    .get("/me", (c) => {
      const body: MeResponse = { member: c.get("member") };
      return c.json(body);
    })
    // Where "Sign in again" leads. A browser arriving here with no session is
    // shown the sign-in page by Cloudflare Access before the request gets this
    // far; once signed in, it is sent back to the page it came from.
    .get("/auth/refresh", (c) => c.redirect(safeReturnPath(c.req.query("return")), 302))
    .route("/recipes", recipeRoutes)
    .route("/organizers", organizerRoutes)
    .route("/foods", foodRoutes)
    .route("/units", unitRoutes)
    .route("/labels", labelRoutes);

  const app = new Hono<AppEnv>().route("/api/v1", v1);

  app.notFound((c) => {
    const body: ErrorBody = { error: { code: "not_found", message: "Not found" } };
    return c.json(body, 404);
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      // Raised by Hono itself, for a body that is not the JSON it claims to be.
      return c.json(errorBody("bad_request", err.message || "Bad request"), err.status);
    }
    console.error(err);
    const body: ErrorBody = { error: { code: "internal_error", message: "Something went wrong" } };
    return c.json(body, 500);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
