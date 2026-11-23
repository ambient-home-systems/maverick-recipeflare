import { env } from "cloudflare:workers";
import { AiCheckResponse, ErrorBody } from "@recipeflare/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { AiFailure, classifyFailure } from "../src/ai/failure";
import { AI_PROFILES, profileNamed } from "../src/ai/profiles";
import { createAiRunner, jsonIn } from "../src/ai/runner";
import { chatAnswer, signedIn, standInBinding } from "./helpers";

/**
 * The model runner, with a stand-in for the Workers AI binding. Nothing here
 * reaches a model: the real binding always calls, and bills, the real service.
 */

const Sum = z.object({ word: z.string(), sum: z.number() });
const ASK = {
  task: "build" as const,
  system: "Answer in JSON.",
  prompt: "Give the word ready and the sum of 2 and 3.",
  schema: Sum,
  schemaName: "sum",
};
const GOOD = { word: "ready", sum: 5 };

/** An error as the binding throws it: the service's code, then its words. */
const upstream = (message: string) => {
  const error = new Error(message);
  error.name = "InferenceUpstreamError";
  return error;
};

async function failureOf(work: Promise<unknown>): Promise<AiFailure> {
  const error = await work.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AiFailure);
  return error as AiFailure;
}

describe("profiles", () => {
  it("names a model for every task", () => {
    for (const profile of Object.values(AI_PROFILES)) {
      for (const task of ["read", "build", "details", "translate"] as const) {
        expect(profile.models[task].id, `${profile.name} ${task}`).toMatch(/^@cf\/.+\/.+/);
      }
    }
  });

  it("uses the standard profile when none is set", () => {
    expect(profileNamed(undefined).name).toBe("standard");
    expect(profileNamed("  ").name).toBe("standard");
    expect(profileNamed("gemma").name).toBe("gemma");
  });

  it("refuses a name that is not a profile, not quietly using another", () => {
    expect(() => profileNamed("gemmma")).toThrow(AiFailure);
  });
});

