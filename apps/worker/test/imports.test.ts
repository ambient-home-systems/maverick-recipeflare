import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { ErrorBody, ImportDetail, ImportJob, ImportListResponse, newId } from "@recipeflare/schema";
import { fixtureMember } from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import worker from "../src";
import { AI_PROFILES } from "../src/ai/profiles";
import { createAiRunner } from "../src/ai/runner";
import {
  createImportJob,
  finishImportJob,
  loadImportJob,
  loadImportJobForRun,
} from "../src/db/importJobs";
import {
  handleImportBatch,
  type ImportHandler,
  type ImportMessage,
  type ImportTools,
  NextStage,
  PermanentImportError,
  RetryableImportError,
  runImportJob,
} from "../src/imports/runner";
import { chatAnswer, noAi, seedLists, signedIn, standInBinding } from "./helpers";

const db = env.DB;
const QUEUE = "recipeflare-imports";
const DEAD_LETTERS = "recipeflare-imports-dlq";

beforeAll(async () => {
  await seedLists(db);
});

const tools = { fetch, env, ai: noAi };
const DRAFT = {
  title: "Garlic Bread",
  ingredientSections: [{ title: null, items: [{ originalText: "1 loaf crusty bread" }] }],
  stepSections: [{ title: null, steps: [{ text: "Bake." }] }],
};

async function queued(url = "https://example.com/garlic-bread") {
  return createImportJob(db, { kind: "url", sourceUrl: url, input: { url } }, fixtureMember.id);
}

let sequence = 0;
/** A batch as the queue would deliver it: one message per body, each with its own ID. */
function batchOf(queue: string, ...bodies: unknown[]) {
  return createMessageBatch(
    queue,
    bodies.map((body) => ({
      id: `message-${++sequence}`,
      timestamp: new Date(),
      attempts: 1,
      body,
    })),
  );
}

/** Delivers a batch to the runner with the given handler for links, and says what became of each message. */
async function deliver(batch: MessageBatch<unknown>, url?: ImportHandler) {
  const ctx = createExecutionContext();
  await handleImportBatch(batch, url ? { url } : {}, tools);
  return getQueueResult(batch, ctx);
}

const acked = (batch: MessageBatch<unknown>) => batch.messages.map((message) => message.id);
const job = async (id: string) => {
  const found = await loadImportJob(db, id);
  if (!found) {
    throw new Error("the job is gone");
  }
  return found;
};

