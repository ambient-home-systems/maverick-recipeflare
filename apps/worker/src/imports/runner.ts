import { checkDraft, type ImportJob, type ImportJobKind, RecipeDraft } from "@recipeflare/schema";
import { z } from "zod";
import {
  claimImportJob,
  failImportJob,
  finishImportJob,
  type JobInput,
  loadImportJobForRun,
} from "../db/importJobs";
import { keepPicture } from "./picture";

/**
 * Running an import: the part between a queue message and a job a person can
 * review. See docs/implementation-plan.md §7.
 */

/** The import could not be done now and may work later: the site was down, the network failed. */
export class RetryableImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetryableImportError";
  }
}

/** The import cannot be done, however often it is tried. `code` is one the app can explain. */
export class PermanentImportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PermanentImportError";
    this.code = code;
  }
}

/** What a handler is given besides the job: nothing it could not be handed in a test. */
export type ImportTools = { fetch: typeof fetch; env: Env };

/** One kind of import: it reads the source and returns what it found. It saves nothing. */
export type ImportHandler = (
  job: ImportJob,
  input: JobInput,
  tools: ImportTools,
) => Promise<unknown>;

export type ImportHandlers = Partial<Record<ImportJobKind, ImportHandler>>;

/** What a queue message carries: a pointer to the job, and nothing else. */
export const ImportMessage = z.object({ jobId: z.uuid() });
export type ImportMessage = z.infer<typeof ImportMessage>;

/** What to do with the message that asked for a run. */
export type RunOutcome = { ack: true } | { ack: false; delaySeconds: number };

/** A minute, then two, then four: a site that is down is given time to come back. */
const retryDelay = (attempts: number) => Math.min(60 * 2 ** Math.max(0, attempts - 1), 900);

/**
 * Runs one job. Safe to call again for the same job: a job a person already
 * has is left alone, and one that was running when its last attempt died is
 * simply run again and its result overwritten.
 */
export async function runImportJob(
  jobId: string,
  handlers: ImportHandlers,
  tools: ImportTools,
): Promise<RunOutcome> {
  const db = tools.env.DB;
  if (!(await claimImportJob(db, jobId))) {
    return { ack: true };
  }
  const loaded = await loadImportJobForRun(db, jobId);
  if (!loaded) {
    return { ack: true };
  }
  const { job, input, createdBy } = loaded;
  const handler = handlers[job.kind];
  if (!handler) {
    await failImportJob(db, jobId, {
      code: "unsupported",
      message: "This kind of import is not available yet.",
    });
    return { ack: true };
  }

  try {
    const draft = RecipeDraft.parse(await handler(job, input, tools));
    // The picture the source points at is fetched here, for every kind of
    // import, so that a handler still saves nothing itself.
    await keepPicture({ id: job.id, createdBy }, draft.imageUrl, tools);
    await finishImportJob(db, jobId, { draft, issues: checkDraft(draft) });
    return { ack: true };
  } catch (error) {
    if (error instanceof PermanentImportError) {
      await failImportJob(db, jobId, { code: error.code, message: error.message });
      return { ack: true };
    }
    if (error instanceof z.ZodError) {
      // The handler returned something that is not a draft. Trying again would return it again.
      await failImportJob(db, jobId, {
        code: "bad_draft",
        message: "What was read from the source could not be understood.",
      });
      return { ack: true };
    }
    // A retryable error, or one nobody foresaw: the job stays `running`, and
    // the queue brings the message back. Past its retries it reaches the
    // dead-letter queue, which marks the job failed.
    console.error("import: a run failed and will be retried", error);
    return { ack: false, delaySeconds: retryDelay(job.attempts) };
  }
}

/** True for the dead-letter queue, whatever the install calls its queues. */
const isDeadLetterQueue = (name: string) => name.endsWith("-dlq");

/**
 * The Worker's queue handler. Each message is acknowledged or retried by
 * itself, so one bad job cannot make the whole batch come back.
 */
export async function handleImportBatch(
  batch: MessageBatch<unknown>,
  handlers: ImportHandlers,
  tools: ImportTools,
): Promise<void> {
  for (const message of batch.messages) {
    const parsed = ImportMessage.safeParse(message.body);
    if (!parsed.success) {
      // Not one of ours. Bringing it back would not make it one.
      message.ack();
      continue;
    }
    if (isDeadLetterQueue(batch.queue)) {
      await failImportJob(tools.env.DB, parsed.data.jobId, {
        code: "retries_exhausted",
        message: "The import was tried several times and did not work.",
      });
      message.ack();
      continue;
    }
    try {
      const outcome = await runImportJob(parsed.data.jobId, handlers, tools);
      if (outcome.ack) {
        message.ack();
      } else {
        message.retry({ delaySeconds: outcome.delaySeconds });
      }
    } catch (error) {
      // The database itself failed. The message comes back and the run is tried again.
      console.error("import: could not run a job", error);
      message.retry({ delaySeconds: 60 });
    }
  }
}