describe("asking a model", () => {
  it("asks the model the profile names for the task, through the gateway", async () => {
    const binding = standInBinding([chatAnswer(GOOD)]);
    const ai = createAiRunner(binding, {});

    const answer = await ai.run(ASK);

    expect(answer.value).toEqual(GOOD);
    expect(answer).toMatchObject({
      task: "build",
      profile: "standard",
      requested: AI_PROFILES.standard?.models.build.id,
      model: "@cf/test/stand-in",
      usage: { inputTokens: 12, outputTokens: 7 },
      logId: "log-1",
      tries: 1,
    });
    const call = binding.calls[0];
    expect(call?.model).toBe(AI_PROFILES.standard?.models.build.id);
    expect(call?.options?.gateway).toMatchObject({
      id: "default",
      metadata: { app: "recipeflare", task: "build", profile: "standard" },
    });
  });

  it("sends the schema with the question, and the model's own extras", async () => {
    const binding = standInBinding([chatAnswer(GOOD)]);
    await createAiRunner(binding, { AI_PROFILE: "qwen" }).run(ASK);

    const inputs = binding.calls[0]?.inputs as {
      messages: { role: string; content: unknown }[];
      response_format: {
        type: string;
        json_schema: { name: string; schema: { required: string[] } };
      };
      reasoning_effort?: string;
    };
    expect(inputs.messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(inputs.messages[1]?.content).toBe(ASK.prompt);
    expect(inputs.response_format.type).toBe("json_schema");
    expect(inputs.response_format.json_schema.name).toBe("sum");
    expect(inputs.response_format.json_schema.schema.required).toEqual(["word", "sum"]);
    expect(inputs.reasoning_effort).toBe("low");
  });

  it("goes through the gateway the setting names", async () => {
    const binding = standInBinding([chatAnswer(GOOD)]);
    await createAiRunner(binding, { AI_GATEWAY: "kitchen" }).run(ASK);

    expect(binding.calls[0]?.options?.gateway).toMatchObject({ id: "kitchen" });
  });

  it("asks the gateway not to keep what was asked and answered, unless told to", async () => {
    const quiet = standInBinding([chatAnswer(GOOD)]);
    await createAiRunner(quiet, {}).run(ASK);
    expect(quiet.calls[0]?.options?.extraHeaders).toEqual({
      "cf-aig-collect-log-payload": "false",
    });

    const kept = standInBinding([chatAnswer(GOOD)]);
    await createAiRunner(kept, { AI_LOG_CONTENT: "true" }).run(ASK);
    expect(kept.calls[0]?.options?.extraHeaders).toEqual({});
  });

  it("shows a model its pictures after the words, as data addresses", async () => {
    const binding = standInBinding([chatAnswer(GOOD)]);
    await createAiRunner(binding, {}).run({
      ...ASK,
      task: "read",
      images: [{ type: "image/png", bytes: new Uint8Array([1, 2, 3]) }],
    });

    const messages = binding.calls[0]?.inputs.messages as { content: unknown }[] | undefined;
    expect(messages?.[1]?.content).toEqual([
      { type: "text", text: ASK.prompt },
      { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
    ]);
    expect(binding.calls[0]?.model).toBe(AI_PROFILES.standard?.models.read.id);
  });

  it("asks one model by name in place of the profile's", async () => {
    const binding = standInBinding([chatAnswer(GOOD)]);
    const answer = await createAiRunner(binding, {}).run({ ...ASK, model: "openai/some-model" });

    expect(binding.calls[0]?.model).toBe("openai/some-model");
    expect(answer.requested).toBe("openai/some-model");
  });

  it("reads the older answer shape too, as text or as an object", async () => {
    const asText = standInBinding([{ response: JSON.stringify(GOOD) }]);
    expect((await createAiRunner(asText, {}).run(ASK)).value).toEqual(GOOD);

    const asObject = standInBinding([{ response: GOOD, usage: null }]);
    const answer = await createAiRunner(asObject, {}).run(ASK);
    expect(answer.value).toEqual(GOOD);
    expect(answer.usage).toBeNull();
  });

  it("finds the JSON in an answer that wraps it", () => {
    expect(jsonIn('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(jsonIn('Here you are: {"a": {"b": 2}} Enjoy.')).toEqual({ a: { b: 2 } });
    expect(() => jsonIn("ready, 5")).toThrow();
  });
});

describe("an answer that is not what was asked for", () => {
  it("is asked for once more", async () => {
    const binding = standInBinding([chatAnswer("ready, five"), chatAnswer(GOOD)]);
    const answer = await createAiRunner(binding, {}).run(ASK);

    expect(answer.value).toEqual(GOOD);
    expect(answer.tries).toBe(2);
    expect(binding.calls).toHaveLength(2);
  });

  it("fails clearly, and not as worth retrying, when it happens twice running", async () => {
    const binding = standInBinding([chatAnswer({ word: "ready" })]);
    const failure = await failureOf(createAiRunner(binding, {}).run(ASK));

    expect(failure.reason).toBe("bad_answer");
    expect(failure.retryable).toBe(false);
    expect(binding.calls).toHaveLength(2);
  });

  it("counts an answer cut short, and the service giving up on the schema", async () => {
    const cut = standInBinding([
      chatAnswer('{"word": "rea', {
        choices: [{ message: { content: '{"word": "rea' }, finish_reason: "length" }],
      }),
    ]);
    expect((await failureOf(createAiRunner(cut, {}).run(ASK))).reason).toBe("bad_answer");

    const gaveUp = standInBinding([upstream("JSON Mode couldn't be met"), chatAnswer(GOOD)]);
    const answer = await createAiRunner(gaveUp, {}).run(ASK);
    expect(answer.tries).toBe(2);
  });

  it("does not ask again when the model declined", async () => {
    const binding = standInBinding([
      { choices: [{ message: { content: null, refusal: "I cannot help with that." } }] },
    ]);
    const failure = await failureOf(createAiRunner(binding, {}).run(ASK));

    expect(failure.reason).toBe("refused");
    expect(failure.retryable).toBe(false);
    expect(binding.calls).toHaveLength(1);
  });
});

describe("a call that fails", () => {
  it("is not worth retrying for a retired model", async () => {
    const binding = standInBinding([
      upstream("5028: @cf/zai-org/glm-5.3-flash was deprecated on 2026-11-20."),
    ]);
    const failure = await failureOf(createAiRunner(binding, {}).run(ASK));

    expect(failure.reason).toBe("model");
    expect(failure.retryable).toBe(false);
    expect(binding.calls).toHaveLength(1);
  });

  it.each([
    ["5007: No such model @cf/nobody/nothing or task", "model", false],
    ["5035: This model requires a Workers Paid plan.", "model", false],
    ["3040: Capacity temporarily exceeded, please try again.", "unavailable", true],
    ["3007: Request timeout", "unavailable", true],
    ["3036: You have used up your daily free allocation of 10,000 neurons.", "limit", false],
    ["2052: Insufficient unified billing balance for this request.", "limit", false],
    ["3006: Request is too large", "request", false],
    ["AiGatewayError: 7003: User Input Error", "request", false],
    [
      "AiGatewayError: 2018: Unified billing rate limit exceeded for this gateway.",
      "unavailable",
      true,
    ],
  ])("reads the service's code in %j", (message, reason, retryable) => {
    const failure = classifyFailure(upstream(message));
    expect([failure.reason, failure.retryable]).toEqual([reason, retryable]);
  });

  it("falls back on the HTTP status for a code it does not know", () => {
    expect(classifyFailure(upstream("9999: something new"), 410).reason).toBe("model");
    expect(classifyFailure(upstream("something new"), 503).retryable).toBe(true);
    expect(classifyFailure(upstream("something new"), 402).reason).toBe("limit");
  });

  it("treats a spend limit as a limit, though it answers like a rate limit", () => {
    const failure = classifyFailure(upstream("Spend limit exceeded for this gateway"), 429);
    expect([failure.reason, failure.retryable]).toEqual(["limit", false]);
  });

  it("gives up on a model that takes too long, and says it may work later", async () => {
    const binding = standInBinding([]);
    binding.run = (_model, _inputs, options) =>
      new Promise((_resolve, reject) => {
        const signal = options?.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(signal.reason));
      });
    const failure = await failureOf(createAiRunner(binding, {}, { timeoutMs: 5 }).run(ASK));

    expect(failure.reason).toBe("unavailable");
    expect(failure.retryable).toBe(true);
  });

  it("counts an error nobody foresaw as worth another try", () => {
    const failure = classifyFailure(new Error("socket hang up"));
    expect([failure.reason, failure.retryable]).toEqual(["unavailable", true]);
  });

  it("fails on a profile setting that names none, before asking anything", async () => {
    const binding = standInBinding([chatAnswer(GOOD)]);
    const failure = await failureOf(createAiRunner(binding, { AI_PROFILE: "nope" }).run(ASK));

    expect(failure.reason).toBe("settings");
    expect(binding.calls).toHaveLength(0);
  });
});

describe("POST /api/v1/ai/check", () => {
  const OWNER = "ai-owner@example.com";
  const MEMBER = "ai-member@example.com";

  beforeAll(async () => {
    // The first person through the door is the owner.
    await signedIn(env, OWNER).get("/me");
    await signedIn(env, MEMBER).get("/me");
  });

  it("tells the owner which model answered", async () => {
    const binding = standInBinding([chatAnswer(GOOD)]);
    const api = signedIn(env, OWNER, { ai: createAiRunner(binding, {}) });

    const response = await api.post("/ai/check", {});

    expect(response.status).toBe(200);
    expect(AiCheckResponse.parse(await response.json())).toMatchObject({
      ok: true,
      profile: "standard",
      task: "build",
      requested: AI_PROFILES.standard?.models.build.id,
      model: "@cf/test/stand-in",
      tries: 1,
    });
  });

  it("checks the task and the model it is asked to", async () => {
    const binding = standInBinding([chatAnswer(GOOD)]);
    const api = signedIn(env, OWNER, { ai: createAiRunner(binding, {}) });

    const body = AiCheckResponse.parse(
      await (await api.post("/ai/check", { task: "read", model: "@cf/some/other" })).json(),
    );

    expect(body).toMatchObject({ ok: true, task: "read", requested: "@cf/some/other" });
    expect(binding.calls[0]?.model).toBe("@cf/some/other");
  });

  it("says why no model answered, and whether trying again would help", async () => {
    const binding = standInBinding([
      upstream("5028: @cf/zai-org/glm-5.3-flash was deprecated on 2026-11-20."),
    ]);
    const api = signedIn(env, OWNER, { ai: createAiRunner(binding, {}) });

    const response = await api.post("/ai/check", { model: "@cf/zai-org/glm-5.3-flash" });

    expect(response.status).toBe(200);
    expect(AiCheckResponse.parse(await response.json())).toMatchObject({
      ok: false,
      requested: "@cf/zai-org/glm-5.3-flash",
      reason: "model",
      retryable: false,
    });
  });

  it("reports a profile setting that names none", async () => {
    const binding = standInBinding([chatAnswer(GOOD)]);
    const api = signedIn(env, OWNER, { ai: createAiRunner(binding, { AI_PROFILE: "nope" }) });

    const body = AiCheckResponse.parse(await (await api.post("/ai/check", {})).json());

    expect(body).toMatchObject({ ok: false, reason: "settings" });
    expect(binding.calls).toHaveLength(0);
  });

  it("is for the owner only", async () => {
    const binding = standInBinding([chatAnswer(GOOD)]);
    const api = signedIn(env, MEMBER, { ai: createAiRunner(binding, {}) });

    const response = await api.post("/ai/check", {});

    expect(response.status).toBe(403);
    expect(ErrorBody.parse(await response.json()).error.code).toBe("forbidden");
    expect(binding.calls).toHaveLength(0);
  });

  it("refuses a task that is not one", async () => {
    const api = signedIn(env, OWNER, { ai: createAiRunner(standInBinding([]), {}) });

    expect((await api.post("/ai/check", { task: "sing" })).status).toBe(400);
  });
});
