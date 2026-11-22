import { z } from "zod";

/** Body of `GET /api/v1/health`. */
export const HealthResponse = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Body of every API error response. */
export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
