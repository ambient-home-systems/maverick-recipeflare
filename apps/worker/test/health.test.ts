import { exports } from "cloudflare:workers";
import { ErrorBody, HealthResponse } from "@recipeflare/schema";
import { describe, expect, it } from "vitest";

describe("GET /api/v1/health", () => {
  it("answers ok in the shared shape", async () => {
    const response = await exports.default.fetch("https://recipeflare.test/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(HealthResponse.parse(await response.json())).toEqual({ status: "ok" });
  });
});

describe("a path outside the app's own API", () => {
  it("answers 404 with the shared error body", async () => {
    // Bare /api paths are kept for Phase 4. Unknown paths under /api/v1 are covered in auth.test.ts.
    const response = await exports.default.fetch("https://recipeflare.test/api/nope");

    expect(response.status).toBe(404);
    expect(ErrorBody.parse(await response.json()).error.code).toBe("not_found");
  });
});
