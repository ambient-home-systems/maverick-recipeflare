import { z } from "zod";
import { Id, Name, PositiveNumber, Slug, Timestamp } from "./primitives";

// --- Organizers: categories, tags and tools share one shape. ---

export const OrganizerKind = z.enum(["category", "tag", "tool"]);
export type OrganizerKind = z.infer<typeof OrganizerKind>;

/** An organizer as it appears on a recipe. */
export const OrganizerRef = z.object({
  id: Id,
  name: z.string(),
  slug: Slug,
});
export type OrganizerRef = z.infer<typeof OrganizerRef>;

/** The divider stock a category owns: one of five card-stock colours. */
export const OrganizerColor = z.enum(["buff", "salmon", "sky", "mint", "lilac"]);
export type OrganizerColor = z.infer<typeof OrganizerColor>;

export const Organizer = OrganizerRef.extend({
  kind: OrganizerKind,
  /** Set for a category when it is created, and kept. Null for tags and tools. */
  color: OrganizerColor.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Organizer = z.infer<typeof Organizer>;

export const OrganizerInput = z.object({ name: Name });
export type OrganizerInput = z.infer<typeof OrganizerInput>;

export const OrganizerCreate = OrganizerInput.extend({ kind: OrganizerKind });
export type OrganizerCreate = z.infer<typeof OrganizerCreate>;

// --- Labels: groups of foods, and the store aisles in Phase 4. ---

export const Label = z.object({
  id: Id,
  name: z.string(),
  color: z.string().nullable(),
  sortOrder: z.int(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Label = z.infer<typeof Label>;

export const LabelInput = z.object({
  name: Name,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  sortOrder: z.int().default(0),
});
export type LabelInput = z.infer<typeof LabelInput>;

// --- Foods ---

const Aliases = z.array(Name).max(20);

/** A food as it appears on an ingredient line. */
export const FoodRef = z.object({
  id: Id,
  name: z.string(),
  pluralName: z.string().nullable(),
});
export type FoodRef = z.infer<typeof FoodRef>;

export const Food = FoodRef.extend({
  description: z.string(),
  aliases: z.array(z.string()),
  labelId: Id.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Food = z.infer<typeof Food>;

export const FoodInput = z.object({
  name: Name,
  pluralName: Name.nullable().default(null),
  description: z.string().max(500).default(""),
  aliases: Aliases.default([]),
  labelId: Id.nullable().default(null),
});
export type FoodInput = z.infer<typeof FoodInput>;

// --- Units ---

/** A unit as it appears on an ingredient line. */
export const UnitRef = z.object({
  id: Id,
  name: z.string(),
  pluralName: z.string().nullable(),
  abbreviation: z.string().nullable(),
  pluralAbbreviation: z.string().nullable(),
  useAbbreviation: z.boolean(),
  /** Show quantities in this unit as fractions (1½ cups) instead of decimals (1.5 kg). */
  fraction: z.boolean(),
});
export type UnitRef = z.infer<typeof UnitRef>;

export const Unit = UnitRef.extend({
  description: z.string(),
  aliases: z.array(z.string()),
  /** With `standardUnit`, the conversion to a base unit. Used from Phase 5. */
  standardQuantity: z.number().nullable(),
  standardUnit: z.string().nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Unit = z.infer<typeof Unit>;

export const UnitInput = z.object({
  name: Name,
  pluralName: Name.nullable().default(null),
  abbreviation: Name.nullable().default(null),
  pluralAbbreviation: Name.nullable().default(null),
  useAbbreviation: z.boolean().default(false),
  fraction: z.boolean().default(true),
  description: z.string().max(500).default(""),
  aliases: Aliases.default([]),
  standardQuantity: PositiveNumber.nullable().default(null),
  standardUnit: Name.nullable().default(null),
});
export type UnitInput = z.infer<typeof UnitInput>;

// --- Members ---

export const MemberRole = z.enum(["owner", "member"]);
export type MemberRole = z.infer<typeof MemberRole>;

export const Member = z.object({
  id: Id,
  email: z.string().nullable(),
  displayName: z.string(),
  role: MemberRole,
});
export type Member = z.infer<typeof Member>;

// --- Assets: images and attachments ---

/** `original` is a photo of the paper card the recipe came from. */
export const AssetRole = z.enum(["cover", "photo", "original", "attachment"]);
export type AssetRole = z.infer<typeof AssetRole>;

export const Asset = z.object({
  id: Id,
  role: AssetRole,
  position: z.int(),
  contentType: z.string(),
  sizeBytes: z.int().min(0),
  width: z.int().positive().nullable(),
  height: z.int().positive().nullable(),
  /** True once the resized WebP variants exist. */
  hasVariants: z.boolean(),
  originalFilename: z.string().nullable(),
  createdAt: Timestamp,
});
export type Asset = z.infer<typeof Asset>;
