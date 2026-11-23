import {
  ErrorBody,
  type FieldIssue,
  HealthResponse,
  type Member,
  MeResponse,
} from "@recipeflare/schema";
import type { z } from "zod";
import { markSignedIn, markSignedOut } from "./session";

/**
 * Base URL of the API. Empty means the same origin as the app. It is a setting
 * so that a native wrapper can point the app at a household's server later.
 */
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

/** The API refused a request and said why, in the shared error body. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: FieldIssue[];
  /** The whole response body, for an error that carries more: a conflict's current recipe. */
  readonly body: unknown;

  constructor(status: number, code: string, message: string, issues: FieldIssue[], body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.body = body;
  }
}

/** The sign-in session has run out. Nothing is wrong with the request; the person must sign in again. */
export class SignedOutError extends Error {
  constructor() {
    super("Signed out");
    this.name = "SignedOutError";
  }
}

/** The request never reached the server: no connection, or the server is down. */
export class UnreachableError extends Error {
  constructor(cause: unknown) {
    super("The server could not be reached", { cause });
    this.name = "UnreachableError";
  }
}

type RequestOptions<T extends z.ZodType> = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
  /** The shape of a successful answer. Left out for a request that answers with no body. */
  schema?: T;
  signal?: AbortSignal;
};

/**
 * One request to the API. The answer is checked against the shared schema, so
 * the rest of the app never holds data in a shape it does not expect.
 *
 * It throws `SignedOutError` when the session has run out, `UnreachableError`
 * when the server could not be reached, and `ApiError` for anything the API
 * refused.
 */
export async function api<T extends z.ZodType>(
  path: string,
  options: RequestOptions<T> = {},
): Promise<z.output<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1${path}`, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      // When the session runs out, Cloudflare Access answers every request with
      // a redirect to its login page on another origin. Followed, that fails
      // like a dropped connection. Unfollowed, it can be told apart.
      redirect: "manual",
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    throw new UnreachableError(error);
  }

  if (response.type === "opaqueredirect" || response.status === 401) {
    markSignedOut();
    throw new SignedOutError();
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = ErrorBody.safeParse(body);
    throw parsed.success
      ? new ApiError(
          response.status,
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.issues ?? [],
          body,
        )
      : new ApiError(
          response.status,
          "unknown",
          `The server answered ${response.status}`,
          [],
          body,
        );
  }
  markSignedIn();
  if (!options.schema) {
    return undefined as z.output<T>;
  }
  return options.schema.parse(await response.json());
}

/** Where "Sign in again" leads: through the sign-in page and back to `returnTo`, a path in the app. */
export function signInAgainUrl(returnTo: string): string {
  return `${API_BASE}/api/v1/auth/refresh?return=${encodeURIComponent(returnTo)}`;
}

/** The health route is open to anyone, so it says only whether the API can be reached. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/api/v1/health`, { signal });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return HealthResponse.parse(await response.json());
}

/** The signed-in member, or `null` when nobody is signed in. */
export async function fetchMe(signal?: AbortSignal): Promise<Member | null> {
  try {
    return (await api("/me", { schema: MeResponse, signal })).member;
  } catch (error) {
    if (error instanceof SignedOutError) {
      return null;
    }
    throw error;
  }
}
