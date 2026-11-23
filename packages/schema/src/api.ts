import { z } from "zod";
import { Food, Label, Member, Organizer, Unit } from "./lists";
import { Id } from "./primitives";
import { Recipe, RecipeSummary } from "./recipe";

/** Body of `GET /api/v1/health`. */
export const HealthResponse = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Body of `GET /api/v1/me`: who is signed in. */
export const MeResponse = z.object({
  member: Member,
});
export type MeResponse = z.infer<typeof MeResponse>;

/** One problem with one field, for showing an error beside that field. */
export const FieldIssue = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type FieldIssue = z.infer<typeof FieldIssue>;

/** Body of every API error response. */
export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(FieldIssue).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/**
 * Body of a 409 from saving a recipe that someone else saved first: the error,
 * and the recipe as it is now, so the editor can show what changed.
 */
export const ConflictBody = ErrorBody.extend({ current: Recipe });
export type ConflictBody = z.infer<typeof ConflictBody>;

/** How the recipe list can be ordered. */
export const RecipeSort = z.enum(["changed", "newest", "title"]);
export type RecipeSort = z.infer<typeof RecipeSort>;

/** The list loads this many recipes at a time. */
export const RECIPES_PER_PAGE = 30;

/** Query of `GET /api/v1/recipes`, as it arrives: every value is text. */
export const RecipeListQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(RECIPES_PER_PAGE),
  sort: RecipeSort.default("changed"),
});
export type RecipeListQuery = z.infer<typeof RecipeListQuery>;

/** Body of `GET /api/v1/recipes`: one page of the list, and how many recipes there are in all. */
export const RecipeListResponse = z.object({
  items: z.array(RecipeSummary),
  page: z.int().min(1),
  perPage: z.int().min(1),
  total: z.int().min(0),
});
export type RecipeListResponse = z.infer<typeof RecipeListResponse>;

// --- The household's lists: organizers, foods, units and labels ---

const useCount = z.int().min(0);

/** An organizer with the number of recipes that use it, for the pickers and the manage screens. */
export const OrganizerEntry = Organizer.extend({ recipeCount: useCount });
export type OrganizerEntry = z.infer<typeof OrganizerEntry>;
export const FoodEntry = Food.extend({ recipeCount: useCount });
export type FoodEntry = z.infer<typeof FoodEntry>;
export const UnitEntry = Unit.extend({ recipeCount: useCount });
export type UnitEntry = z.infer<typeof UnitEntry>;
export const LabelEntry = Label.extend({ foodCount: useCount });
export type LabelEntry = z.infer<typeof LabelEntry>;

export const OrganizerListResponse = z.object({ items: z.array(OrganizerEntry) });
export type OrganizerListResponse = z.infer<typeof OrganizerListResponse>;
export const FoodListResponse = z.object({ items: z.array(FoodEntry) });
export type FoodListResponse = z.infer<typeof FoodListResponse>;
export const UnitListResponse = z.object({ items: z.array(UnitEntry) });
export type UnitListResponse = z.infer<typeof UnitListResponse>;
export const LabelListResponse = z.object({ items: z.array(LabelEntry) });
export type LabelListResponse = z.infer<typeof LabelListResponse>;

/**
 * Body of a 409 `duplicate`: the name is already taken. `existingId` is the
 * entry that has it, so a picker can select that one.
 */
export const DuplicateBody = ErrorBody.extend({ existingId: Id });
export type DuplicateBody = z.infer<typeof DuplicateBody>;

/** Body of a 409 `in_use`: a food or unit that recipes use cannot be deleted. */
export const InUseBody = ErrorBody.extend({ recipeCount: z.int().min(1) });
export type InUseBody = z.infer<typeof InUseBody>;
