import type { ErrorBody, FieldIssue } from "@recipeflare/schema";
import type { Context, MiddlewareHandler } from "hono";
import { validator } from "hono/validator";
import type { z } from "zod";
import type { AppEnv } from "./auth/types";

/** The shared error body, for any refusal. */
export function errorBody(code: string, message: string, issues?: FieldIssue[]): ErrorBody {
  return { error: issues ? { code, message, issues } : { code, message } };
}

export const notFound = (c: Context) => c.json(errorBody("not_found", "Not found"), 404);

/** What a 400 for a request that does not fit its schema says, with one issue per field. */
export function invalid(c: Context, issues: FieldIssue[]) {
  return c.json(errorBody("validation_failed", "Some of this could not be saved", issues), 400);
}

/** Zod's issues as the API reports them: the field's path and what is wrong with it. */
export function fieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter(
      (part): part is string | number => typeof part === "string" || typeof part === "number",
    ),
    message: issue.message,
  }));
}

/**
 * Checks a request's JSON body against a shared schema before the handler
 * runs. The handler reads the parsed value with `c.req.valid("json")`.
 *
 * The declared type says what the typed client may send (the schema's input,
 * where a field with a default can be left out) and what the handler gets (its
 * output). Hono's own `validator` would give the client the output type.
 */
export function jsonBody<T extends z.ZodType, P extends string = string>(
  schema: T,
): MiddlewareHandler<AppEnv, P, { in: { json: z.input<T> }; out: { json: z.output<T> } }> {
  return validator("json", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return invalid(c, fieldIssues(parsed.error));
    }
    return parsed.data;
  }) as never;
}

/** The same for the query string, where every value arrives as text. Read it with `c.req.valid("query")`. */
export function queryParams<T extends z.ZodType, P extends string = string>(
  schema: T,
): MiddlewareHandler<
  AppEnv,
  P,
  { in: { query: { [K in keyof z.input<T>]?: string } }; out: { query: z.output<T> } }
> {
  return validator("query", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return invalid(c, fieldIssues(parsed.error));
    }
    return parsed.data;
  }) as never;
}
