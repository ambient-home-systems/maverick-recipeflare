import {
  checkDraft,
  compareWithDraft,
  type ImportJob,
  type ImportJobKind,
  RecipeDraft,
} from "@recipeflare/schema";
import { z } from "zod";
import { AiFailure } from "../ai/failure";
import { profileNamed } from "../ai/profiles";
import type { AiAnswer, AiRequest, AiRunner, AiSettings } from "../ai/runner";
import {
  type AiCallRecord,
  advanceImportJob,
  claimImportJob,
  countAiImports,
  failImportJob,
  finishComparison,
  finishImportJob,
  type JobInput,
  type JobWork,
  keepImportWork,
  loadImportJobForRun,
  recipeOfImport,
} from "../db/importJobs";
import { loadRecipe } from "../db/recipes";
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

/** What a queue message carries: a pointer to the job, and the stage it is for. Nothing else. */
export const ImportMessage = z.object({
  jobId: z.uuid(),
  /**
   * The stage the job was at when the message was sent. A message that
   * arrives after the job has moved on is a second delivery, and is dropped.
   * Left out, the message is for whatever stage the job is at.
   */
  stage: z.string().nullable().optional(),
});
export type ImportMessage = z.infer<typeof ImportMessage>;

/**
 * What a handler is given besides the job: nothing it could not be handed in
 * a test. `ai` is the only way a handler reaches a model.
 */
export type ImportTools = {
  fetch: typeof fetch;
  env: Env & AiSettings;
  ai: AiRunner;
  /** Puts a message on the import queue. Left out, it is the queue itself. */
  send?: (message: ImportMessage) => Promise<unknown>;
};

/**
 * A handler's answer when the import is not finished: the stage to run next,
 * and what to keep for it. Anything else a handler returns is taken as the
 * finished draft.
 */
export class NextStage {
  readonly stage: string;
  readonly work: JobWork;

  constructor(stage: string, work: JobWork) {
    this.stage = stage;
    this.work = work;
  }
}

/**
 * A handler's answer when a model made the draft: the draft, and the text it
 * was made from, which review shows beside it.
 */
export class AiDraft {
  readonly draft: unknown;
  readonly sourceText: string;

  constructor(draft: unknown, sourceText: string) {
    this.draft = draft;
    this.sourceText = sourceText;
  }
}

/**
 * One kind of import. It is called once for each stage: `job.stage` says
 * which (null for the first), and `work` is what earlier stages kept. It
 * returns the draft (in an `AiDraft` when a model made it), or a `NextStage`.
 * It saves nothing.
 */
export type ImportHandler = (
  job: ImportJob,
  input: JobInput,
  tools: ImportTools,
  work: JobWork,
) => Promise<unknown>;

export type ImportHandlers = Partial<Record<ImportJobKind, ImportHandler>>;

/** What to do with the message that asked for a run. */
export type RunOutcome = { ack: true } | { ack: false; delaySeconds: number };

/** How many AI imports a day, unless `AI_DAILY_IMPORTS` says otherwise. */
export const DAILY_AI_IMPORTS = 100;
/** The queue brings a message back three times: the fourth delivery is the last. */
const LAST_ATTEMPT = 4;
/** No import has this many stages. One that asks for more is going round in circles. */
const MAX_STAGES = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A minute, then two, then four: a site that is down is given time to come back. */
const retryDelay = (attempts: number) => Math.min(60 * 2 ** Math.max(0, attempts - 1), 900);

/** What a failed model call means for the import, in a code the list can explain. */
function importError(failure: AiFailure): PermanentImportError {
  switch (failure.reason) {
    case "limit":
      return new PermanentImportError("ai_limit", failure.message);
    case "bad_answer":
    case "refused":
      return new PermanentImportError("ai_answer", failure.message);
    case "unavailable":
      return new PermanentImportError("ai_unavailable", failure.message);
    default:
      // A model that is gone, a request it will not take, a setting that names nothing.
      return new PermanentImportError("ai_setup", failure.message);
  }
}

/**
 * The model runner one job is handed. It is the app's runner with two things
 * added: the daily limit is checked before a job's first call, and every call
 * is written down in `calls`, to be kept with the job.
 */
