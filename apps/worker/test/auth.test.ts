import { env, exports } from "cloudflare:workers";
import { ErrorBody, MeResponse } from "@recipeflare/schema";
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, safeReturnPath } from "../src/app";
import { isLoopback } from "../src/auth/dev";
import { displayNameFor } from "../src/auth/members";
import type { AppEnv } from "../src/auth/types";

const TEAM = "https://kitchen.cloudflareaccess.test";
const AUD = "0123456789abcdef-test-audience";
const KID = "key-1";
const APP = "https://recipeflare.test";

type Bindings = AppEnv["Bindings"];
type Keys = Awaited<ReturnType<typeof generateKeyPair>>;

let keys: Keys;
let otherKeys: Keys;
let publicJwk: JWK;

beforeAll(async () => {
  keys = await generateKeyPair("RS256", { extractable: true });
  otherKeys = await generateKeyPair("RS256", { extractable: true });
  publicJwk = { ...(await exportJWK(keys.publicKey)), kid: KID, alg: "RS256", use: "sig" };
});

// Whoever signs in first becomes the owner, so every test starts with nobody.
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM members"),
    env.DB.prepare("DELETE FROM household"),
  ]);
});

/**
 * The settings a test runs with. Nothing is taken from a developer's own
 * `.dev.vars`: every auth setting is stated here or absent.
 */
function settings(overrides: Partial<Bindings> = {}): Bindings {
  return {
    ...env,
    AUTH_PROVIDERS: undefined,
    AUTH_MODE: undefined,
    DEV_MEMBER_EMAIL: undefined,
    AUTH_AUTO_ENROLL: undefined,
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    ...overrides,
  } as Bindings;
}

/** Stands in for the team's key endpoint. */
function keyEndpoint(body: unknown = { keys: [publicJwk] }, status = 200) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

type TokenOptions = {
  claims?: Record<string, unknown>;
  issuer?: string;
  audience?: string;
  expires?: string | number;
  signWith?: Keys;
};

/** A token as Access would sign it for `email`. */
async function accessToken(email: string | null, options: TokenOptions = {}) {
  const claims = { type: "app", ...(email === null ? {} : { email }), ...options.claims };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(options.issuer ?? TEAM)
    .setAudience(options.audience ?? AUD)
    .setSubject("subject-1")
    .setIssuedAt()
    .setExpirationTime(options.expires ?? "5m")
    .sign((options.signWith ?? keys).privateKey);
}

type Ask = {
  token?: string;
  path?: string;
  origin?: string;
  method?: string;
  headers?: Record<string, string>;
  bindings?: Partial<Bindings>;
  fetchKeys?: typeof fetch;
  app?: ReturnType<typeof createApp>;
};

function ask(options: Ask = {}) {
  const app = options.app ?? createApp({ fetchKeys: options.fetchKeys ?? keyEndpoint() });
  const headers = new Headers(options.headers);
  if (options.token !== undefined) {
    headers.set("Cf-Access-Jwt-Assertion", options.token);
  }
  const request = new Request(`${options.origin ?? APP}${options.path ?? "/api/v1/me"}`, {
    method: options.method ?? "GET",
    headers,
  });
  return app.fetch(request, settings(options.bindings));
}

async function errorCode(response: Response) {
  return ErrorBody.parse(await response.json()).error.code;
}

async function signedInMember(response: Response) {
  expect(response.status).toBe(200);
  return MeResponse.parse(await response.json()).member;
}

const memberRows = () =>
  env.DB.prepare("SELECT email, role, display_name FROM members ORDER BY created_at, email").all<{
    email: string;
    role: string;
    display_name: string;
  }>();

