import { AiCheckRequest, type AiCheckResponse } from "@recipeflare/schema";
import { Hono } from "hono";
import { z } from "zod";
import { AiFailure, aiFor } from "../ai";
import { classifyFailure } from "../ai/failure";
import type { AiRunner } from "../ai/runner";
import type { AppEnv } from "../auth/types";
import { errorBody, jsonBody } from "../http";

/** A question with one right answer, and nothing of the household's in it. */
const CHECK = {
  system: "You are checking that a connection works. Answer in JSON and add nothing.",
  prompt: 'Give the word "ready" and the sum of 2 and 3.',
  schema: z.object({ word: z.string(), sum: z.number() }),
  schemaName: "connection_check",
  maxTokens: 512,
};

/**
 * `/api/v1/ai`. `runner` stands in for the real model runner in tests.
 *
 * The check is for the owner: it spends a little of the account's AI
 * allowance, and can be pointed at any model the account can reach.
 */
export const aiRoutes = (runner?: AiRunner) =>
  new Hono<AppEnv>().post("/check", jsonBody(AiCheckRequest), async (c) => {
    if (c.get("member").role !== "owner") {
      return c.json(errorBody("forbidden", "Only the owner can check the AI connection"), 403);
    }
    const { task, model } = c.req.valid("json");
    const ai = runner ?? aiFor(c.env);
    let profile = "";
    let requested = model ?? "";
    try {
      const chosen = ai.profile();
      profile = chosen.name;
      requested = model ?? chosen.models[task].id;
      const answer = await ai.run({ ...CHECK, task, model });
      const body: AiCheckResponse = {
        ok: true,
        profile,
        task,
        requested,
        model: answer.model,
        milliseconds: answer.milliseconds,
        usage: answer.usage,
        logId: answer.logId,
        tries: answer.tries,
      };
      return c.json(body);
    } catch (error) {
      // A failed check is still an answer to the question the owner asked.
      const failure = error instanceof AiFailure ? error : classifyFailure(error);
      const body: AiCheckResponse = {
        ok: false,
        profile,
        task,
        requested,
        reason: failure.reason,
        retryable: failure.retryable,
        message: failure.message.slice(0, 500),
      };
      return c.json(body);
    }
  });