function aiForJob(
  tools: ImportTools,
  jobId: string,
  calls: AiCallRecord[],
  /** The profile a comparison is run under, in place of the setting's. */
  under?: string,
): AiRunner {
  const limit = Number(tools.env.AI_DAILY_IMPORTS?.trim() || DAILY_AI_IMPORTS);
  const profile = () => (under ? profileNamed(under) : tools.ai.profile());
  return {
    profile,
    async run<T>(asked: AiRequest<T>) {
      const request: AiRequest<T> = under ? { ...asked, profile: under } : asked;
      if (calls.length === 0) {
        // A job that has already asked a model is let finish: stopping it
        // half-way would waste what it has spent.
        const since = new Date(Date.now() - DAY_MS).toISOString();
        if ((await countAiImports(tools.env.DB, since, jobId)) >= limit) {
          throw new AiFailure("limit", false, "Today's allowance of AI imports is used up.");
        }
      }
      const started = Date.now();
      let answer: AiAnswer<T>;
      try {
        answer = await tools.ai.run(request);
      } catch (error) {
        // A call that gave no answer is kept too, with how long it was waited
        // for: without it nobody can say afterwards why an import was slow.
        // One that was never made (no such profile) has nothing to record.
        if (error instanceof AiFailure && error.reason !== "settings") {
          calls.push({
            task: request.task,
            profile: profile().name,
            model: request.model ?? profile().models[request.task].id,
            prompt: request.promptVersion ?? null,
            milliseconds: Date.now() - started,
            inputTokens: null,
            outputTokens: null,
            tries: 0,
            at: new Date().toISOString(),
            failed: `${error.reason}: ${error.message}`.slice(0, 300),
          });
        }
        throw error;
      }
      calls.push({
        task: answer.task,
        profile: answer.profile,
        model: answer.model,
        prompt: answer.promptVersion,
        milliseconds: answer.milliseconds,
        inputTokens: answer.usage?.inputTokens ?? null,
        outputTokens: answer.usage?.outputTokens ?? null,
        reasoningTokens: answer.usage?.reasoningTokens ?? null,
        tries: answer.tries,
        at: new Date().toISOString(),
      });
      return answer;
    },
  };
}

/**
 * Runs one stage of one job. Safe to call again for the same job: a job a
 * person already has is left alone, a message for a stage the job has left
 * is dropped, and a stage that was running when its last attempt died is
 * simply run again and its result overwritten.
 */
