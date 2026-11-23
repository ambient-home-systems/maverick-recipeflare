import type { AiTask, AiUsage } from "@recipeflare/schema";
import { z } from "zod";
import { AiFailure, classifyFailure } from "./failure";
import { type AiModel, type AiProfile, profileNamed } from "./profiles";

/**
 * The only code that calls a model. See docs/phase-2-plan.md §4.2.
 *
 * A caller says which task it is doing, gives a prompt and a schema, and gets
 * back a value that fits the schema or an `AiFailure` saying why not. Which
 * model that means, the gateway it goes through, and what counts as worth
 * another try are decided here and nowhere else.
 */

/** Settings the runner reads. Optional: a deploy variable or a local one, never part of wrangler.jsonc. */
export type AiSettings = {
  /** The profile in use. Defaults to `standard`. */
  AI_PROFILE?: string;
  /** The AI Gateway every call goes through. Defaults to `default`, which Cloudflare makes on first use. */
  AI_GATEWAY?: string;
  /** `true` lets the gateway keep what was asked and answered in its logs. Off unless set. */
  AI_LOG_CONTENT?: string;
  /** How many imports may ask a model in a day. Defaults to 100. */
  AI_DAILY_IMPORTS?: string;
};

/**
 * As much of the Workers AI binding as the runner uses. The binding's own
 * type knows each model's input by name, which a model chosen by a setting
 * cannot satisfy, so the runner speaks to it through this.
 */
export type AiBinding = {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  /** The gateway's record of the last call. */
  aiGatewayLogId?: string | null;
  /** The HTTP status of the last call. */
  lastRequestHttpStatusCode?: number | null;
};

/** A picture for a model to look at. */
export type AiImage = { type: string; bytes: Uint8Array };

export type AiRequest<T> = {
  task: AiTask;
  /** What the model is, and the rules it follows. */
  system: string;
  /** This call's own material. */
  prompt: string;
  images?: AiImage[];
  /** What the answer must be. Plain objects, arrays, strings, numbers and nullables only. */
  schema: z.ZodType<T>;
  /** A short name for the schema, which the service asks for: letters, digits and underscores. */
  schemaName: string;
  /** The most the model may write. */
  maxTokens?: number;
  /** One model by ID, in place of the profile's. For the owner's check. */
  model?: string;
};

export type AiAnswer<T> = {
  value: T;
  task: AiTask;
  profile: string;
  /** The model that was asked. */
  requested: string;
  /** The model that answered, as the service names it. */
  model: string;
  milliseconds: number;
  usage: AiUsage | null;
  logId: string | null;
  /** How many times the model was asked before its answer fitted the schema. */
  tries: number;
};

export type AiRunner = {
  /** The profile in use. Throws an `AiFailure` when the setting names none. */
  profile(): AiProfile;
  run<T>(request: AiRequest<T>): Promise<AiAnswer<T>>;
};

export type AiRunnerOptions = {
  /** How long one call may take before it is given up on. */
  timeoutMs?: number;
  now?: () => number;
};

/** A model that has not answered in this long is not going to. */
const TIMEOUT_MS = 90_000;
const MAX_TOKENS = 4096;
/** An answer that is not the schema is asked for once more, and no more. */
const TRIES = 2;

/** What the service answers with: OpenAI's chat shape, or the older `{ response }`. */
const Output = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          refusal: z.string().nullish(),
        }),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
  response: z.unknown().optional(),
  usage: z
    .object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() })
    .nullish(),
});

/** An answer that cannot be used, and why. Tried again, then reported. */
class BadAnswer extends Error {}

/** The JSON in a model's answer. Some wrap it in a code fence or a sentence, whatever they were told. */
export function jsonIn(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new BadAnswer("The model's answer was not JSON.");
    }
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      throw new BadAnswer("The model's answer was not JSON.");
    }
  }
}

