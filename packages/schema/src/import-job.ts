import { z } from "zod";
import { DraftIssue, RecipeDraft } from "./draft";
import { Id, LIMITS, Timestamp } from "./primitives";

/** How much of a page a browser may send: enough for any recipe page, and no more. */
export const SENT_PAGE_LIMITS = { blocks: 40, blockLength: 400_000, totalLength: 600_000 } as const;

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

/** How a draft was read: from what a page states in structured data, or by a model. */
export const ReadBy = z.enum(["structured-data", "ai"]);
export type ReadBy = z.infer<typeof ReadBy>;

/** What an importer hands to the review screen. */
export const ImportResult = z.object({
  draft: RecipeDraft,
  issues: z.array(DraftIssue),
  /** The text the draft was made from, to check it against. Null for a link read from structured data. */
  sourceText: z.string().nullable().default(null),
  readBy: ReadBy.default("structured-data"),
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

/**
 * A recipe page as the cook's own browser read it: the page's address, what
 * the site calls itself, and its JSON-LD blocks, as text. The "Send to
 * Recipeflare" bookmark gathers this from the page the browser is showing.
 */
export const SentPage = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2000),
  siteName: z.string().max(200).nullable().default(null),
  blocks: z.array(z.string().max(SENT_PAGE_LIMITS.blockLength)).max(SENT_PAGE_LIMITS.blocks),
});
export type SentPage = z.infer<typeof SentPage>;

/**
 * Body of `POST /imports` for a link. With `page`, the page has already been
 * read by the cook's browser and is not fetched again.
 */
export const UrlImportRequest = z.object({
  kind: z.literal("url"),
  url: z.url({ protocol: /^https?$/ }).max(2000),
  page: SentPage.pick({ siteName: true, blocks: true }).optional(),
});
export type UrlImportRequest = z.infer<typeof UrlImportRequest>;

/** Body of `POST /imports` for text pasted in: a recipe copied from anywhere, to be made into a draft. */
export const TextImportRequest = z.object({
  kind: z.literal("text"),
  text: z.string().trim().min(1).max(LIMITS.pastedText),
});
export type TextImportRequest = z.infer<typeof TextImportRequest>;

/** Body of `POST /imports`. */
export const ImportRequest = z.discriminatedUnion("kind", [UrlImportRequest, TextImportRequest]);
export type ImportRequest = z.infer<typeof ImportRequest>;
