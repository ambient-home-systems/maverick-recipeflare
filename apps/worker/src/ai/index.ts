import { isLoopback } from "../auth/dev";
import { AiFailure } from "./failure";
import { type AiBinding, type AiRunner, type AiSettings, createAiRunner } from "./runner";
import { standInBinding } from "./standIn";

export { AI_PROFILES, DEFAULT_PROFILE } from "./profiles";
export type { AiAnswer, AiImage, AiRequest, AiRunner, AiSettings } from "./runner";
export { AiFailure };

/**
 * The model runner for a request or a queue batch, from the Worker's own
 * binding and settings. This is the one place `env.AI` is read: everything
 * else is handed the runner.
 *
 * With `AI_MODE=stand-in` the model is a scripted one, for a computer with no
 * Cloudflare account. `url` is the request being answered, when there is one:
 * off localhost the stand-in is refused, as the dev sign-in is.
 */
export function aiFor(env: Env & AiSettings, url?: string): AiRunner {
  if (env.AI_MODE?.trim() === "stand-in") {
    if (url !== undefined && !isLoopback(new URL(url).hostname)) {
      throw new AiFailure("settings", false, "The stand-in model is for localhost only.");
    }
    return createAiRunner(standInBinding, env);
  }
  // The binding's type ties each model's input to its name. Ours is chosen by a setting.
  return createAiRunner(env.AI as unknown as AiBinding, env);
}
