import { z } from "zod";
import { Member } from "./lists";

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
