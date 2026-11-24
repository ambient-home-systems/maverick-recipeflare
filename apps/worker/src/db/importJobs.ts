import {
  canonicalUrl,
  type DraftIssue,
  type ImportCall,
  ImportJob,
  type ImportJobKind,
  newId,
  type ReadBy,
  type RecipeDraft,
} from "@recipeflare/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { assets, importJobs, recipes } from "./schema";

/**
 * Import jobs, as docs/implementation-plan.md §7 describes. The row is the
 * source of truth for an import: a queue message only points at it.
 */

type Row = typeof importJobs.$inferSelect;

/** What a job was asked to do, as stored: the kind's own input. */
export type JobInput = {
  url?: string;
  /** The page as the cook's browser read it, when it was sent from there. */
  page?: { siteName: string | null; blocks: string[]; text?: string | null };
  /** Text the cook pasted in. */
  text?: string;
  /** The sides of a photographed card, front first: the IDs of its pictures. */
  photos?: string[];
  /** The card's place in the sitting it was photographed in, counted from one. */
  card?: number;
};

/** One call a job made to a model: what it was for, who answered and what it cost. */
export type AiCallRecord = {
  task: string;
  profile: string;
  model: string;
  /** Which wording of the prompt was used. */
  prompt: string | null;
  milliseconds: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** How many of the tokens written were reasoning, when the model says. */
  reasoningTokens?: number | null;
  tries: number;
  at: string;
  /** Why the call gave no answer: the failure's reason and the service's words. Absent for one that did. */
  failed?: string;
};

/**
 * What a staged import has gathered so far. A stage reads it, does its one
 * thing, and hands back what the next stage needs. `calls` and `steps` are the
 * runner's own; the rest is the handler's.
 */
export type JobWork = {
  /** The model calls made for this job, in order. */
  calls?: AiCallRecord[];
  /** How many stages the job has finished. */
  steps?: number;
  [key: string]: unknown;
};

function toWork(text: string | null): JobWork {
  if (text === null) {
    return {};
  }
  const parsed: unknown = JSON.parse(text);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as JobWork)
    : {};
}

function toJob(row: Row): ImportJob {
  // Only a photographed card says where it was in its sitting; other kinds keep their input to themselves.
  const card = row.kind === "photo" ? (JSON.parse(row.input) as JobInput).card : undefined;
  return ImportJob.parse({
    ...(typeof card === "number" ? { card } : {}),
    id: row.id,
    kind: row.kind,
    status: row.status,
    stage: row.stage,
    sourceUrl: row.sourceUrl,
    result: row.result === null ? null : JSON.parse(row.result),
    error: row.errorCode === null ? null : { code: row.errorCode, message: row.errorMessage ?? "" },
    attempts: row.attempts,
    recipeId: row.recipeId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    finishedAt: row.finishedAt,
  });
}

const now = () => new Date().toISOString();

/** Statuses a person still has something to do about, or to wait for. */
const OPEN = ["queued", "running", "needs_review", "failed"];

export async function createImportJob(
  db: D1Database,
  job: { kind: ImportJobKind; sourceUrl: string | null; input: JobInput },
  memberId: string,
): Promise<ImportJob> {
  const at = now();
  const row = {
    id: newId(),
    kind: job.kind,
    status: "queued",
    stage: null,
    sourceUrl: job.sourceUrl === null ? null : canonicalUrl(job.sourceUrl),
    input: JSON.stringify(job.input),
    result: null,
    work: null,
    review: null,
    errorCode: null,
    errorMessage: null,
    attempts: 0,
    recipeId: null,
    createdBy: memberId,
    createdAt: at,
    updatedAt: at,
    finishedAt: null,
  };
  await drizzle(db).insert(importJobs).values(row);
  return toJob(row);
}

/** Why a card's photos cannot be made into an import, in words for the app. */
export type PhotosRefused = { refused: string };

/**
 * Takes on one photographed card: a queued job, with the card's pictures made
 * the job's own, in the order given. The pictures must be ones that were
 * uploaded and belong to nothing yet. The job and its pictures are written
 * together, so a card is never half taken on.
 */