describe("signing in through Cloudflare Access", () => {
  it("returns the signed-in member from /api/v1/me", async () => {
    const response = await ask({ token: await accessToken("ada.lovelace@example.com") });

    const member = await signedInMember(response);
    expect(member).toMatchObject({
      email: "ada.lovelace@example.com",
      displayName: "Ada Lovelace",
    });
  });

  it("makes the first person the owner and creates the household", async () => {
    const member = await signedInMember(await ask({ token: await accessToken("ada@example.com") }));

    expect(member.role).toBe("owner");
    const households = await env.DB.prepare("SELECT name, slug FROM household").all();
    expect(households.results).toEqual([{ name: "Household", slug: "household" }]);
  });

  it("adds the next person Access lets through as a member", async () => {
    await ask({ token: await accessToken("ada@example.com") });
    const member = await signedInMember(
      await ask({ token: await accessToken("grace@example.com") }),
    );

    expect(member.role).toBe("member");
    expect((await env.DB.prepare("SELECT id FROM household").all()).results).toHaveLength(1);
  });

  it("knows a returning member, however the address is capitalised", async () => {
    const first = await signedInMember(await ask({ token: await accessToken("ada@example.com") }));
    const again = await signedInMember(await ask({ token: await accessToken("Ada@Example.com") }));

    expect(again).toEqual(first);
    expect((await memberRows()).results).toHaveLength(1);
  });

  it("gives one owner when two people arrive first at the same moment", async () => {
    const app = createApp({ fetchKeys: keyEndpoint() });
    const responses = await Promise.all([
      ask({ app, token: await accessToken("ada@example.com") }),
      ask({ app, token: await accessToken("grace@example.com") }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const roles = (await memberRows()).results.map((row) => row.role).sort();
    expect(roles).toEqual(["member", "owner"]);
    expect((await env.DB.prepare("SELECT id FROM household").all()).results).toHaveLength(1);
  });

  it("with AUTH_AUTO_ENROLL off, admits the first person and nobody new after", async () => {
    const bindings = { AUTH_AUTO_ENROLL: "false" };
    const owner = await ask({ bindings, token: await accessToken("ada@example.com") });
    const stranger = await ask({ bindings, token: await accessToken("grace@example.com") });
    const ownerAgain = await ask({ bindings, token: await accessToken("ada@example.com") });

    expect((await signedInMember(owner)).role).toBe("owner");
    expect(stranger.status).toBe(403);
    expect(await errorCode(stranger)).toBe("not_a_member");
    expect(ownerAgain.status).toBe(200);
    expect((await memberRows()).results).toHaveLength(1);
  });

  it("refuses a member who has been disabled", async () => {
    await ask({ token: await accessToken("ada@example.com") });
    await env.DB.prepare("UPDATE members SET disabled_at = ?1 WHERE email = ?2")
      .bind("2026-11-23T00:00:00.000Z", "ada@example.com")
      .run();

    const response = await ask({ token: await accessToken("ada@example.com") });

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("member_disabled");
  });

  it("fetches the team's keys once and keeps them", async () => {
    const fetchKeys = keyEndpoint();
    const app = createApp({ fetchKeys });

    await ask({ app, token: await accessToken("ada@example.com") });
    await ask({ app, token: await accessToken("ada@example.com") });

    expect(fetchKeys).toHaveBeenCalledTimes(1);
    expect(String(fetchKeys.mock.calls[0]?.[0])).toBe(`${TEAM}/cdn-cgi/access/certs`);
  });

  it("accepts a team domain written with a trailing slash or without its scheme", async () => {
    const token = await accessToken("ada@example.com");
    const slash = await ask({ token, bindings: { ACCESS_TEAM_DOMAIN: `${TEAM}/` } });
    const bare = await ask({
      token,
      bindings: { ACCESS_TEAM_DOMAIN: TEAM.replace("https://", "") },
    });

    expect(slash.status).toBe(200);
    expect(bare.status).toBe(200);
  });
});

describe("a request Access did not sign properly", () => {
  async function refused(response: Response) {
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("unauthenticated");
    expect((await memberRows()).results).toHaveLength(0);
  }

  it("is refused with no token", async () => {
    await refused(await ask());
  });

  it("is refused with an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    await refused(await ask({ token: await accessToken("ada@example.com", { expires: past }) }));
  });

  it("is refused with a token for another application", async () => {
    await refused(
      await ask({ token: await accessToken("ada@example.com", { audience: "another-app" }) }),
    );
  });

  it("is refused with a token from another team", async () => {
    await refused(
      await ask({
        token: await accessToken("ada@example.com", {
          issuer: "https://elsewhere.cloudflareaccess.test",
        }),
      }),
    );
  });

  it("is refused with a token signed by a key that is not the team's", async () => {
    await refused(
      await ask({ token: await accessToken("ada@example.com", { signWith: otherKeys }) }),
    );
  });

  it("is refused with a token that names a key the team does not have", async () => {
    const token = await new SignJWT({ email: "ada@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "no-such-key" })
      .setIssuer(TEAM)
      .setAudience(AUD)
      .setExpirationTime("5m")
      .sign(keys.privateKey);

    await refused(await ask({ token }));
  });

  it("is refused with an unsigned token", async () => {
    const encode = (value: object) =>
      btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const exp = Math.floor(Date.now() / 1000) + 300;
    const token = `${encode({ alg: "none", kid: KID })}.${encode({
      email: "ada@example.com",
      iss: TEAM,
      aud: AUD,
      exp,
    })}.`;

    await refused(await ask({ token }));
  });

  it("is refused with a token signed with a shared secret instead of the team's key", async () => {
    const token = await new SignJWT({ email: "ada@example.com" })
      .setProtectedHeader({ alg: "HS256", kid: KID })
      .setIssuer(TEAM)
      .setAudience(AUD)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("a-secret-that-is-long-enough-for-hs256"));

    await refused(await ask({ token }));
  });

  it("is refused with a token that never expires", async () => {
    const token = await new SignJWT({ email: "ada@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setIssuer(TEAM)
      .setAudience(AUD)
      .sign(keys.privateKey);

    await refused(await ask({ token }));
  });

  it("is refused when the token is not a token", async () => {
    await refused(await ask({ token: "not-a-token" }));
  });

  it("is refused with 403 when the token carries no email address", async () => {
    const response = await ask({
      token: await accessToken(null, { claims: { common_name: "x" } }),
    });

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("not_a_member");
  });

  it("does not fall back to the dev sign-in when the token is bad", async () => {
    const response = await ask({
      origin: "http://localhost:8787",
      token: "not-a-token",
      bindings: { AUTH_MODE: "dev", DEV_MEMBER_EMAIL: "cook@example.com" },
    });

    expect(response.status).toBe(401);
  });
});

describe("when sign-in cannot be checked", () => {
  it("answers 503, not 401, when the team's keys cannot be fetched", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await ask({
      token: await accessToken("ada@example.com"),
      fetchKeys: keyEndpoint({ error: "down" }, 500),
    });

    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("auth_unavailable");
  });

  it("answers 500 when the Access settings are missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const bindings of [{ ACCESS_TEAM_DOMAIN: undefined }, { ACCESS_AUD: " " }]) {
      const response = await ask({ token: await accessToken("ada@example.com"), bindings });

      expect(response.status).toBe(500);
      expect(await errorCode(response)).toBe("auth_not_configured");
    }
  });

  it("answers 500 when AUTH_PROVIDERS names a provider that does not exist", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await ask({
      token: await accessToken("ada@example.com"),
      bindings: { AUTH_PROVIDERS: "access,carrier-pigeon" },
    });

    expect(response.status).toBe(500);
    expect(await errorCode(response)).toBe("auth_not_configured");
  });

  it("ignores an Access token when the access provider is switched off", async () => {
    const response = await ask({
      token: await accessToken("ada@example.com"),
      bindings: { AUTH_PROVIDERS: "" },
    });

    expect(response.status).toBe(401);
  });
});

describe("the dev sign-in", () => {
  const dev = { AUTH_MODE: "dev", DEV_MEMBER_EMAIL: "Cook@Example.com" };

  it.each([
    "http://localhost:8787",
    "http://localhost:5173",
    "http://127.0.0.1:8787",
    "http://[::1]:8787",
  ])("signs in the person named in .dev.vars on %s", async (origin) => {
    const member = await signedInMember(await ask({ origin, bindings: dev }));

    expect(member).toMatchObject({ email: "cook@example.com", role: "owner" });
  });

  it.each([
    APP,
    "https://localhost.example.com",
    "https://recipeflare.example.workers.dev",
    "http://192.168.1.20:5173",
  ])("is refused off localhost, on %s", async (origin) => {
    const response = await ask({ origin, bindings: dev });

    expect(response.status).toBe(401);
    expect((await memberRows()).results).toHaveLength(0);
  });

  it("is off unless AUTH_MODE is dev", async () => {
    const response = await ask({
      origin: "http://localhost:8787",
      bindings: { DEV_MEMBER_EMAIL: "cook@example.com" },
    });

    expect(response.status).toBe(401);
  });

  it("is off when no one is named", async () => {
    const response = await ask({
      origin: "http://localhost:8787",
      bindings: { AUTH_MODE: "dev", DEV_MEMBER_EMAIL: " " },
    });

    expect(response.status).toBe(401);
  });

  it("knows a loopback hostname from one that only looks like it", () => {
    expect(
      ["localhost", "app.localhost", "127.0.0.1", "127.8.9.10", "[::1]"].map(isLoopback),
    ).toEqual([true, true, true, true, true]);
    expect(
      ["localhost.example.com", "notlocalhost", "128.0.0.1", "127.0.0.1.example.com", "::1"].map(
        isLoopback,
      ),
    ).toEqual([false, false, false, false, false]);
  });
});

describe("what needs a member and what does not", () => {
  it("leaves the health route open", async () => {
    const response = await ask({ path: "/api/v1/health" });

    expect(response.status).toBe(200);
  });

  it("asks for sign-in before saying whether a path exists", async () => {
    const unknown = await ask({ path: "/api/v1/nope" });
    const known = await ask({ path: "/api/v1/nope", token: await accessToken("ada@example.com") });

    expect(unknown.status).toBe(401);
    expect(known.status).toBe(404);
    expect(await errorCode(known)).toBe("not_found");
  });

  it("refuses an unsigned request to the Worker as it is deployed", async () => {
    const response = await exports.default.fetch(`${APP}/api/v1/me`);

    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("unauthenticated");
  });
});

describe("a change sent from another site", () => {
  const post = async (headers: Record<string, string>) =>
    ask({
      method: "POST",
      path: "/api/v1/nope",
      headers,
      token: await accessToken("ada@example.com"),
    });

  it("is refused when it is a plain form post", async () => {
    const response = await post({
      "Sec-Fetch-Site": "cross-site",
      "Content-Type": "application/x-www-form-urlencoded",
    });

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("cross_site_request");
    // Refused before anyone is looked up or added.
    expect((await memberRows()).results).toHaveLength(0);
  });

  it("is refused when it says nothing about where it came from or what it carries", async () => {
    expect((await post({})).status).toBe(403);
    expect((await post({ "Content-Type": "text/plain" })).status).toBe(403);
    expect((await post({ "Sec-Fetch-Site": "same-site" })).status).toBe(403);
  });

  it("gets through from the app's own origin", async () => {
    // 404: past the check, and there is no such route.
    expect((await post({ "Sec-Fetch-Site": "same-origin" })).status).toBe(404);
  });

  it("gets through with a body a cross-site form cannot send", async () => {
    expect((await post({ "Content-Type": "application/json; charset=utf-8" })).status).toBe(404);
    expect((await post({ "Content-Type": "image/jpeg" })).status).toBe(404);
  });

  it("does not apply to reading", async () => {
    const response = await ask({
      headers: { "Sec-Fetch-Site": "cross-site" },
      token: await accessToken("ada@example.com"),
    });

    expect(response.status).toBe(200);
  });
});

describe("a new member's display name", () => {
  it("is made from the address until they change it", () => {
    expect(displayNameFor("ada.lovelace@example.com")).toBe("Ada Lovelace");
    expect(displayNameFor("grace_hopper-jr+recipes@example.com")).toBe("Grace Hopper Jr");
    expect(displayNameFor("cook@example.com")).toBe("Cook");
    expect(displayNameFor("@example.com")).toBe("@example.com");
  });
});

describe("signing in again", () => {
  const refresh = async (returnTo: string, token?: string) =>
    ask({ path: `/api/v1/auth/refresh?return=${encodeURIComponent(returnTo)}`, token });

  it("sends a signed-in browser back to the page it came from", async () => {
    const response = await refresh(
      "/?q=apple pie&tags=holiday",
      await accessToken("ada@example.com"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/?q=apple pie&tags=holiday");
  });

  it("is behind sign-in like everything else, which is what brings the sign-in page up", async () => {
    expect((await refresh("/")).status).toBe(401);
  });

  it("never sends anyone to another site", async () => {
    const token = await accessToken("ada@example.com");
    for (const elsewhere of [
      "https://example.com/",
      "//example.com/",
      "/\\example.com/",
      "\\example.com",
      "javascript:alert(1)",
      "example.com",
      "/ok\nSet-Cookie: x=1",
      "",
    ]) {
      const response = await refresh(elsewhere, token);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");
    }
    expect(safeReturnPath(undefined)).toBe("/");
    expect(safeReturnPath("/recipes/apple-pie?scale=2")).toBe("/recipes/apple-pie?scale=2");
  });
});
