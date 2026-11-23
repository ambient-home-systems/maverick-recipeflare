import type { ErrorBody, Member } from "@recipeflare/schema";

/**
 * Settings the auth code reads. Every one is optional: a secret or a local
 * variable, never part of wrangler.jsonc, so the generated `Env` may lack it.
 */
export type AuthSettings = {
  /** Comma-separated providers that are on. Defaults to `access`. */
  AUTH_PROVIDERS?: string;
  /** `dev` turns the dev provider on, on localhost only. Lives in `.dev.vars`. */
  AUTH_MODE?: string;
  /** Who the dev provider signs in. Lives in `.dev.vars`. */
  DEV_MEMBER_EMAIL?: string;
  /** The Access team domain, such as `https://<team>.cloudflareaccess.com`. A Worker secret. */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's audience tag. A Worker secret. */
  ACCESS_AUD?: string;
  /** `false` stops people the provider lets through from becoming members by themselves. */
  AUTH_AUTO_ENROLL?: string;
};

export type AppEnv = {
  Bindings: Env & AuthSettings;
  Variables: {
    /** The signed-in member. Set by the auth middleware; route handlers read identity from here only. */
    member: Member;
  };
};

/** Who a provider says is asking. Later providers will yield a member ID instead. */
export type Identity = { email: string };

/**
 * One way of signing in. It looks at the whole request and answers with an
 * identity, with `null` when the request is not its kind, or by throwing an
 * `AuthError` when the request is its kind and must be refused.
 */
export type IdentityProvider = {
  name: string;
  identify(request: Request, env: AppEnv["Bindings"]): Promise<Identity | null>;
};

type AuthStatus = 401 | 403 | 500 | 503;

/** A refusal, carried to the middleware, which turns it into the shared error body. */
export class AuthError extends Error {
  readonly status: AuthStatus;
  readonly code: string;

  constructor(status: AuthStatus, code: string, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }

  body(): ErrorBody {
    return { error: { code: this.code, message: this.message } };
  }
}

export const notSignedIn = () => new AuthError(401, "unauthenticated", "Sign in to continue");