describe("running an import from the queue", () => {
  it("stores what the handler found, with what is missing from it, and hands the job to a person", async () => {
    const created = await queued();
    const handler = vi.fn<ImportHandler>(async () => ({ title: "Garlic Bread" }));
    const batch = batchOf(QUEUE, { jobId: created.id });

    const result = await deliver(batch, handler);

    expect(result.explicitAcks).toEqual(acked(batch));
    expect(result.retryMessages).toEqual([]);
    const after = await job(created.id);
    expect(after).toMatchObject({ status: "needs_review", attempts: 1, error: null });
    expect(after.result?.draft.title).toBe("Garlic Bread");
    // The draft has no ingredients or steps, and the review screen is told so.
    expect(after.result?.issues.map((issue) => issue.code)).toEqual([
      "missing_ingredients",
      "missing_steps",
    ]);
    expect(after.finishedAt).not.toBeNull();
    // The handler is given the job, what was asked for, and its tools.
    expect(handler.mock.calls[0]?.[0]).toMatchObject({ id: created.id, kind: "url" });
    expect(handler.mock.calls[0]?.[1]).toEqual({ url: "https://example.com/garlic-bread" });
    expect(handler.mock.calls[0]?.[2].fetch).toBe(fetch);
  });

  it("ignores a message that comes again for a job a person already has", async () => {
    const created = await queued();
    await deliver(batchOf(QUEUE, { jobId: created.id }), async () => DRAFT);
    const handler = vi.fn<ImportHandler>(async () => ({ title: "Second Time" }));
    const again = batchOf(QUEUE, { jobId: created.id });

    const result = await deliver(again, handler);

    expect(result.explicitAcks).toEqual(acked(again));
    expect(handler).not.toHaveBeenCalled();
    expect((await job(created.id)).result?.draft.title).toBe("Garlic Bread");
    expect((await job(created.id)).attempts).toBe(1);
  });

  it("runs a job again when its last attempt died part-way, and overwrites what that left", async () => {
    const created = await queued();
    // An attempt took the job and never finished: the Worker was stopped.
    await db
      .prepare("UPDATE import_jobs SET status = 'running', attempts = 1 WHERE id = ?1")
      .bind(created.id)
      .run();

    const result = await deliver(batchOf(QUEUE, { jobId: created.id }), async () => DRAFT);

    expect(result.retryMessages).toEqual([]);
    expect(await job(created.id)).toMatchObject({ status: "needs_review", attempts: 2 });
  });

  it("asks for the message again, later, when the handler says trying again may work", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const created = await queued();
    const batch = batchOf(QUEUE, { jobId: created.id });

    const result = await deliver(batch, async () => {
      throw new RetryableImportError("The site answered 503");
    });

    expect(result.explicitAcks).toEqual([]);
    expect(result.retryMessages.map((message) => message.msgId)).toEqual([batch.messages[0]?.id]);
    // Still running: nothing has been decided about it.
    expect(await job(created.id)).toMatchObject({ status: "running", attempts: 1, error: null });

    // The queue brings it back, and this time the site answers.
    const second = await deliver(batchOf(QUEUE, { jobId: created.id }), async () => DRAFT);
    expect(second.retryMessages).toEqual([]);
    expect(await job(created.id)).toMatchObject({ status: "needs_review", attempts: 2 });
  });

  it("waits longer before each further try", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const created = await queued();
    const failing: ImportHandler = async () => {
      throw new RetryableImportError("Still down");
    };

    // Asked of the runner itself: the queue's test double does not report the delay.
    const outcomes = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      outcomes.push(await runImportJob(created.id, { url: failing }, tools));
    }

    expect(outcomes).toEqual([
      { ack: false, delaySeconds: 60 },
      { ack: false, delaySeconds: 120 },
      { ack: false, delaySeconds: 240 },
    ]);
  });

  it("gives up at once, with a code the app can explain, when trying again cannot work", async () => {
    const created = await queued();
    const batch = batchOf(QUEUE, { jobId: created.id });

    const result = await deliver(batch, async () => {
      throw new PermanentImportError("no_recipe", "No recipe was found on that page.");
    });

    expect(result.explicitAcks).toEqual(acked(batch));
    expect(result.retryMessages).toEqual([]);
    expect(await job(created.id)).toMatchObject({
      status: "failed",
      error: { code: "no_recipe", message: "No recipe was found on that page." },
      result: null,
    });
  });

  it("tries again after an error nobody foresaw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const created = await queued();

    const result = await deliver(batchOf(QUEUE, { jobId: created.id }), async () => {
      throw new TypeError("Cannot read properties of undefined");
    });

    expect(result.retryMessages).toHaveLength(1);
    expect((await job(created.id)).status).toBe("running");
  });

  it("fails a job whose handler returned something that is not a draft", async () => {
    const created = await queued();

    await deliver(batchOf(QUEUE, { jobId: created.id }), async () => ({
      title: 12,
      servings: "four",
    }));

    expect(await job(created.id)).toMatchObject({ status: "failed", error: { code: "bad_draft" } });
  });

  it("fails a job of a kind it has no handler for, saying so", async () => {
    const created = await queued();

    const result = await deliver(batchOf(QUEUE, { jobId: created.id }));

    expect(result.retryMessages).toEqual([]);
    expect(await job(created.id)).toMatchObject({
      status: "failed",
      error: { code: "unsupported" },
    });
  });

  it("settles each message by itself, so one bad job does not bring the batch back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const good = await queued("https://example.com/good");
    const bad = await queued("https://example.com/bad");
    const batch = batchOf(
      QUEUE,
      { jobId: good.id },
      { jobId: bad.id },
      { not: "ours" },
      {
        jobId: newId(),
      },
    );

    const result = await deliver(batch, async (running) => {
      if (running.id === bad.id) {
        throw new RetryableImportError("Down");
      }
      return DRAFT;
    });

    const [first, second, third, fourth] = batch.messages.map((message) => message.id);
    // The good job, the message that is not ours and the one for a job that is gone are done with.
    expect(result.explicitAcks).toEqual([first, third, fourth]);
    expect(result.retryMessages.map((message) => message.msgId)).toEqual([second]);
    expect(result.ackAll).toBe(false);
    expect(result.retryBatch.retry).toBe(false);
    expect((await job(good.id)).status).toBe("needs_review");
  });

  it("runs the jobs of a batch side by side, so one slow import does not hold up the next", async () => {
    const first = await queued("https://example.com/slow-one");
    const second = await queued("https://example.com/slow-two");
    const batch = batchOf(QUEUE, { jobId: first.id }, { jobId: second.id });
    const order: string[] = [];

    const result = await deliver(batch, async (running) => {
      const name = running.id === first.id ? "first" : "second";
      order.push(`${name} starts`);
      // Stands for the wait for a model: long enough for the other job to start.
      await new Promise((resolve) => setTimeout(resolve, 50));
      order.push(`${name} ends`);
      return DRAFT;
    });

    // Run in turn, the second would start only after the first had ended.
    expect(order.slice(0, 2).sort()).toEqual(["first starts", "second starts"]);
    expect(result.explicitAcks).toEqual(acked(batch));
    expect((await job(first.id)).status).toBe("needs_review");
    expect((await job(second.id)).status).toBe("needs_review");
  });
});

