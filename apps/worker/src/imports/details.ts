import {
  AI_LINES_AT_ONCE,
  type IngredientReading,
  ingredientParser,
  isUnread,
  LIMITS,
  type LineParser,
  RecipeDraft,
  readQuantity,
} from "@recipeflare/schema";
import { z } from "zod";
import { AiFailure } from "../ai/failure";
import { LINES_PROMPT } from "../ai/prompts";
import type { AiRunner } from "../ai/runner";
import { listFoods, listUnits } from "../db/lists";
import { AiDraft, type ImportTools, NextStage } from "./runner";
import { sourceOf, wordsOf } from "./sourceCheck";

/**
 * The `details` stage's first job: ingredient lines the rules could not read.
 * See docs/phase-2-plan.md §4 and §5, rule 1.
 *
 * A line the rules read is never sent to a model. One they could not is, and
 * what the model says of it is checked against the line, field by field: an
 * amount, a unit or a food the line does not state is dropped, and the line
 * stays as written. A wrong reading is worse than none.
 */

/** What the model is asked to fill: one entry for each numbered line. */
export const LineReadings = z.object({
  lines: z.array(
    z.object({
      number: z.number(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      food: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
});
export type LineReadings = z.infer<typeof LineReadings>;
type LineAnswer = LineReadings["lines"][number];

/** An amount spelt out. Only these: a word that could be read two ways is not an amount. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  half: 0.5,
  quarter: 0.25,
  dozen: 12,
};

/** What joins the two ends of a range or a choice of amounts: "4 to 6", "2-3", "2 or 3". */
const RANGE = /^\s*(?:to|or|-|–|—)\s*(.+)$/i;

/**
 * The one amount a line states, if it states exactly one where an amount
 * belongs: the first number in it, unless that number opens a range. Null for
 * a line with no amount, and for "4 to 6 cups", which states two.
 */
export function statedAmount(line: string): number | null {
  const tokens = line.trim().split(/\s+/);
  for (let at = 0; at < tokens.length; at++) {
    const read = readQuantity(tokens.slice(at).join(" "));
    if (read) {
      const further = RANGE.exec(read.rest);
      return further?.[1] && readQuantity(further[1]) ? null : read.quantity;
    }
  }
  for (const word of wordsOf(line)) {
    const spelt = NUMBER_WORDS[word];
    if (spelt !== undefined) {
      return spelt;
    }
  }
  return null;
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * What of a model's answer the line itself bears out. Each field stands or
 * falls alone. Null when nothing is left that says what the ingredient is.
 */
export function checkReading(line: string, answer: LineAnswer): IngredientReading | null {
  const source = sourceOf(line);
  const stated = statedAmount(line);
  const quantity =
    answer.quantity !== null &&
    answer.quantity > 0 &&
    stated !== null &&
    same(answer.quantity, stated)
      ? stated
      : null;

  /** A name the line has, words together and in order; otherwise nothing. */
  const named = (value: string | null) => {
    const text = value?.trim() ?? "";
    return text !== "" && wordsOf(text).length > 0 && source.hasRun(text)
      ? text.slice(0, LIMITS.nameLength)
      : null;
  };
  const unitName = named(answer.unit);
  const foodName = named(answer.food);
  if (quantity === null && unitName === null && foodName === null) {
    return null;
  }

  const said = answer.note?.trim() ?? "";
  const note =
    said !== "" && source.missing(said).length === 0
      ? said.slice(0, LIMITS.ingredientTextLength)
      : "";
  return { quantity, unitName, foodName, note };
}

/**
 * Asks a model to read `lines`, and keeps what each line bears out. One call
 * for all of them. The answer is one entry for each line, in order: null
 * where nothing could be kept.
 */
export async function readLines(
  lines: readonly string[],
  ai: AiRunner,
): Promise<(IngredientReading | null)[]> {
  if (lines.length === 0) {
    return [];
  }
  const answer = await ai.run({
    task: "details",
    promptVersion: LINES_PROMPT.version,
    system: LINES_PROMPT.system,
    prompt: `The lines:\n\n${lines.map((line, index) => `${index + 1}. ${line}`).join("\n")}`,
    schema: LineReadings,
    schemaName: "ingredient_lines",
    maxTokens: 4000,
  });
  return lines.map((line, index) => {
    const said = answer.value.lines.find((entry) => entry.number === index + 1);
    return said ? checkReading(line, said) : null;
  });
}

/** A parser for the household's own units and foods, as the editor has. */
export async function householdParser(db: D1Database): Promise<LineParser> {
  const [units, foods] = await Promise.all([listUnits(db), listFoods(db)]);
  return ingredientParser({ units, foods });
}

/** Where in a draft the lines are that came as text only and that the rules cannot read. */
export function unreadLines(
  draft: RecipeDraft,
  parse: LineParser,
): { section: number; item: number; text: string }[] {
  const unread: { section: number; item: number; text: string }[] = [];
  draft.ingredientSections.forEach((section, sectionIndex) => {
    section.items.forEach((item, itemIndex) => {
      const text = item.originalText.trim();
      const bare = item.quantity === null && item.unitName === null && item.foodName === null;
      if (bare && text !== "" && isUnread(parse(text))) {
        unread.push({ section: sectionIndex, item: itemIndex, text });
      }
    });
  });
  return unread.slice(0, AI_LINES_AT_ONCE);
}

/**
 * What a handler returns once a model has written a draft: the draft itself
 * when the rules can read every line, and otherwise one more stage, in which
 * a model reads the lines they could not.
 */
export async function afterBuild(
  draft: RecipeDraft,
  text: string,
  tools: ImportTools,
): Promise<AiDraft | NextStage> {
  const parse = await householdParser(tools.env.DB);
  return unreadLines(draft, parse).length === 0
    ? new AiDraft(draft, text)
    : new NextStage("details", { draft, text });
}

/**
 * The `details` stage. It is an extra: a draft is already written, so a model
 * that gives no usable answer here costs the cook nothing but the reading.
 * The lines then stay as written, and the editor's "Read with AI" can ask again.
 */
export async function detailsStage(
  work: Record<string, unknown>,
  tools: ImportTools,
): Promise<AiDraft> {
  const draft = RecipeDraft.parse(work.draft);
  const text = typeof work.text === "string" ? work.text : "";
  const unread = unreadLines(draft, await householdParser(tools.env.DB));
  let readings: (IngredientReading | null)[];
  try {
    readings = await readLines(
      unread.map((line) => line.text),
      tools.ai,
    );
  } catch (error) {
    if (error instanceof AiFailure) {
      return new AiDraft(draft, text);
    }
    throw error;
  }
  const ingredientSections = draft.ingredientSections.map((section, sectionIndex) => ({
    ...section,
    items: section.items.map((item, itemIndex) => {
      const at = unread.findIndex(
        (line) => line.section === sectionIndex && line.item === itemIndex,
      );
      const reading = at === -1 ? null : readings[at];
      return reading ? { ...item, ...reading } : item;
    }),
  }));
  return new AiDraft({ ...draft, ingredientSections }, text);
}