export async function runImportJob(
  jobId: string,
  handlers: ImportHandlers,
  tools: ImportTools,
  forStage?: string | null,
): Promise<RunOutcome> {
  const db = tools.env.DB;
  if (forStage !== undefined) {
    // Looked at before the job is claimed, so that a second delivery does not
    // count as an attempt at a stage it was never for.
    const before = await loadImportJobForRun(db, jobId);
    if (!before || before.job.stage !== forStage) {
      return { ack: true };
    }
  }
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

  const calls: AiCallRecord[] = [...(loaded.work.calls ?? [])];
  const made = calls.length;
  /** What the job has gathered, with every model call made so far, this run's included. */
  const withCalls = (work: JobWork): JobWork => (calls.length > 0 ? { ...work, calls } : work);
  const fail = async (code: string, message: string): Promise<RunOutcome> => {
    if (calls.length > made) {
      await keepImportWork(db, jobId, withCalls(loaded.work));
    }
    await failImportJob(db, jobId, { code, message });
    return { ack: true };
  };

  try {
    const answer = await handler(
      job,
      input,
      { ...tools, ai: aiForJob(tools, jobId, calls, input.compare?.profile) },
      loaded.work,
    );

    if (answer instanceof NextStage) {
      const steps = (loaded.work.steps ?? 0) + 1;
      if (answer.stage === job.stage || steps > MAX_STAGES) {
        return fail("bad_draft", "The import did not finish.");
      }
      const work = withCalls({ ...answer.work, steps });
      if (!(await advanceImportJob(db, jobId, job.stage, answer.stage, work))) {
        // Another delivery of this message ran the stage first and has sent the next one.
        return { ack: true };
      }
      try {
        const message: ImportMessage = { jobId, stage: answer.stage };
        await (tools.send ?? ((next) => tools.env.IMPORT_QUEUE.send(next)))(message);
      } catch (error) {
        console.error("import: could not queue the next stage", error);
        // The job is at its next stage with what it gathered, so trying again takes up there.
        await failImportJob(db, jobId, {
          code: "not_queued",
          message: "The import could not be carried on. Try again.",
        });
      }
      return { ack: true };
    }

    const byAi = answer instanceof AiDraft;
    const draft = RecipeDraft.parse(byAi ? answer.draft : answer);
    if (input.compare) {
      // A comparison is not for review. Its draft is measured against the
      // recipe the cook settled on for the same card, and the job ends there.
      const recipe = await loadRecipe(db, (await recipeOfImport(db, input.compare.of)) ?? "");
      if (!recipe) {
        return fail("nothing_to_compare", "The recipe this was saved as is no longer here.");
      }
      await finishComparison(
        db,
        jobId,
        {
          draft,
          issues: checkDraft(draft),
          sourceText: byAi ? answer.sourceText : null,
          readBy: byAi ? "ai" : "structured-data",
        },
        {
          ...compareWithDraft(draft, recipe),
          profile: input.compare.profile,
          at: new Date().toISOString(),
        },
        withCalls(loaded.work),
      );
      return { ack: true };
    }
    // The picture the source points at is fetched here, for every kind of
    // import, so that a handler still saves nothing itself.
    await keepPicture({ id: job.id, createdBy }, draft.imageUrl, tools);
    await finishImportJob(
      db,
      jobId,
      {
        draft,
        issues: checkDraft(draft),
        sourceText: byAi ? answer.sourceText : null,
        readBy: byAi ? "ai" : "structured-data",
      },
      calls.length > 0 ? withCalls(loaded.work) : undefined,
    );
    return { ack: true };
  } catch (thrown) {
    let error = thrown;
    if (error instanceof AiFailure) {
      // A model that is busy is asked again, as a site that is down would be.
      // The last time round, the job says it was the model, not a site.
      error =
        error.retryable && job.attempts < LAST_ATTEMPT
          ? new RetryableImportError(error.message, { cause: error })
          : importError(error);
    }
    if (error instanceof PermanentImportError) {
      return fail(error.code, error.message);
    }
    if (error instanceof z.ZodError) {
      // The handler returned something that is not a draft. Trying again would return it again.
      return fail("bad_draft", "What was read from the source could not be understood.");
    }
    // A retryable error, or one nobody foresaw: the job stays `running`, and
    // the queue brings the message back. Past its retries it reaches the
    // dead-letter queue, which marks the job failed.
    console.error("import: a run failed and will be retried", error);
    if (calls.length > made) {
      await keepImportWork(db, jobId, withCalls(loaded.work));
    }
    return { ack: false, delaySeconds: retryDelay(job.attempts) };
  }
}

/** True for the dead-letter queue, whatever the install calls its queues. */
const isDeadLetterQueue = (name: string) => name.endsWith("-dlq");

/** One message of a batch: run its job, then acknowledge it or ask for it back. */
async function handleImportMessage(
  message: Message<unknown>,
  deadLetter: boolean,
  handlers: ImportHandlers,
  tools: ImportTools,
): Promise<void> {
  const parsed = ImportMessage.safeParse(message.body);
  if (!parsed.success) {
    // Not one of ours. Bringing it back would not make it one.
    message.ack();
    return;
  }
  try {
    if (deadLetter) {
      await failImportJob(tools.env.DB, parsed.data.jobId, {
        code: "retries_exhausted",
        message: "The import was tried several times and did not work.",
      });
      message.ack();
      return;
    }
    const outcome = await runImportJob(parsed.data.jobId, handlers, tools, parsed.data.stage);
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

/**
 * The Worker's queue handler. Each message is acknowledged or retried by
 * itself, so one bad job cannot make the whole batch come back.
 *
 * The jobs of a batch run side by side, not one after another. Nearly all of
 * a job's time is spent waiting for a model, and the queue adds consumers only
 * between batches: run in turn, the cards of one sitting wait for each other,
 * and the last of five waits for the four before it.
 */
export async function handleImportBatch(
  batch: MessageBatch<unknown>,
  handlers: ImportHandlers,
  tools: ImportTools,
): Promise<void> {
  const deadLetter = isDeadLetterQueue(batch.queue);
  await Promise.all(
    batch.messages.map((message) => handleImportMessage(message, deadLetter, handlers, tools)),
  );
}