describe("an import in stages", () => {
  /** Tools whose queue only remembers what it was sent, so that a test delivers each message itself. */
  function staged(ai = noAi, settings: Record<string, string> = {}) {
    const sent: ImportMessage[] = [];
    const stagedTools: ImportTools = {
      fetch,
      env: { ...env, ...settings },
      ai,
      send: async (message) => {
        sent.push(message);
      },
    };
    return { sent, tools: stagedTools };
  }
  const work = async (id: string) => (await loadImportJobForRun(db, id))?.work;

  /** Reads, then builds, then finishes: each stage adds to what the last one kept. */
  const threeStages = (ran: string[] = []): ImportHandler => {
    return async (running, _input, _tools, kept) => {
      ran.push(running.stage ?? "first");
      if (running.stage === null) {
        return new NextStage("build", { text: "1 loaf crusty bread. Bake." });
      }
      if (running.stage === "build") {
        return new NextStage("details", { ...kept, title: "Garlic Bread" });
      }
      return { ...DRAFT, title: String(kept.title), description: String(kept.text) };
    };
  };

  it("moves through three stages, one message each, and lands in review", async () => {
    const created = await queued();
    const { sent, tools: stagedTools } = staged();
    const ran: string[] = [];
    const handlers = { url: threeStages(ran) };

    expect(await runImportJob(created.id, handlers, stagedTools, null)).toEqual({ ack: true });
    expect(await job(created.id)).toMatchObject({ status: "running", stage: "build", attempts: 0 });
    expect(sent).toEqual([{ jobId: created.id, stage: "build" }]);

    await runImportJob(created.id, handlers, stagedTools, "build");
    expect(await job(created.id)).toMatchObject({ status: "running", stage: "details" });
    expect(sent[1]).toEqual({ jobId: created.id, stage: "details" });
    // What each stage kept is there for the next.
    expect(await work(created.id)).toMatchObject({
      text: "1 loaf crusty bread. Bake.",
      title: "Garlic Bread",
      steps: 2,
    });

    await runImportJob(created.id, handlers, stagedTools, "details");
    const after = await job(created.id);
    expect(after.status).toBe("needs_review");
    expect(after.result?.draft).toMatchObject({
      title: "Garlic Bread",
      description: "1 loaf crusty bread. Bake.",
    });
    expect(ran).toEqual(["first", "build", "details"]);
    expect(sent).toHaveLength(2);
  });

  it("changes nothing when a message is delivered twice, at any stage", async () => {
    const created = await queued();
    const { sent, tools: stagedTools } = staged();
    const ran: string[] = [];
    const handlers = { url: threeStages(ran) };

    await runImportJob(created.id, handlers, stagedTools, null);
    // The first message again, after its stage is done.
    expect(await runImportJob(created.id, handlers, stagedTools, null)).toEqual({ ack: true });
    expect(await job(created.id)).toMatchObject({ stage: "build", attempts: 0 });

    await runImportJob(created.id, handlers, stagedTools, "build");
    await runImportJob(created.id, handlers, stagedTools, "build");
    expect(await job(created.id)).toMatchObject({ stage: "details", attempts: 0 });

    await runImportJob(created.id, handlers, stagedTools, "details");
    const first = await job(created.id);
    await runImportJob(created.id, handlers, stagedTools, "details");

    // Each stage ran once, each next message was sent once, and the job is as it was.
    expect(ran).toEqual(["first", "build", "details"]);
    expect(sent).toHaveLength(2);
    expect(await job(created.id)).toEqual(first);
  });

  it("sends no second message when two deliveries run the same stage at once", async () => {
    const created = await queued();
    const { sent, tools: stagedTools } = staged();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handlers = {
      url: (async () => {
        await gate;
        return new NextStage("build", { text: "read" });
      }) satisfies ImportHandler,
    };

    const both = Promise.all([
      runImportJob(created.id, handlers, stagedTools, null),
      runImportJob(created.id, handlers, stagedTools, null),
    ]);
    release();

    expect(await both).toEqual([{ ack: true }, { ack: true }]);
    expect(sent).toEqual([{ jobId: created.id, stage: "build" }]);
  });

  it("retries a stage that failed by itself, without going back to the start", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const created = await queued();
    const { tools: stagedTools } = staged();
    const ran: string[] = [];
    let buildFails = 2;
    const inner = threeStages(ran);
    const handlers = {
      url: (async (running, input, handed, kept) => {
        if (running.stage === "build" && buildFails-- > 0) {
          ran.push("build failed");
          throw new RetryableImportError("The model is busy");
        }
        return inner(running, input, handed, kept);
      }) satisfies ImportHandler,
    };

    await runImportJob(created.id, handlers, stagedTools, null);
    // The queue brings the same message back, with a longer wait each time.
    expect(await runImportJob(created.id, handlers, stagedTools, "build")).toEqual({
      ack: false,
      delaySeconds: 60,
    });
    expect(await runImportJob(created.id, handlers, stagedTools, "build")).toEqual({
      ack: false,
      delaySeconds: 120,
    });
    expect(await job(created.id)).toMatchObject({ status: "running", stage: "build", attempts: 2 });
    await runImportJob(created.id, handlers, stagedTools, "build");
    await runImportJob(created.id, handlers, stagedTools, "details");

    // The first stage ran once. The count of attempts started again at the next stage.
    expect(ran).toEqual(["first", "build failed", "build failed", "build", "details"]);
    expect(await job(created.id)).toMatchObject({ status: "needs_review", attempts: 1 });
  });

  it("takes up at the stage that failed when the cook tries a failed import again", async () => {
    const { queue } = { queue: { send: vi.fn(async () => {}) } as unknown as Queue };
    const api = signedIn({ ...env, IMPORT_QUEUE: queue }, fixtureMember.email ?? "");
    const created = await queued();
    const { tools: stagedTools } = staged();
    const ran: string[] = [];
    let broken = true;
    const inner = threeStages(ran);
    const handlers = {
      url: (async (running, input, handed, kept) => {
        if (running.stage === "build" && broken) {
          throw new PermanentImportError("ai_answer", "The model's answer could not be used.");
        }
        return inner(running, input, handed, kept);
      }) satisfies ImportHandler,
    };
    await runImportJob(created.id, handlers, stagedTools, null);
    await runImportJob(created.id, handlers, stagedTools, "build");
    expect(await job(created.id)).toMatchObject({ status: "failed", stage: "build" });

    const response = await api.post(`/imports/${created.id}/retry`, {});

    expect(response.status).toBe(202);
    expect(queue.send).toHaveBeenCalledWith({ jobId: created.id, stage: "build" });
    broken = false;
    await runImportJob(created.id, handlers, stagedTools, "build");
    await runImportJob(created.id, handlers, stagedTools, "details");
    // What the first stage read was kept, and it was not read again.
    expect(ran).toEqual(["first", "build", "details"]);
    expect((await job(created.id)).result?.draft.description).toBe("1 loaf crusty bread. Bake.");
  });

  it("fails the job, ready to be tried again, when the next message cannot be sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const created = await queued();
    const stagedTools: ImportTools = {
      fetch,
      env,
      ai: noAi,
      send: async () => {
        throw new Error("Queue send failed");
      },
    };

    expect(await runImportJob(created.id, { url: threeStages() }, stagedTools, null)).toEqual({
      ack: true,
    });

    expect(await job(created.id)).toMatchObject({
      status: "failed",
      stage: "build",
      error: { code: "not_queued" },
    });
    expect(await work(created.id)).toMatchObject({ text: "1 loaf crusty bread. Bake." });
  });

  it("stops an import that goes round in circles", async () => {
    const created = await queued();
    const { tools: stagedTools } = staged();
    const handlers = {
      url: (async (running) =>
        new NextStage(running.stage === "a" ? "b" : "a", {})) satisfies ImportHandler,
    };

    let stage: string | null = null;
    for (let turn = 0; turn < 12; turn++) {
      await runImportJob(created.id, handlers, stagedTools, stage);
      const now = await job(created.id);
      if (now.status !== "running") {
        break;
      }
      stage = now.stage;
    }

    expect(await job(created.id)).toMatchObject({ status: "failed", error: { code: "bad_draft" } });
  });

  it("still runs a message that names no stage, as one sent before stages did", async () => {
    const created = await queued();
    const { tools: stagedTools } = staged();
    await runImportJob(created.id, { url: threeStages() }, stagedTools, null);

    await runImportJob(created.id, { url: threeStages() }, stagedTools);

    expect((await job(created.id)).stage).toBe("details");
  });
});

