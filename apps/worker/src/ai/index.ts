import { type AiBinding, type AiRunner, type AiSettings, createAiRunner } from "./runner";

export { AiFailure } from "./failure";
export { AI_PROFILES, DEFAULT_PROFILE } from "./profiles";
export type { AiAnswer, AiImage, AiRequest, AiRunner, AiSettings } from "./runner";

/**
 * The model runner for a request or a queue batch, from the Worker's own
 * binding and settings. This is the one place `env.AI` is read: everything
 * else is handed the runner.
 */
export function aiFor(env: Env & AiSettings): AiRunner {
  // The binding's type ties each model's input to its name. Ours is chosen by a setting.
  return createAiRunner(env.AI as unknown as AiBinding, env);
}