export async function createPhotoImportJob(
  db: D1Database,
  photoIds: readonly string[],
  memberId: string,
  card?: number,
): Promise<ImportJob | PhotosRefused> {
  const orm = drizzle(db);
  const wanted = [...new Set(photoIds)];
  if (wanted.length !== photoIds.length) {
    return { refused: "A photo is listed twice" };
  }
  const found = await orm
    .select({
      id: assets.id,
      recipeId: assets.recipeId,
      importJobId: assets.importJobId,
      contentType: assets.contentType,
    })
    .from(assets)
    .where(sql`${assets.id} IN (SELECT value FROM json_each(${JSON.stringify(wanted)}))`);
  if (found.length !== wanted.length) {
    return { refused: "A photo is not here. It may have been cleared away; send it again" };
  }
  if (found.some((asset) => asset.recipeId !== null || asset.importJobId !== null)) {
    return { refused: "A photo already belongs to a recipe or to another import" };
  }
  if (found.some((asset) => !asset.contentType.startsWith("image/"))) {
    return { refused: "A card's sides must be pictures" };
  }

  const at = now();
  const row = {
    id: newId(),
    kind: "photo",
    status: "queued",
    stage: null,
    sourceUrl: null,
    input: JSON.stringify({ photos: wanted, card } satisfies JobInput),
    result: null,
    work: null,
    review: null,
    errorCode: null,
    errorMessage: null,
    attempts: 0,
    recipeId: null,
    createdBy: memberId,
    createdAt: at,
    updatedAt: at,
    finishedAt: null,
  };
  const [first, ...rest] = wanted.map((id, position) =>
    orm
      .update(assets)
      // A card's sides are the recipe's original card once it is saved.
      .set({ importJobId: row.id, position, role: "original" })
      .where(and(eq(assets.id, id), isNull(assets.recipeId), isNull(assets.importJobId))),
  );
  if (!first) {
    return { refused: "A card needs at least one photo" };
  }
  await orm.batch([orm.insert(importJobs).values(row), first, ...rest]);
  return toJob(row);
}

export async function loadImportJob(db: D1Database, id: string): Promise<ImportJob | null> {
  const row = await drizzle(db).select().from(importJobs).where(eq(importJobs.id, id)).get();
  return row ? toJob(row) : null;
}

/**
 * The model calls a job has made, as the detail route shows them: times and
 * token counts, and for a call that gave no answer, why. Nothing that was
 * asked or answered is in them.
 */
export async function importCalls(db: D1Database, id: string): Promise<ImportCall[]> {
  const row = await drizzle(db)
    .select({ work: importJobs.work })
    .from(importJobs)
    .where(eq(importJobs.id, id))
    .get();
  return (toWork(row?.work ?? null).calls ?? []).map((call) => ({
    task: call.task,
    model: call.model,
    milliseconds: call.milliseconds,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    reasoningTokens: call.reasoningTokens ?? null,
    tries: call.tries,
    failed: call.failed ?? null,
    at: call.at,
  }));
}

/** The oldest recipe saved from a link, if the household has one. `url` is in its canonical form. */
export async function recipeFromLink(
  db: D1Database,
  url: string,
): Promise<{ slug: string; title: string } | null> {
  const row = await drizzle(db)
    .select({ slug: recipes.slug, title: recipes.title })
    .from(recipes)
    .where(eq(recipes.sourceUrl, url))
    .orderBy(recipes.createdAt)
    .limit(1)
    .get();
  return row ?? null;
}

/** A job together with what it was asked to do and what it has gathered, for the runner. */
export async function loadImportJobForRun(
  db: D1Database,
  id: string,
): Promise<{ job: ImportJob; input: JobInput; work: JobWork; createdBy: string } | null> {
  const row = await drizzle(db).select().from(importJobs).where(eq(importJobs.id, id)).get();
  return row
    ? {
        job: toJob(row),
        input: JSON.parse(row.input) as JobInput,
        work: toWork(row.work),
        createdBy: row.createdBy,
      }
    : null;
}

/** The imports a person still has to wait for or deal with, newest first. */
export async function listOpenImportJobs(db: D1Database): Promise<ImportJob[]> {
  const rows = await drizzle(db)
    .select()
    .from(importJobs)
    .where(inArray(importJobs.status, OPEN))
    .orderBy(desc(importJobs.createdAt))
    .limit(50);
  return rows.map(toJob);
}

/**
 * Takes a job to run it: `running`, with one more attempt counted. False when
 * the job is already past running, or gone, in which case there is nothing to do.
 */
