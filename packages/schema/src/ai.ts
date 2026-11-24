import { z } from "zod";
import { LIMITS } from "./primitives";

/**
 * The jobs a model does in an import, as docs/phase-2-plan.md §4 names them.
 * Which model does each is a setting; see the Worker's `ai/profiles.ts`.
 */
export const AiTask = z.enum(["read", "build", "details", "translate"]);
export type AiTask = z.infer<typeof AiTask>;

/** Why a model call did not give an answer, in words the app can act on. */
export const AiFailureReason = z.enum([
  /** The model could not be reached, timed out or was busy. Trying again later may work. */
  "unavailable",
  /** An allowance is used up: the account's free daily use, its credit, or the gateway's spend limit. */
  "limit",
  /** The model named does not exist, has been retired, or this account may not use it. */
  "model",
  /** The request itself was turned down: too large, or not in a shape the model takes. */
  "request",
  /** The model declined to answer. */
  "refused",
  /** The model answered, and the answer was not what was asked for, twice running. */
  "bad_answer",
  /** A setting names something that does not exist, such as a profile. */
  "settings",
]);
export type AiFailureReason = z.infer<typeof AiFailureReason>;

/** Body of `POST /ai/check`. `model` tries one model by its ID in place of the profile's. */
export const AiCheckRequest = z.object({
  task: AiTask.default("build"),
  model: z.string().trim().min(1).max(200).optional(),
});
export type AiCheckRequest = z.infer<typeof AiCheckRequest>;

/** How many tokens a call read and wrote, when the model says. */
export const AiUsage = z.object({
  inputTokens: z.int().min(0),
  outputTokens: z.int().min(0),
  /** How many of the tokens written were the model reasoning, when it says. */
  reasoningTokens: z.int().min(0).nullable().default(null),
});
export type AiUsage = z.infer<typeof AiUsage>;

const checked = {
  /** The profile in use, by name. */
  profile: z.string(),
  task: AiTask,
  /** The model that was asked. */
  requested: z.string(),
};

/** What `POST /ai/check` answers: which model answered and how long it took, or why none did. */
export const AiCheckResponse = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    ...checked,
    /** The model that answered, as the service names it. */
    model: z.string(),
    milliseconds: z.int().min(0),
    usage: AiUsage.nullable(),
    /** The gateway's record of the call, to look up in the dashboard. */
    logId: z.string().nullable(),
    /** How many times the model was asked before its answer fitted. */
    tries: z.int().min(1),
  }),
  z.object({
    ok: z.literal(false),
    ...checked,
    reason: AiFailureReason,
    /** Whether an import that failed this way would be tried again by itself. */
    retryable: z.boolean(),
    message: z.string(),
  }),
]);
export type AiCheckResponse = z.infer<typeof AiCheckResponse>;

/**
 * What a model read from one ingredient line the rules could not read: an
 * amount, and the unit, the food and the note in the line's own words. Each
 * has been checked against the line; what the line does not state is null.
 * Names are matched to the household's own with `matchReading()`.
 */
export const IngredientReading = z.object({
  quantity: z.number().positive().nullable(),
  unitName: z.string().nullable(),
  foodName: z.string().nullable(),
  note: z.string(),
});
export type IngredientReading = z.infer<typeof IngredientReading>;

/** How many lines one request may ask a model to read. */
export const AI_LINES_AT_ONCE = 30;

/** Body of `POST /ai/ingredients`: lines as written, for a model to read. */
export const ReadIngredientsRequest = z.object({
  lines: z
    .array(z.string().trim().min(1).max(LIMITS.ingredientTextLength))
    .min(1)
    .max(AI_LINES_AT_ONCE),
});
export type ReadIngredientsRequest = z.infer<typeof ReadIngredientsRequest>;

/**
 * One entry for each line asked about, in order. Null where there is nothing
 * to add: the rules read the line themselves, so no model was asked, or a
 * model was asked and nothing it said could be found in the line.
 */
export const ReadIngredientsResponse = z.object({
  lines: z.array(IngredientReading.nullable()),
});
export type ReadIngredientsResponse = z.infer<typeof ReadIngredientsResponse>;
