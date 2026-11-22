import { z } from "zod";
import { DraftIssue, RecipeDraft } from "./draft";
import { Id, Timestamp } from "./primitives";

/** Phase 1 implements `url`. The others add handlers, not new machinery. */
export const ImportJobKind = z.enum(["url", "photo", "text", "video"]);
export type ImportJobKind = z.infer<typeof ImportJobKind>;

export const ImportJobStatus = z.enum([
  "queued",
  "running",
  "needs_review",
  "completed",
  "failed",
  "cancelled",
]);
export type ImportJobStatus = z.infer<typeof ImportJobStatus>;

/** What an importer hands to the review screen. */
export const ImportResult = z.object({
  draft: RecipeDraft,
  issues: z.array(DraftIssue),
});
export type ImportResult = z.infer<typeof ImportResult>;

export const ImportJob = z.object({
  id: Id,
  kind: ImportJobKind,
  status: ImportJobStatus,
  stage: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  result: ImportResult.nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  attempts: z.int().min(0),
  /** The recipe this import became, once the cook saved it. */
  recipeId: Id.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  finishedAt: Timestamp.nullable(),
});
export type ImportJob = z.infer<typeof ImportJob>;

/** Body of `POST /imports` for a link. */
export const UrlImportRequest = z.object({
  kind: z.literal("url"),
  url: z.url({ protocol: /^https?$/ }).max(2000),
});
export type UrlImportRequest = z.infer<typeof UrlImportRequest>;