function read<T>(raw: unknown, schema: z.ZodType<T>) {
  const output = Output.safeParse(raw);
  if (!output.success) {
    throw new BadAnswer("The model's answer was not in a shape the app knows.");
  }
  const choice = output.data.choices?.[0];
  if (choice?.message.refusal) {
    throw new AiFailure("refused", false, "The model declined to answer.");
  }
  if (choice?.finish_reason === "length") {
    throw new BadAnswer("The model's answer was cut short.");
  }
  const content = choice ? choice.message.content : output.data.response;
  if (content === null || content === undefined || content === "") {
    throw new BadAnswer("The model gave no answer.");
  }
  const value = schema.safeParse(typeof content === "string" ? jsonIn(content) : content);
  if (!value.success) {
    throw new BadAnswer("The model's answer did not fit what was asked for.");
  }
  const usage = output.data.usage;
  return {
    value: value.data,
    model: output.data.model ?? null,
    usage: usage
      ? {
          inputTokens: Math.round(usage.prompt_tokens ?? 0),
          outputTokens: Math.round(usage.completion_tokens ?? 0),
        }
      : null,
  };
}

/** Base64, a slice at a time: a photo is too long to spread into one call. */
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

const dataUrl = (image: AiImage) => `data:${image.type};base64,${base64(image.bytes)}`;

function inputFor<T>(request: AiRequest<T>, model: AiModel): Record<string, unknown> {
  const pictures = (request.images ?? []).map((image) => ({
    type: "image_url",
    image_url: { url: dataUrl(image) },
  }));
  return {
    messages: [
      { role: "system", content: request.system },
      {
        role: "user",
        content:
          pictures.length > 0
            ? [{ type: "text", text: request.prompt }, ...pictures]
            : request.prompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: request.schemaName,
        schema: z.toJSONSchema(request.schema, { io: "input" }),
        strict: true,
      },
    },
    max_completion_tokens: request.maxTokens ?? MAX_TOKENS,
    // The same card should read the same way twice.
    temperature: 0,
    ...model.input,
  };
}

/**
 * Builds the runner. `binding` is `env.AI` in the Worker; a test hands in a
 * stand-in, because the real one always calls, and bills, the real service.
 */
export function createAiRunner(
  binding: AiBinding,
  settings: AiSettings,
  options: AiRunnerOptions = {},
): AiRunner {
  const now = options.now ?? Date.now;
  const profile = () => profileNamed(settings.AI_PROFILE);
  const gateway = settings.AI_GATEWAY?.trim() || "default";
  const keepContent = settings.AI_LOG_CONTENT?.trim().toLowerCase() === "true";

  return {
    profile,
    async run<T>(request: AiRequest<T>): Promise<AiAnswer<T>> {
      const chosen = profile();
      const model: AiModel = request.model ? { id: request.model } : chosen.models[request.task];
      const input = inputFor(request, model);
      const started = now();
      let last: BadAnswer | null = null;

      for (let attempt = 1; attempt <= TRIES; attempt++) {
        let raw: unknown;
        try {
          raw = await binding.run(model.id, input, {
            gateway: {
              id: gateway,
              // Shows in the gateway's log of the call, and can scope a spend limit.
              metadata: { app: "recipeflare", task: request.task, profile: chosen.name },
            },
            // The gateway keeps who was asked, when and at what cost. What was
            // asked and answered is a family's recipe card, and is kept only on request.
            extraHeaders: keepContent ? {} : { "cf-aig-collect-log-payload": "false" },
            signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
          });
        } catch (error) {
          const failure = classifyFailure(error, binding.lastRequestHttpStatusCode);
          if (failure.reason !== "bad_answer") {
            throw failure;
          }
          last = new BadAnswer(failure.message);
          continue;
        }
        try {
          const answer = read(raw, request.schema);
          return {
            value: answer.value,
            task: request.task,
            profile: chosen.name,
            requested: model.id,
            model: answer.model ?? model.id,
            milliseconds: Math.max(0, Math.round(now() - started)),
            usage: answer.usage,
            logId: binding.aiGatewayLogId ?? null,
            tries: attempt,
          };
        } catch (error) {
          if (!(error instanceof BadAnswer)) {
            throw error;
          }
          last = error;
        }
      }
      // Twice running. A third try would cost as much and say the same.
      throw new AiFailure(
        "bad_answer",
        false,
        last?.message ?? "The model's answer could not be used.",
      );
    },
  };
}
