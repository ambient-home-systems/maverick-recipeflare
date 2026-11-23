import { z } from "zod";

/**
 * Size caps for a recipe. They are part of the schema because the Worker's
 * one-batch save relies on them: see "One-batch recipe save" in
 * docs/implementation-plan.md.
 */
export const LIMITS = {
  titleLength: 200,
  descriptionLength: 2000,
  yieldUnitLength: 60,
  sectionTitleLength: 100,
  ingredientLines: 100,
  ingredientTextLength: 500,
  steps: 100,
  stepTextLength: 4000,
  notes: 20,
  noteTitleLength: 200,
  noteTextLength: 4000,
  organizers: 50,
  nutritionValueLength: 60,
  nameLength: 100,
  urlLength: 2000,
  sourceNameLength: 200,
  /** Photos, card sides and attachments on one recipe. */
  assets: 30,
  /** One uploaded file: 15 MB. */
  uploadBytes: 15 * 1024 * 1024,
  /** Text pasted in to be made into a recipe: far more than any recipe, and still one model call. */
  pastedText: 50_000,
  /** One thing an importer was unsure of, in a sentence. */
  doubtLength: 300,
  /** 99 hours 59 minutes. */
  durationSeconds: 99 * 3600 + 59 * 60,
} as const;

/** A UUID in lowercase hyphenated form. Any version is accepted. */
export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

/** ISO 8601 UTC timestamp with milliseconds, as the Worker writes it. */
export const Timestamp = z.iso.datetime();
export type Timestamp = z.infer<typeof Timestamp>;

export const Slug = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const DurationSeconds = z.int().min(0).max(LIMITS.durationSeconds);

/** A quantity, a serving count or a yield: any finite number above zero. */
export const PositiveNumber = z.number().positive();

/** A person-entered name: trimmed, not empty. */
export const Name = z.string().trim().min(1).max(LIMITS.nameLength);
