import {
  canonicalUrl,
  type DraftIssue,
  ImportJob,
  type ImportJobKind,
  newId,
  type RecipeDraft,
} from "@recipeflare/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { importJobs, recipes } from "./schema";

/**
 * Import jobs, as docs/implementation-plan.md §7 describes. The row is the
 * source of truth for an import: a queue message only points at it.
 */

type Row = typeof importJobs.$inferSelect;

/** What a job was asked to do, as stored: the kind's own input. */
export type JobInput = {
  url?: string;
  /** The page as the cook's browser read it, when it was sent from there. */
  page?: { siteName: string | null; blocks: string[] };
};

function toJob(row: Row): ImportJob {
  return ImportJob.parse({
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

export async function loadImportJob(db: D1Database, id: string): Promise<ImportJob | null> {
  const row = await drizzle(db).select().from(importJobs).where(eq(importJobs.id, id)).get();
  return row ? toJob(row) : null;
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

/** A job together with what it was asked to do, for the runner. */
export async function loadImportJobForRun(
  db: D1Database,
  id: string,
): Promise<{ job: ImportJob; input: JobInput; createdBy: string } | null> {
  const row = await drizzle(db).select().from(importJobs).where(eq(importJobs.id, id)).get();
  return row
    ? { job: toJob(row), input: JSON.parse(row.input) as JobInput, createdBy: row.createdBy }
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

/** Stores what the importer found and hands the job to a person. Only a running job can be finished. */
export async function finishImportJob(
  db: D1Database,
  id: string,
  result: { draft: RecipeDraft; issues: DraftIssue[] },
): Promise<void> {
  const at = now();
  await drizzle(db)
    .update(importJobs)
    .set({
      status: "needs_review",
      result: JSON.stringify(result),
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

/** Puts a failed job back in line, as if it had just been asked for. Null if it is not a failed job. */
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
