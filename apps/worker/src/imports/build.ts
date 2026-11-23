import { type DraftDoubt, LIMITS, RecipeDraft, readStatedDuration } from "@recipeflare/schema";
import { z } from "zod";
import { BUILD_PROMPT } from "../ai/prompts";
import type { AiRunner } from "../ai/runner";
import { PermanentImportError } from "./runner";
import { quoted, type Source, sourceOf } from "./sourceCheck";
import { readYield } from "./url";

/**
 * The `build` stage: a draft from text. See docs/phase-2-plan.md §4 and §5.
 *
 * A model copies the recipe out of the text, and code then checks what it
 * wrote against the text. A word the text does not have is not silently
 * accepted: the line is kept and marked as a doubt, for the cook to check.
 */

const nullableText = z.string().nullable();

/**
 * What the model is asked to fill. It is plainer than a `RecipeDraft` on
 * purpose: text as written and nothing to work out, so there is less to get
 * wrong. Amounts, units and foods are read from the lines afterwards by the
 * same rules as a typed line; times are read from their words by code. Every
 * field is required, which is what a model's structured output keeps to best.
 */
export const Reading = z.object({
  recipe: z.boolean(),
  title: z.string(),
  description: z.string(),
  yield: nullableText,
  prepTime: nullableText,
  cookTime: nullableText,
  totalTime: nullableText,
  source: nullableText,
  ingredients: z.array(z.object({ section: nullableText, line: z.string(), doubt: nullableText })),
  steps: z.array(z.object({ section: nullableText, text: z.string(), doubt: nullableText })),
  notes: z.array(z.string()),
});
export type Reading = z.infer<typeof Reading>;

/** Headings that say what a list is, not which part of the recipe it is for. */
const PLAIN_HEADING =
  /^(?:ingredients?|method|directions?|instructions?|steps?|preparation|you will need|what you need)\W*$/i;

const tooThin = () =>
  new PermanentImportError("too_thin", "There was not enough there to make a recipe from.");

/** A heading the text really has, and that names a part of the recipe; otherwise none. */
function heading(section: string | null, source: Source): string | null {
  const title = section?.trim().replace(/:$/, "").trim() ?? "";
  if (title === "" || PLAIN_HEADING.test(title) || source.missing(title).length > 0) {
    return null;
  }
  return title.slice(0, LIMITS.sectionTitleLength);
}

/** Entries that follow one another under the same heading, gathered into sections. */
function sections<T, R>(
  entries: readonly T[],
  headingOf: (entry: T) => string | null,
  item: (entry: T) => R,
): { title: string | null; rows: R[] }[] {
  const grouped: { title: string | null; rows: R[] }[] = [];
  for (const entry of entries) {
    const title = headingOf(entry);
    const last = grouped.at(-1);
    if (last && last.title === title) {
      last.rows.push(item(entry));
    } else {
      grouped.push({ title, rows: [item(entry)] });
    }
  }
  return grouped;
}

/** Something stated in a few words, kept only if the text really says it. */
function stated(value: string | null, source: Source, max: number): string | null {
  const text = value?.trim() ?? "";
  return text !== "" && source.missing(text).length === 0 ? text.slice(0, max) : null;
}

const doubtText = (why: string) => why.trim().slice(0, LIMITS.doubtLength);

/**
 * Makes a draft of what a model read, checked against the text it read from.
 * Throws `too_thin` when there is no recipe in it.
 */
export function draftFromReading(reading: Reading, text: string): RecipeDraft {
  const source = sourceOf(text);
  const ingredients = reading.ingredients.filter((entry) => entry.line.trim() !== "");
  const steps = reading.steps.filter((entry) => entry.text.trim() !== "");
  if (!reading.recipe || (ingredients.length === 0 && steps.length === 0)) {
    throw tooThin();
  }

  const doubts: DraftDoubt[] = [];
  const doubt = (where: string, why: string) => doubts.push({ where, why: doubtText(why) });
  /** Flags `written` when it has words the text does not. `subject` starts the sentence: "The title". */
  const invented = (where: string, written: string, subject = "") => {
    const absent = source.missing(written);
    if (absent.length > 0) {
      const has = absent.length === 1 ? "has a word that is not" : "has words that are not";
      const sentence = `${subject} ${has} in the text: ${quoted(absent)}.`.trim();
      doubt(where, sentence.charAt(0).toUpperCase() + sentence.slice(1));
    }
    return absent.length > 0;
  };

  const title = reading.title.trim();
  invented("title", title, "The title");
  const description = reading.description.trim();
  invented("description", description, "The description");

  ingredients.forEach((entry, index) => {
    const where = `ingredient:${index}`;
    if (entry.doubt?.trim()) {
      doubt(where, entry.doubt);
    }
    // An ingredient line is short and is copied whole. One that is not in the
    // text word for word is where an amount gets attached to the wrong thing.
    if (!invented(where, entry.line) && !source.hasRun(entry.line)) {
      doubt(where, "Is not written this way in the text. Check the amount and the wording.");
    }
  });
  steps.forEach((entry, index) => {
    const where = `step:${index}`;
    if (entry.doubt?.trim()) {
      doubt(where, entry.doubt);
    }
    invented(where, entry.text);
  });
  const notes = reading.notes.map((note) => note.trim()).filter((note) => note !== "");
  notes.forEach((note, index) => {
    invented(`note:${index}`, note);
  });

  const made = readYield(stated(reading.yield, source, 200));
  const time = (value: string | null) => {
    const said = stated(value, source, 100);
    return said === null ? null : readStatedDuration(said);
  };

  return RecipeDraft.parse({
    title: title.slice(0, LIMITS.titleLength),
    description: description.slice(0, LIMITS.descriptionLength),
    ...made,
    prepTimeSeconds: time(reading.prepTime),
    cookTimeSeconds: time(reading.cookTime),
    totalTimeSeconds: time(reading.totalTime),
    sourceName: stated(reading.source, source, LIMITS.sourceNameLength),
    ingredientSections: sections(
      ingredients,
      (entry) => heading(entry.section, source),
      (entry) => ({ originalText: entry.line.trim().slice(0, LIMITS.ingredientTextLength) }),
    ).map(({ title: sectionTitle, rows }) => ({ title: sectionTitle, items: rows })),
    stepSections: sections(
      steps,
      (entry) => heading(entry.section, source),
      (entry) => ({ text: entry.text.trim().slice(0, LIMITS.stepTextLength) }),
    ).map(({ title: sectionTitle, rows }) => ({ title: sectionTitle, steps: rows })),
    notes: notes.map((note) => ({ title: "", text: note.slice(0, LIMITS.noteTextLength) })),
    doubts,
  });
}

/** Asks a model to copy the recipe out of `text`, and checks what it wrote. */
export async function buildDraft(text: string, ai: AiRunner): Promise<RecipeDraft> {
  if (text.trim() === "") {
    throw tooThin();
  }
  const answer = await ai.run({
    task: "build",
    promptVersion: BUILD_PROMPT.version,
    system: BUILD_PROMPT.system,
    prompt: `The text:\n\n${text}`,
    schema: Reading,
    schemaName: "recipe_reading",
    // A long recipe, written out once, with room for the model to think first.
    maxTokens: 12_000,
  });
  return draftFromReading(answer.value, text);
}
