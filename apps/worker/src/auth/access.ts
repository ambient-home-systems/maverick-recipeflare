import { createRemoteJWKSet, customFetch, errors, jwtVerify } from "jose";
import { AuthError, type IdentityProvider, notSignedIn } from "./types";

type KeySet = ReturnType<typeof createRemoteJWKSet>;

/** The team domain as Access writes it in a token's issuer: with its scheme, without a trailing slash. */
function teamIssuer(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim().replace(/\/+$/, "");
  if (trimmed === "") {
    return null;
  }
  return /^https:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** True when the token itself is at fault, as opposed to our fetching of the keys. */
function isBadToken(error: unknown): boolean {
  return (
    error instanceof errors.JWTExpired ||
    error instanceof errors.JWTClaimValidationFailed ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JWKSNoMatchingKey ||
    error instanceof errors.JWKSMultipleMatchingKeys ||
    error instanceof errors.JOSEAlgNotAllowed ||
    error instanceof errors.JOSENotSupported
  );
}

/**
 * Cloudflare Access. Access signs a token for each request it lets through and
 * sends it in `Cf-Access-Jwt-Assertion`. The token is checked here even though
 * Access is in front: its signature, issuer, audience and expiry.
 *
 * The provider keeps the team's public keys for as long as it lives, which is
 * as long as the Worker instance does. `jose` fetches them again when they are
 * ten minutes old or when a token names a key it has not seen, which is how a
 * key rotation is picked up.
 */
export function accessProvider(fetchKeys?: typeof fetch): IdentityProvider {
  const keySets = new Map<string, KeySet>();

  const keysFor = (issuer: string): KeySet => {
    let keys = keySets.get(issuer);
    if (!keys) {
      const url = new URL(`${issuer}/cdn-cgi/access/certs`);
      keys = createRemoteJWKSet(url, fetchKeys ? { [customFetch]: fetchKeys } : undefined);
      keySets.set(issuer, keys);
    }
    return keys;
  };

  return {
    name: "access",
    async identify(request, env) {
      const token = request.headers.get("Cf-Access-Jwt-Assertion");
      if (!token) {
        return null;
      }

      const issuer = teamIssuer(env.ACCESS_TEAM_DOMAIN);
      const audience = (env.ACCESS_AUD ?? "").trim();
      if (!issuer || audience === "") {
        console.error("auth: ACCESS_TEAM_DOMAIN or ACCESS_AUD is not set");
        throw new AuthError(500, "auth_not_configured", "Sign-in is not set up on this server");
      }

      let email: unknown;
      try {
        const { payload } = await jwtVerify(token, keysFor(issuer), {
          issuer,
          audience,
          algorithms: ["RS256"],
          requiredClaims: ["exp"],
        });
        email = payload.email;
      } catch (error) {
        if (isBadToken(error)) {
          throw notSignedIn();
        }
        // The keys could not be fetched. That is not the caller's doing, so it is not a 401.
        console.error("auth: could not check an Access token", error);
        throw new AuthError(503, "auth_unavailable", "Sign-in could not be checked. Try again");
      }

      // A service token has no email. Those get their own provider in Phase 3.
      if (typeof email !== "string" || email.trim() === "") {
        throw new AuthError(403, "not_a_member", "This sign-in is not a member of the household");
      }
      return { email };
    },
  };
}
