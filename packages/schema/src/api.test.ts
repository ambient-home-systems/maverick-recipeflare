import { describe, expect, it } from "vitest";
import { ErrorBody, HealthResponse } from "./api";

describe("HealthResponse", () => {
  it("accepts the health body", () => {
    expect(HealthResponse.parse({ status: "ok" })).toEqual({ status: "ok" });
  });

  it("rejects any other status", () => {
    expect(HealthResponse.safeParse({ status: "degraded" }).success).toBe(false);
  });
});

describe("ErrorBody", () => {
  it("accepts a code and a message", () => {
    const body = { error: { code: "not_found", message: "Not found" } };
    expect(ErrorBody.parse(body)).toEqual(body);
  });

  it("rejects a body without a code", () => {
    expect(ErrorBody.safeParse({ error: { message: "Not found" } }).success).toBe(false);
  });
});

describe("ErrorBody issues", () => {
  it("carries field issues with a path", () => {
    const body = {
      error: {
        code: "invalid_request",
        message: "The recipe is not valid",
        issues: [{ path: ["stepSections", 0, "steps", 2, "text"], message: "Required" }],
      },
    };
    expect(ErrorBody.parse(body)).toEqual(body);
  });
});
