import { HealthResponse, MeResponse } from "@recipeflare/schema";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, fetchMe, SignedOutError, signInAgainUrl, UnreachableError } from "./client";
import { markSignedIn, useSignedOut } from "./session";

afterEach(() => {
  markSignedIn();
});

const answer = (response: Response | Error | (() => Response)) => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    if (response instanceof Error) {
      throw response;
    }
    return typeof response === "function" ? response() : response.clone();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

/** What `fetch` gives back for a redirect it was told not to follow. */
const redirectedToSignIn = () =>
  ({ type: "opaqueredirect", status: 0, ok: false }) as unknown as Response;

const signedOutNow = () => renderHook(() => useSignedOut()).result.current;

describe("a request to the API", () => {
  it("returns the answer, checked against the shared schema", async () => {
    const fetchMock = answer(Response.json({ status: "ok" }));

    expect(await api("/health", { schema: HealthResponse })).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/health",
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
  });

  it("sends a body as JSON", async () => {
    const fetchMock = answer(Response.json({ status: "ok" }));

    await api("/recipes", { method: "POST", body: { title: "Toast" }, schema: HealthResponse });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBe('{"title":"Toast"}');
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("refuses an answer in a shape the schema does not allow", async () => {
    answer(Response.json({ status: "degraded" }));

    await expect(api("/health", { schema: HealthResponse })).rejects.toThrow();
  });

  it("returns nothing for an answer with no body", async () => {
    answer(() => new Response(null, { status: 204 }));

    expect(await api("/recipes/x", { method: "DELETE" })).toBeUndefined();
  });

  it("turns a refusal into an error with the API's code, message and issues", async () => {
    answer(
      Response.json(
        {
          error: {
            code: "validation_failed",
            message: "Some of this could not be saved",
            issues: [{ path: ["title"], message: "Too short" }],
          },
        },
        { status: 400 },
      ),
    );

    const error = await api("/recipes", { method: "POST", body: {} }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "validation_failed",
      issues: [{ path: ["title"], message: "Too short" }],
    });
  });

  it("keeps the whole body of a refusal, for a conflict's current recipe", async () => {
    answer(
      Response.json(
        { error: { code: "version_conflict", message: "Changed" }, current: { id: "r1" } },
        { status: 409 },
      ),
    );

    const error = (await api("/recipes/r1", { method: "PUT", body: {} }).catch(
      (caught) => caught,
    )) as ApiError;

    expect(error.body).toMatchObject({ current: { id: "r1" } });
  });

  it("copes with a refusal that is not in the shared shape", async () => {
    answer(() => new Response("<html>Bad gateway</html>", { status: 502 }));

    const error = await api("/recipes").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: "unknown" });
  });
});

describe("a session that has run out", () => {
  it("is recognised by the redirect to the sign-in page, which is not followed", async () => {
    answer(redirectedToSignIn);

    await expect(api("/me", { schema: MeResponse })).rejects.toBeInstanceOf(SignedOutError);
    expect(signedOutNow()).toBe(true);
  });

  it("is recognised by a 401 from the API", async () => {
    answer(
      Response.json({ error: { code: "unauthenticated", message: "Sign in" } }, { status: 401 }),
    );

    await expect(api("/me", { schema: MeResponse })).rejects.toBeInstanceOf(SignedOutError);
    expect(signedOutNow()).toBe(true);
    expect(await fetchMe()).toBeNull();
  });

  it("is over as soon as a request succeeds again", async () => {
    answer(redirectedToSignIn);
    await api("/health", { schema: HealthResponse }).catch(() => {});
    expect(signedOutNow()).toBe(true);

    answer(Response.json({ status: "ok" }));
    await api("/health", { schema: HealthResponse });

    expect(signedOutNow()).toBe(false);
  });

  it("is not what a refusal or a dropped connection means", async () => {
    answer(Response.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 }));
    await api("/recipes/x").catch(() => {});
    answer(new TypeError("Failed to fetch"));
    await api("/recipes/x").catch(() => {});

    expect(signedOutNow()).toBe(false);
  });

  it("is mended by a link that comes back to the page the person was on", () => {
    expect(signInAgainUrl("/?q=apple pie&tags=holiday")).toBe(
      "/api/v1/auth/refresh?return=%2F%3Fq%3Dapple%20pie%26tags%3Dholiday",
    );
  });
});

describe("a request that never arrives", () => {
  it("is told apart from a refusal", async () => {
    answer(new TypeError("Failed to fetch"));

    await expect(api("/recipes")).rejects.toBeInstanceOf(UnreachableError);
  });

  it("is left alone when it was cancelled on purpose", async () => {
    const controller = new AbortController();
    controller.abort();
    answer(new DOMException("Aborted", "AbortError"));

    const error = await api("/recipes", { signal: controller.signal }).catch((caught) => caught);

    expect(error).not.toBeInstanceOf(UnreachableError);
  });
});
