import type { AiTask } from "@recipeflare/schema";
import { AiFailure } from "./failure";

/**
 * Which model does which job. See docs/phase-2-plan.md §4.2.
 *
 * A profile names a model for every task. Profiles live here, in code; which
 * one is in use is the `AI_PROFILE` setting. Model IDs are settings, not
 * decisions: the catalog turns over, and the comparison in T2.11 picks the
 * default from real cards.
 */

/** One model, and anything it is always asked with. */
export type AiModel = {
  /** As Workers AI names it (`@cf/...`), or `{author}/{model}` for one reached through the gateway. */
  id: string;
  /** Extra fields of the request this model wants, such as how hard to reason. */
  input?: Record<string, unknown>;
};

export type AiProfile = { name: string; models: Record<AiTask, AiModel> };

// Checked against the catalog on 23 Nov 2026. Both take pictures and a JSON
// Schema, run on Cloudflare and need no paid plan.
// Reasons before it answers unless told not to (`enable_thinking`, on by
// default: its model page, read 24 Nov 2026). Left on, reading a two-sided
// card ran past three minutes. Copying out what is written does not need it.
const GEMMA: AiModel = {
  id: "@cf/google/gemma-4-26b-a4b-it",
  input: { chat_template_kwargs: { enable_thinking: false } },
};
// Reasons as hard as it can unless told otherwise, which copying out a recipe does not need.
const QWEN: AiModel = { id: "@cf/qwen/qwen3.8-27b", input: { reasoning_effort: "low" } };

const all = (model: AiModel): Record<AiTask, AiModel> => ({
  read: model,
  build: model,
  details: model,
  translate: model,
});

export const AI_PROFILES: Record<string, AiProfile> = {
  /** Pictures to the model that is cheapest to show them to; text to the other. */
  standard: { name: "standard", models: { ...all(QWEN), read: GEMMA } },
  /** One model throughout, so that T2.11 can compare them. */
  gemma: { name: "gemma", models: all(GEMMA) },
  qwen: { name: "qwen", models: all(QWEN) },
};

export const DEFAULT_PROFILE = "standard";

/**
 * The profile a setting names. A name that is not a profile is refused, not
 * quietly replaced: a mistyped setting should be seen.
 */
export function profileNamed(name: string | undefined): AiProfile {
  const wanted = name?.trim() || DEFAULT_PROFILE;
  const profile = AI_PROFILES[wanted];
  if (!profile) {
    throw new AiFailure("settings", false, `There is no AI profile called "${wanted}".`);
  }
  return profile;
}