export async function claimImportJob(db: D1Database, id: string): Promise<boolean> {
  const claimed = await drizzle(db)
    .update(importJobs)
    .set({ status: "running", attempts: sql`${importJobs.attempts} + 1`, updatedAt: now() })
    .where(and(eq(importJobs.id, id), inArray(importJobs.status, ["queued", "running"])))
    .returning({ id: importJobs.id });
  return claimed.length > 0;
}

/**
 * Moves a running job on to its next stage, keeping what it has gathered. The
 * attempt count starts again: retries are counted for each stage by itself.
 *
 * False when the job is no longer at `from`: another delivery of the same
 * message got there first, and this one has nothing left to do.
 */
export async function advanceImportJob(
  db: D1Database,
  id: string,
  from: string | null,
  to: string,
  work: JobWork,
): Promise<boolean> {
  const moved = await drizzle(db)
    .update(importJobs)
    .set({ stage: to, work: JSON.stringify(work), attempts: 0, updatedAt: now() })
    .where(
      and(
        eq(importJobs.id, id),
        eq(importJobs.status, "running"),
        from === null ? isNull(importJobs.stage) : eq(importJobs.stage, from),
      ),
    )
    .returning({ id: importJobs.id });
  return moved.length > 0;
}

/** Keeps a job's record of its model calls when a stage did not finish. Changes nothing else. */
export async function keepImportWork(db: D1Database, id: string, work: JobWork): Promise<void> {
  await drizzle(db)
    .update(importJobs)
    .set({ work: JSON.stringify(work) })
    .where(eq(importJobs.id, id));
}

/**
 * How many imports asked a model since `since`, not counting `exceptId`. An
 * import that was discarded is gone and no longer counts.
 */
export async function countAiImports(
  db: D1Database,
  since: string,
  exceptId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM import_jobs
       WHERE created_at >= ?1 AND id != ?2
         AND work IS NOT NULL AND json_array_length(work, '$.calls') > 0`,
    )
    .bind(since, exceptId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Stores what the importer found and hands the job to a person. Only a running job can be finished. */
export async function finishImportJob(
  db: D1Database,
  id: string,
  result: { draft: RecipeDraft; issues: DraftIssue[]; sourceText?: string | null; readBy?: ReadBy },
  work?: JobWork,
): Promise<void> {
  const at = now();
  await drizzle(db)
    .update(importJobs)
    .set({
      status: "needs_review",
      result: JSON.stringify(result),
      ...(work ? { work: JSON.stringify(work) } : {}),
      errorCode: null,
      errorMessage: null,
      updatedAt: at,
      finishedAt: at,
    })
    .where(and(eq(importJobs.id, id), eq(importJobs.status, "running")));
}

/** Marks a job failed, with a code the app can explain. A job a person already has is left alone. */
export async function failImportJob(
  db: D1Database,
  id: string,
  error: { code: string; message: string },
): Promise<void> {
  const at = now();
  await drizzle(db)
    .update(importJobs)
    .set({
      status: "failed",
      errorCode: error.code,
      errorMessage: error.message.slice(0, 500),
      updatedAt: at,
      finishedAt: at,
    })
    .where(and(eq(importJobs.id, id), inArray(importJobs.status, ["queued", "running"])));
}

/**
 * Puts a failed job back in line. It keeps its stage and what it had gathered,
 * so it takes up where it failed: a card that was read is not read again
 * because a later stage failed. Null if it is not a failed job.
 */
export async function requeueImportJob(db: D1Database, id: string): Promise<ImportJob | null> {
  const rows = await drizzle(db)
    .update(importJobs)
    .set({
      status: "queued",
      attempts: 0,
      errorCode: null,
      errorMessage: null,
      result: null,
      updatedAt: now(),
      finishedAt: null,
    })
    .where(and(eq(importJobs.id, id), eq(importJobs.status, "failed")))
    .returning();
  return rows[0] ? toJob(rows[0]) : null;
}

/** Removes a job. False if there was none. */
export async function deleteImportJob(db: D1Database, id: string): Promise<boolean> {
  const removed = await drizzle(db)
    .delete(importJobs)
    .where(eq(importJobs.id, id))
    .returning({ id: importJobs.id });
  return removed.length > 0;
}