describe("an import that asks a model", () => {
  const Title = z.object({ title: z.string() });
  const ASK = {
    task: "build" as const,
    system: "Answer in JSON.",
    prompt: "Name this recipe.",
    schema: Title,
    schemaName: "title",
  };
  /** One stage that asks a model for the title. */
  const asking: ImportHandler = async (_job, _input, handed) => ({
    ...DRAFT,
    title: (await handed.ai.run(ASK)).value.title,
  });
  const toolsWith = (answers: unknown[], settings: Record<string, string> = {}) => {
    const binding = standInBinding(answers);
    const stagedTools: ImportTools = {
      fetch,
      env: { ...env, ...settings },
      ai: createAiRunner(binding, {}),
      send: async () => {},
    };
    return { binding, tools: stagedTools };
  };
  const upstream = (message: string) => new Error(message);
  /** Forgets every model call made so far, so that a test counts from nothing. */
  const forgetCalls = () => db.prepare("UPDATE import_jobs SET work = NULL").run();

  it("keeps a record of each call with the job: the model, the time and the tokens", async () => {
    await forgetCalls();
    const created = await queued();
    const { tools: aiTools } = toolsWith([chatAnswer({ title: "Garlic Bread" })]);

    await runImportJob(created.id, { url: asking }, aiTools);

    expect(await job(created.id)).toMatchObject({ status: "needs_review" });
    const kept = (await loadImportJobForRun(db, created.id))?.work;
    expect(kept?.calls).toHaveLength(1);
    expect(kept?.calls?.[0]).toMatchObject({
      task: "build",
      profile: "standard",
      model: "@cf/test/stand-in",
      inputTokens: 12,
      outputTokens: 7,
      tries: 1,
    });
  });

  it("carries the record from stage to stage", async () => {
    await forgetCalls();
    const created = await queued();
    const { tools: aiTools } = toolsWith([chatAnswer({ title: "Garlic Bread" })]);
    const twoCalls: ImportHandler = async (running, _input, handed, kept) => {
      const title = (await handed.ai.run(ASK)).value.title;
      return running.stage === null
        ? new NextStage("details", { title })
        : { ...DRAFT, title: String(kept.title) };
    };

    await runImportJob(created.id, { url: twoCalls }, aiTools, null);
    await runImportJob(created.id, { url: twoCalls }, aiTools, "details");

    const kept = (await loadImportJobForRun(db, created.id))?.work;
    expect(kept?.calls).toHaveLength(2);
    expect(kept).toMatchObject({ title: "Garlic Bread", steps: 1 });
  });

  it("fails with ai_limit once the day's imports are used up, before asking the model", async () => {
    await forgetCalls();
    const limit = { AI_DAILY_IMPORTS: "1" };
    const first = await queued("https://example.com/first");
    const { tools: firstTools } = toolsWith([chatAnswer({ title: "First" })], limit);
    await runImportJob(first.id, { url: asking }, firstTools);
    expect((await job(first.id)).status).toBe("needs_review");

    const second = await queued("https://example.com/second");
    const { binding, tools: secondTools } = toolsWith([chatAnswer({ title: "Second" })], limit);
    const outcome = await runImportJob(second.id, { url: asking }, secondTools);

    expect(outcome).toEqual({ ack: true });
    expect(await job(second.id)).toMatchObject({ status: "failed", error: { code: "ai_limit" } });
    expect(binding.calls).toHaveLength(0);
  });

  it("lets an import that has already asked a model finish, limit or no limit", async () => {
    await forgetCalls();
    const limit = { AI_DAILY_IMPORTS: "1" };
    const started = await queued("https://example.com/started");
    const other = await queued("https://example.com/other");
    const answers = [chatAnswer({ title: "Garlic Bread" })];
    const twoStages: ImportHandler = async (running, _input, handed, kept) => {
      const title = (await handed.ai.run(ASK)).value.title;
      return running.stage === null
        ? new NextStage("details", { title })
        : { ...DRAFT, title: String(kept.title) };
    };
    await runImportJob(started.id, { url: twoStages }, toolsWith(answers, limit).tools, null);
    // Another import uses the day's last place in the meantime.
    await runImportJob(
      other.id,
      { url: asking },
      toolsWith(answers, { AI_DAILY_IMPORTS: "2" }).tools,
    );

    await runImportJob(started.id, { url: twoStages }, toolsWith(answers, limit).tools, "details");

    expect((await job(started.id)).status).toBe("needs_review");
  });

  it("does not count an import that asked no model", async () => {
    await forgetCalls();
    const plain = await queued("https://example.com/plain");
    await runImportJob(plain.id, { url: async () => DRAFT }, toolsWith([]).tools);
    const created = await queued("https://example.com/counted");
    const { tools: aiTools } = toolsWith([chatAnswer({ title: "Counted" })], {
      AI_DAILY_IMPORTS: "1",
    });

    await runImportJob(created.id, { url: asking }, aiTools);

    expect((await job(created.id)).status).toBe("needs_review");
  });

  it("asks again later when the model is busy, and says it was the model when that runs out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await forgetCalls();
    const created = await queued();
    const { tools: aiTools } = toolsWith([
      upstream("3040: Capacity temporarily exceeded, please try again."),
    ]);

    const outcomes = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      outcomes.push(await runImportJob(created.id, { url: asking }, aiTools));
    }

    expect(outcomes).toEqual([
      { ack: false, delaySeconds: 60 },
      { ack: false, delaySeconds: 120 },
      { ack: false, delaySeconds: 240 },
      // The last delivery the queue will make: the job fails, saying why.
      { ack: true },
    ]);
    expect(await job(created.id)).toMatchObject({
      status: "failed",
      error: { code: "ai_unavailable" },
    });
  });

  it.each([
    ["5028: @cf/old/model was deprecated on 2026-11-20.", "ai_setup"],
    ["3036: You have used up your daily free allocation of 10,000 neurons.", "ai_limit"],
  ])("fails at once on %j, with a code the list explains", async (message, code) => {
    await forgetCalls();
    const created = await queued();
    const { binding, tools: aiTools } = toolsWith([upstream(message)]);

    expect(await runImportJob(created.id, { url: asking }, aiTools)).toEqual({ ack: true });

    expect(await job(created.id)).toMatchObject({ status: "failed", error: { code } });
    expect(binding.calls).toHaveLength(1);
  });

  it("fails with ai_answer when the model's answer does not fit twice running", async () => {
    await forgetCalls();
    const created = await queued();
    const { binding, tools: aiTools } = toolsWith([chatAnswer({ name: "Garlic Bread" })]);

    await runImportJob(created.id, { url: asking }, aiTools);

    expect(await job(created.id)).toMatchObject({ status: "failed", error: { code: "ai_answer" } });
    expect(binding.calls).toHaveLength(2);
  });

  it("keeps a call that gave no answer too, with why and how long it was waited for", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await forgetCalls();
    const created = await queued();
    const { tools: aiTools } = toolsWith([
      upstream("3040: Capacity temporarily exceeded, please try again."),
      chatAnswer({ title: "Garlic Bread" }),
    ]);

    // The first try gets no answer and the job waits to be tried again.
    expect(await runImportJob(created.id, { url: asking }, aiTools)).toMatchObject({ ack: false });
    const first = (await loadImportJobForRun(db, created.id))?.work.calls;
    expect(first).toHaveLength(1);
    expect(first?.[0]).toMatchObject({
      task: "build",
      // No answer came, so the model is the one that was asked.
      model: AI_PROFILES.standard?.models.build.id,
      inputTokens: null,
      outputTokens: null,
      tries: 0,
      failed: "unavailable: 3040: Capacity temporarily exceeded, please try again.",
    });
    expect(first?.[0]?.milliseconds).toBeGreaterThanOrEqual(0);

    // The second try answers, and the record has both, in order.
    await runImportJob(created.id, { url: asking }, aiTools);
    const both = (await loadImportJobForRun(db, created.id))?.work.calls;
    expect(both?.map((call) => call.failed !== undefined)).toEqual([true, false]);
  });

  it("shows the calls with the import, and nothing of what was asked or answered", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await forgetCalls();
    const created = await queued();
    const { tools: aiTools } = toolsWith([
      upstream("3040: Capacity temporarily exceeded, please try again."),
      chatAnswer({ title: "Garlic Bread" }),
    ]);
    await runImportJob(created.id, { url: asking }, aiTools);
    await runImportJob(created.id, { url: asking }, aiTools);

    const api = signedIn(env, fixtureMember.email ?? "");
    const shown = ImportDetail.parse(await (await api.get(`/imports/${created.id}`)).json());

    expect(shown.calls).toHaveLength(2);
    expect(shown.calls[0]).toMatchObject({ task: "build", tries: 0 });
    expect(shown.calls[0]?.failed).toMatch(/^unavailable: 3040/);
    expect(shown.calls[1]).toMatchObject({
      task: "build",
      model: "@cf/test/stand-in",
      inputTokens: 12,
      outputTokens: 7,
      tries: 1,
      failed: null,
    });
    // Times and counts only: the same keys for every call.
    expect(Object.keys(shown.calls[1] ?? {}).sort()).toEqual([
      "at",
      "failed",
      "inputTokens",
      "milliseconds",
      "model",
      "outputTokens",
      "reasoningTokens",
      "task",
      "tries",
    ]);
  });

  it("does not record a call that was never made", async () => {
    await forgetCalls();
    const created = await queued();
    const { binding, tools: aiTools } = toolsWith([chatAnswer({ title: "Garlic Bread" })]);
    const misnamed: ImportTools = {
      ...aiTools,
      ai: createAiRunner(binding, { AI_PROFILE: "no-such-profile" }),
    };

    await runImportJob(created.id, { url: asking }, misnamed);

    expect(await job(created.id)).toMatchObject({ status: "failed", error: { code: "ai_setup" } });
    expect((await loadImportJobForRun(db, created.id))?.work.calls ?? []).toEqual([]);
    expect(binding.calls).toHaveLength(0);
  });

  it("keeps the record of a call whose stage then failed", async () => {
    await forgetCalls();
    const created = await queued();
    const { tools: aiTools } = toolsWith([chatAnswer({ title: "Garlic Bread" })]);
    const failsAfterAsking: ImportHandler = async (_job, _input, handed) => {
      await handed.ai.run(ASK);
      throw new PermanentImportError("too_thin", "There was not enough to make a recipe from.");
    };

    await runImportJob(created.id, { url: failsAfterAsking }, aiTools);

    expect((await loadImportJobForRun(db, created.id))?.work.calls).toHaveLength(1);
    expect(await job(created.id)).toMatchObject({ status: "failed", error: { code: "too_thin" } });
  });
});

