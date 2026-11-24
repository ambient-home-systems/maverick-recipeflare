import { type DraftDoubt, LIMITS, RecipeDraft } from "@recipeflare/schema";
import { z } from "zod";
import { AiFailure } from "../ai/failure";
import { TRANSLATE_PROMPT } from "../ai/prompts";
import type { AiRunner } from "../ai/runner";
import { afterBuild } from "./details";
import { AiDraft, type ImportTools, type NextStage } from "./runner";

/**
 * The `translate` stage: a draft's words rewritten in English, when the cook
 * asks for it in review. See docs/phase-2-plan.md §4 and §9, decision 7.
 *
 * A model translates each piece of the draft by itself. Code then checks that
 * the numbers in a piece are the numbers it had: a translated line whose
 * amounts changed is not used, and the line stays as it was written, with a
 * doubt. What was written before is kept as a note on the recipe.
 */

/** What the model is asked to fill: each numbered piece, in English. */
export const Translation = z.object({
  pieces: z.array(z.object({ number: z.number(), text: z.string() })),
});
export type Translation = z.infer<typeof Translation>;

/** The note the words as written are kept under. The cook can delete it. */
export const ORIGINAL_NOTE = "As written, before translation";

/** The numbers in a piece of text, as digits only, in order of size: "1,5 l" and "1.5 l" are the same. */
function amounts(text: string): string[] {
  const plain = text
    .replace(/(\d)(\p{No})/gu, "$1 $2")
    .normalize("NFKD")
    .replace(/⁄/g, "/");
  return (plain.match(/\d+(?:[.,/]\d+)*/g) ?? [])
    .map((number) => number.replace(/[.,]/g, ""))
    .sort();
}

/** True when a translation has the numbers its original had, each as often: nothing converted, added or lost. */
export function sameAmounts(original: string, translated: string): boolean {
  const before = amounts(original);
  const after = amounts(translated);
  return before.length === after.length && before.every((number, index) => number === after[index]);
}

type Piece = {
  text: string;
  /** Where a doubt about this piece belongs, as a draft's doubts say it. */
  where: string;
  /** Puts the translated words in the draft. */
  put: (draft: RecipeDraft, text: string) => void;
  most: number;
};

/** A draft's pieces, in order, each with the way to put its translation back. */
function piecesOf(draft: RecipeDraft): Piece[] {
  const pieces: Piece[] = [];
  const add = (text: string | null, where: string, most: number, put: Piece["put"]) => {
    if (text && text.trim() !== "") {
      pieces.push({ text: text.trim(), where, put, most });
    }
  };
  add(draft.title, "title", LIMITS.titleLength, (d, text) => {
    d.title = text;
  });
  add(draft.description, "description", LIMITS.descriptionLength, (d, text) => {
    d.description = text;
  });
  let line = 0;
  draft.ingredientSections.forEach((section, s) => {
    add(section.title, "recipe", LIMITS.sectionTitleLength, (d, text) => {
      const target = d.ingredientSections[s];
      if (target) {
        target.title = text;
      }
    });
    section.items.forEach((item, i) => {
      add(item.originalText, `ingredient:${line++}`, LIMITS.ingredientTextLength, (d, text) => {
        const target = d.ingredientSections[s]?.items[i];
        if (target) {
          // The line is other words now: what was read from the old ones no longer stands.
          Object.assign(target, {
            originalText: text,
            quantity: null,
            unitName: null,
            foodName: null,
            note: "",
          });
        }
      });
    });
  });
  let step = 0;
  draft.stepSections.forEach((section, s) => {
    add(section.title, "recipe", LIMITS.sectionTitleLength, (d, text) => {
      const target = d.stepSections[s];
      if (target) {
        target.title = text;
      }
    });
    section.steps.forEach((entry, i) => {
      add(entry.text, `step:${step++}`, LIMITS.stepTextLength, (d, text) => {
        const target = d.stepSections[s]?.steps[i];
        if (target) {
          target.text = text;
        }
      });
    });
  });
  draft.notes.forEach((note, n) => {
    add(note.title, `note:${n}`, LIMITS.noteTitleLength, (d, text) => {
      const target = d.notes[n];
      if (target) {
        target.title = text;
      }
    });
    add(note.text, `note:${n}`, LIMITS.noteTextLength, (d, text) => {
      const target = d.notes[n];
      if (target) {
        target.text = text;
      }
    });
  });
  return pieces;
}

/**
 * The draft in English. Each piece stands or falls alone: one the model left
 * out, or whose numbers are not the numbers it had, stays as it was written
 * and is pointed out. The words as written are kept as a note.
 */
export async function translateDraft(
  draft: RecipeDraft,
  original: string,
  ai: AiRunner,
): Promise<RecipeDraft> {
  const pieces = piecesOf(draft);
  if (pieces.length === 0) {
    return draft;
  }
  const answer = await ai.run({
    task: "translate",
    promptVersion: TRANSLATE_PROMPT.version,
    system: TRANSLATE_PROMPT.system,
    prompt: `The pieces:\n\n${pieces.map((piece, index) => `${index + 1}. ${piece.text}`).join("\n")}`,
    schema: Translation,
    schemaName: "recipe_translation",
    maxTokens: 8000,
  });

  const translated: RecipeDraft = structuredClone(draft);
  const doubts: DraftDoubt[] = [];
  pieces.forEach((piece, index) => {
    const said = answer.value.pieces.find((entry) => entry.number === index + 1)?.text.trim() ?? "";
    if (said === "") {
      doubts.push({ where: piece.where, why: "Was not translated. It is as it was written." });
    } else if (!sameAmounts(piece.text, said)) {
      doubts.push({
        where: piece.where,
        why: "Was not translated: the translation changed an amount. It is as it was written.",
      });
    } else {
      piece.put(translated, said.slice(0, piece.most));
    }
  });

  const notes =
    translated.notes.length < LIMITS.notes && original.trim() !== ""
      ? [
          ...translated.notes,
          { title: ORIGINAL_NOTE, text: original.trim().slice(0, LIMITS.noteTextLength) },
        ]
      : translated.notes;
  return RecipeDraft.parse({ ...translated, notes, doubts: [...translated.doubts, ...doubts] });
}

/**
 * The `translate` stage. Like `details` it cannot fail an import: the draft
 * was already in review when the cook asked. With no answer from the model
 * the draft goes back as it was, saying so.
 */
export async function translateStage(
  work: Record<string, unknown>,
  tools: ImportTools,
): Promise<AiDraft | NextStage> {
  const draft = RecipeDraft.parse(work.draft);
  const text = typeof work.text === "string" ? work.text : "";
  let english: RecipeDraft;
  try {
    english = await translateDraft(draft, text, tools.ai);
  } catch (error) {
    if (!(error instanceof AiFailure)) {
      throw error;
    }
    // As it was, lines already read and all: nothing about it has changed but this.
    return new AiDraft(
      {
        ...draft,
        doubts: [
          ...draft.doubts,
          {
            where: "recipe",
            why: "It could not be translated: the AI gave no answer. It can be asked again.",
          },
        ],
      },
      text,
    );
  }
  // The lines are English now, so the rules read them; a model reads those they cannot.
  return afterBuild(english, text, tools);
}
