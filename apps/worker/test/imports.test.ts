import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { ErrorBody, ImportJob, ImportListResponse, newId } from "@recipeflare/schema";
import { fixtureMember } from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src";
import { createImportJob, finishImportJob, loadImportJob } from "../src/db/importJobs";
import {
  handleImportBatch,
  type ImportHandler,
  PermanentImportError,
  RetryableImportError,
  runImportJob,
} from "../src/imports/runner";
import { seedLists, signedIn } from "./helpers";

const db = env.DB;
const QUEUE = "recipeflare-imports";
const DEAD_LETTERS = "recipeflare-imports-dlq";

beforeAll(async () => {
  await seedLists(db);
});

const tools = { fetch, env };
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
  it("runs a delivered batch, and fails an import from a link until that importer is built", async () => {
    const created = await queued();
    const batch = batchOf(QUEUE, { jobId: created.id });
    const ctx = createExecutionContext();

    await worker.queue(batch as MessageBatch<never>, env);

    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks).toEqual(acked(batch));
    expect(await job(created.id)).toMatchObject({
      status: "failed",
      error: { code: "unsupported" },
    });
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
    expect(sent).toEqual([{ jobId: created.id }]);
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
    expect(sent).toEqual([{ jobId: created.id }]);

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
