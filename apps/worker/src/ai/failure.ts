import type { AiFailureReason } from "@recipeflare/schema";

/**
 * A model call that gave no answer. `retryable` says whether asking again
 * later could work; `reason` is for the app to explain.
 */
export class AiFailure extends Error {
  readonly reason: AiFailureReason;
  readonly retryable: boolean;

  constructor(
    reason: AiFailureReason,
    retryable: boolean,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AiFailure";
    this.reason = reason;
    this.retryable = retryable;
  }
}

/**
 * What the service's own error codes mean for us. The binding throws an error
 * whose message starts with the code: "5028: ... was deprecated on ...".
 *
 * Workers AI's codes: developers.cloudflare.com/workers-ai/platform/errors/.
 * AI Gateway's: developers.cloudflare.com/ai-gateway/reference/troubleshooting/.
 * Read on 23 Nov 2026.
 */
const BY_CODE: Record<string, [reason: AiFailureReason, retryable: boolean]> = {
  // Timed out, aborted, or no capacity just now.
  "3007": ["unavailable", true],
  "3008": ["unavailable", true],
  "3040": ["unavailable", true],
  // The gateway's rate limit for credit-billed requests, and its credit service being down.
  "2018": ["unavailable", true],
  "7005": ["unavailable", true],
  // The account's free daily use, or its credit, is used up.
  "3036": ["limit", false],
  "2052": ["limit", false],
  "2021": ["limit", false],
  // No such model, a retired one, or one this account may not use.
  "5007": ["model", false],
  "3042": ["model", false],
  "5028": ["model", false],
  "5035": ["model", false],
  "5018": ["model", false],
  "3041": ["model", false],
  "5016": ["model", false],
  "3023": ["model", false],
  "2042": ["model", false],
  "2036": ["model", false],
  "2049": ["model", false],
  "2044": ["model", false],
  "2009": ["model", false],
  // The request was not acceptable.
  "7003": ["request", false],
  "5004": ["request", false],
  "3003": ["request", false],
  "3006": ["request", false],
};

/** By HTTP status, for an error whose code is not in the table. */
function byStatus(status: number): [AiFailureReason, boolean] | null {
  if (status === 408 || status === 429 || status >= 500) {
    return ["unavailable", true];
  }
  if (status === 402) {
    return ["limit", false];
  }
  if (status === 403 || status === 404 || status === 410) {
    return ["model", false];
  }
  if (status === 400 || status === 413) {
    return ["request", false];
  }
  return null;
}

/**
 * Turns whatever a model call threw into an `AiFailure`.
 *
 * `status` is the HTTP status of the call, when the binding reports one. An
 * error nobody foresaw counts as worth another try: the queue's own retry
 * limit stops it going on for ever.
 */
export function classifyFailure(error: unknown, status?: number | null): AiFailure {
  if (error instanceof AiFailure) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  const cause = { cause: error };

  if (name === "TimeoutError" || name === "AbortError") {
    return new AiFailure("unavailable", true, "The model took too long to answer.", cause);
  }
  // The service gave up on returning the schema. The runner asks once more.
  if (/JSON Mode couldn't be met/i.test(message)) {
    return new AiFailure("bad_answer", false, message, cause);
  }
  // A gateway spend limit answers 429 like a rate limit does, but waiting a
  // minute does not lift it: it lasts until its window ends.
  if (/spend limit|budget/i.test(message)) {
    return new AiFailure("limit", false, message, cause);
  }
  const code = /(?:^|\s)(\d{4}):/.exec(message)?.[1];
  const known = (code ? BY_CODE[code] : undefined) ?? (status ? byStatus(status) : null);
  if (known) {
    return new AiFailure(known[0], known[1], message, cause);
  }
  return new AiFailure("unavailable", true, message || "The model could not be reached.", cause);
}
