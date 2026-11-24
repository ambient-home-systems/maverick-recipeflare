import {
  AiCheckRequest,
  type AiCheckResponse,
  type IngredientReading,
  isUnread,
  ReadIngredientsRequest,
  type ReadIngredientsResponse,
} from "@recipeflare/schema";
import { Hono } from "hono";
import { z } from "zod";
import { AiFailure, aiFor } from "../ai";
import { classifyFailure } from "../ai/failure";
import type { AiRunner } from "../ai/runner";
import type { AppEnv } from "../auth/types";
import { errorBody, jsonBody } from "../http";
import { householdParser, readLines } from "../imports/details";

/** What a failed reading is called, for the editor to explain. */
const READ_FAILED: Record<string, [code: string, status: 429 | 502 | 503]> = {
  unavailable: ["ai_unavailable", 503],
  limit: ["ai_limit", 429],
  bad_answer: ["ai_answer", 502],
  refused: ["ai_answer", 502],
};

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
  new Hono<AppEnv>()
    // Reads ingredient lines the rules could not, when the cook asks for it in
    // the editor. A line the rules read is not sent: its place in the answer is null.
    .post("/ingredients", jsonBody(ReadIngredientsRequest), async (c) => {
      const { lines } = c.req.valid("json");
      const parse = await householdParser(c.env.DB);
      const unread = lines.flatMap((line, index) => (isUnread(parse(line)) ? [index] : []));
      const readings: (IngredientReading | null)[] = lines.map(() => null);
      if (unread.length > 0) {
        try {
          const ai = runner ?? aiFor(c.env, c.req.url);
          const read = await readLines(
            unread.map((index) => lines[index] ?? ""),
            ai,
          );
          unread.forEach((index, at) => {
            readings[index] = read[at] ?? null;
          });
        } catch (error) {
          const failure = error instanceof AiFailure ? error : classifyFailure(error);
          const [code, status] = READ_FAILED[failure.reason] ?? ["ai_setup", 502];
          return c.json(errorBody(code, "The line could not be read with AI"), status);
        }
      }
      const body: ReadIngredientsResponse = { lines: readings };
      return c.json(body);
    })
    .post("/check", jsonBody(AiCheckRequest), async (c) => {
      if (c.get("member").role !== "owner") {
        return c.json(errorBody("forbidden", "Only the owner can check the AI connection"), 403);
      }
      const { task, model } = c.req.valid("json");
      let profile = "";
      let requested = model ?? "";
      try {
        const ai = runner ?? aiFor(c.env, c.req.url);
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
