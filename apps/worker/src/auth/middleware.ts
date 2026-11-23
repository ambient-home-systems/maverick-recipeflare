import { createMiddleware } from "hono/factory";
import { accessProvider } from "./access";
import { devProvider } from "./dev";
import { memberForEmail } from "./members";
import { type AppEnv, AuthError, type IdentityProvider, notSignedIn } from "./types";

/** Providers that `AUTH_PROVIDERS` can name. Passkeys and API tokens join this list in later phases. */
type Listed = { access: IdentityProvider };

function listedProviders(setting: string | undefined, listed: Listed): IdentityProvider[] {
  const names = (setting ?? "access")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  return names.map((name) => {
    if (name in listed) {
      return listed[name as keyof Listed];
    }
    console.error(`auth: AUTH_PROVIDERS names an unknown provider "${name}"`);
    throw new AuthError(500, "auth_not_configured", "Sign-in is not set up on this server");
  });
}

/**
 * The one place identity is read. Asks each provider in turn who is making the
 * request, turns the first answer into a household member, and puts that
 * member on the request context. No answer is a 401.
 *
 * `fetchKeys` is how the Access provider fetches its public keys; tests pass a stub.
 */
export function requireMember(options: { fetchKeys?: typeof fetch } = {}) {
  const listed: Listed = { access: accessProvider(options.fetchKeys) };

  return createMiddleware<AppEnv>(async (c, next) => {
    try {
      // The dev provider is not in the list: it switches itself on, on localhost only.
      const providers = [...listedProviders(c.env.AUTH_PROVIDERS, listed), devProvider];
      for (const provider of providers) {
        const identity = await provider.identify(c.req.raw, c.env);
        if (identity) {
          const member = await memberForEmail(c.env.DB, identity.email, {
            autoEnroll: c.env.AUTH_AUTO_ENROLL !== "false",
          });
          c.set("member", member);
          return next();
        }
      }
      throw notSignedIn();
    } catch (error) {
      if (error instanceof AuthError) {
        return c.json(error.body(), error.status);
      }
      throw error;
    }
  });
}

const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Content types a page on another site cannot send without asking first. */
function isScriptOnlyBody(contentType: string | undefined): boolean {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return (
    type === "application/json" ||
    type === "application/octet-stream" ||
    type.startsWith("image/") ||
    type === "application/pdf"
  );
}

/**
 * Refuses a change that another site could have made the browser send. The
 * Access cookie travels with any request to this hostname, so a form on
 * another site must not be able to ride it.
 *
 * A change gets through if the browser says it came from this origin, or if
 * its body is a kind that a cross-site form cannot send.
 */
export const sameOriginWrites = createMiddleware<AppEnv>(async (c, next) => {
  if (
    READS.has(c.req.method) ||
    c.req.header("Sec-Fetch-Site") === "same-origin" ||
    isScriptOnlyBody(c.req.header("Content-Type"))
  ) {
    return next();
  }
  const error = new AuthError(403, "cross_site_request", "This request did not come from the app");
  return c.json(error.body(), error.status);
});