describe("the dead-letter queue", () => {
  it("marks a job failed when its message ran out of retries, so it is not lost silently", async () => {
    const created = await queued();
    await db
      .prepare("UPDATE import_jobs SET status = 'running', attempts = 4 WHERE id = ?1")
      .bind(created.id)
      .run();
    const batch = batchOf(DEAD_LETTERS, { jobId: created.id });
    const handler = vi.fn<ImportHandler>(async () => DRAFT);

    const result = await deliver(batch, handler);

    expect(result.explicitAcks).toEqual(acked(batch));
    // Nothing is run from here: the job has had its tries.
    expect(handler).not.toHaveBeenCalled();
    expect(await job(created.id)).toMatchObject({
      status: "failed",
      error: { code: "retries_exhausted" },
    });
  });

  it("leaves alone a job that got through in the end", async () => {
    const created = await queued();
    await deliver(batchOf(QUEUE, { jobId: created.id }), async () => DRAFT);

    await deliver(batchOf(DEAD_LETTERS, { jobId: created.id }));

    expect(await job(created.id)).toMatchObject({ status: "needs_review", error: null });
  });
});

describe("the Worker's own queue handler", () => {
  it("runs a delivered batch with the importer for links, and brings the message back when the site is down", async () => {
    const created = await queued();
    const batch = batchOf(QUEUE, { jobId: created.id });
    const ctx = createExecutionContext();

    // Tests have no network: every site answers 503, which is worth another try.
    await worker.queue(batch as MessageBatch<never>, env);

    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks).toEqual([]);
    expect(result.retryMessages.map((message) => message.msgId)).toEqual(acked(batch));
    expect(await job(created.id)).toMatchObject({ status: "running", attempts: 1, error: null });
  });
});

