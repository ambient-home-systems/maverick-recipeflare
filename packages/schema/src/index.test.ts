import { describe, expect, it } from "vitest";
import { ErrorBody, HealthResponse } from "./index";

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
