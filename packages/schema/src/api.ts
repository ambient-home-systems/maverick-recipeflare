import { z } from "zod";
import { Member } from "./lists";
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