describe("the imports API", () => {
  /** A queue that remembers what it was sent, or refuses. */
  function fakeQueue(refuse = false) {
    const sent: unknown[] = [];
    const queue = {
      send: vi.fn(async (body: unknown) => {
        if (refuse) {
          throw new Error("Queue send failed");
        }
        sent.push(body);
      }),
    };
    return { sent, queue: queue as unknown as Queue };
  }
  const apiWith = (queue: Queue) =>
    signedIn({ ...env, IMPORT_QUEUE: queue }, fixtureMember.email ?? "");

  it("takes on an import from a link: a queued job, and a message that names it", async () => {
    const { sent, queue } = fakeQueue();
    const api = apiWith(queue);

    const response = await api.post("/imports", {
      kind: "url",
      url: "https://Example.com/pie?utm_source=mail#comments",
    });

    expect(response.status).toBe(202);
    const created = ImportJob.parse(await response.json());
    expect(created).toMatchObject({
      kind: "url",
      status: "queued",
      attempts: 0,
      // Stored in the one form that lets a second import of the same page be noticed.
      sourceUrl: "https://example.com/pie",
      result: null,
      error: null,
    });
    // The message is a pointer and nothing more.
    expect(sent).toEqual([{ jobId: created.id, stage: null }]);
    expect(await job(created.id)).toEqual(created);
  });

  it("refuses a link that is not a web address, and an import of a kind it does not take", async () => {
    const { sent, queue } = fakeQueue();
    const api = apiWith(queue);

    for (const body of [
      { kind: "url", url: "not a link" },
      { kind: "url", url: "ftp://example.com/pie" },
      { kind: "video", url: "https://example.com/watch" },
      {},
    ]) {
      const response = await api.post("/imports", body);
      expect(response.status).toBe(400);
      expect(ErrorBody.parse(await response.json()).error.code).toBe("validation_failed");
    }
    expect(sent).toEqual([]);
  });

  it("says so in the job when it could not be put on the queue, so it can be tried again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const api = apiWith(fakeQueue(true).queue);

    const response = await api.post("/imports", { kind: "url", url: "https://example.com/pie" });

    expect(response.status).toBe(202);
    expect(ImportJob.parse(await response.json())).toMatchObject({
      status: "failed",
      error: { code: "not_queued" },
    });
  });

  it("lists the imports a person still has to wait for or deal with, newest first", async () => {
    await db.prepare("DELETE FROM import_jobs").run();
    const { queue } = fakeQueue();
    const api = apiWith(queue);
    const stamp = (id: string, at: string, status: string) =>
      db
        .prepare("UPDATE import_jobs SET created_at = ?2, status = ?3 WHERE id = ?1")
        .bind(id, at, status)
        .run();
    const waiting = await queued("https://example.com/waiting");
    const ready = await queued("https://example.com/ready");
    const failed = await queued("https://example.com/failed");
    const saved = await queued("https://example.com/saved");
    const dropped = await queued("https://example.com/dropped");
    await stamp(waiting.id, "2026-11-23T10:00:00.000Z", "queued");
    await stamp(ready.id, "2026-11-23T11:00:00.000Z", "needs_review");
    await stamp(failed.id, "2026-11-23T12:00:00.000Z", "failed");
    await stamp(saved.id, "2026-11-23T13:00:00.000Z", "completed");
    await stamp(dropped.id, "2026-11-23T14:00:00.000Z", "cancelled");

    const response = await api.get("/imports");

    const list = ImportListResponse.parse(await response.json());
    expect(list.items.map((item) => item.id)).toEqual([failed.id, ready.id, waiting.id]);
  });

  it("reads one import, with what was found once it is ready", async () => {
    const api = apiWith(fakeQueue().queue);
    const created = await queued();
    await db
      .prepare("UPDATE import_jobs SET status = 'running' WHERE id = ?1")
      .bind(created.id)
      .run();
    await finishImportJob(db, created.id, { draft: { ...DRAFT } as never, issues: [] });

    const response = await api.get(`/imports/${created.id}`);

    expect(ImportJob.parse(await response.json())).toMatchObject({
      status: "needs_review",
      result: { draft: { title: "Garlic Bread" }, issues: [] },
    });
    expect((await api.get(`/imports/${newId()}`)).status).toBe(404);
    expect((await api.get("/imports/not-an-id")).status).toBe(404);
  });

  it("tries a failed import again from the start, and only a failed one", async () => {
    const { sent, queue } = fakeQueue();
    const api = apiWith(queue);
    const created = await queued();
    await db
      .prepare(
        "UPDATE import_jobs SET status = 'failed', attempts = 4, error_code = 'retries_exhausted', error_message = 'Down' WHERE id = ?1",
      )
      .bind(created.id)
      .run();

    const response = await api.send("POST", `/imports/${created.id}/retry`, undefined, {
      "Sec-Fetch-Site": "same-origin",
    });

    expect(response.status).toBe(202);
    expect(ImportJob.parse(await response.json())).toMatchObject({
      status: "queued",
      attempts: 0,
      error: null,
    });
    expect(sent).toEqual([{ jobId: created.id, stage: null }]);

    // It is waiting now, so there is nothing to try again.
    const again = await api.send("POST", `/imports/${created.id}/retry`, undefined, {
      "Sec-Fetch-Site": "same-origin",
    });
    expect(again.status).toBe(404);
    expect(sent).toHaveLength(1);
  });

  it("removes an import", async () => {
    const api = apiWith(fakeQueue().queue);
    const created = await queued();

    expect((await api.delete(`/imports/${created.id}`)).status).toBe(204);
    expect(await loadImportJob(db, created.id)).toBeNull();
    expect((await api.delete(`/imports/${created.id}`)).status).toBe(404);
  });

  it("needs sign-in", async () => {
    const stranger = signedIn(env, "");

    expect((await stranger.get("/imports")).status).toBe(401);
    expect(
      (await stranger.post("/imports", { kind: "url", url: "https://example.com/" })).status,
    ).toBe(401);
  });
});
