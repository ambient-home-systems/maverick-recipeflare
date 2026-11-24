import type { RecipeDraft } from "./draft";

/**
 * Telling whether a recipe's text is in English, the household's language
 * (docs/phase-2-plan.md §9, decision 7), by rule and with no model: a recipe
 * already in English is never sent to be translated.
 *
 * It errs towards "English". Too little text to tell counts as English, so
 * translation is offered only when the text is plainly in another language.
 */

/**
 * Words English recipes are full of and other languages' recipes are not.
 * Left out on purpose: words other languages share ("in", "a", "an", "on",
 * "or", "minutes", "salt", "butter"), which would make French or German look English.
 */
const ENGLISH = new Set(
  `the and of with to for until into then add is it from cup cups tablespoon tablespoons
  teaspoon teaspoons heat stir bake about over each when this that your you serve pour
  place let are be if not out up all as by has have more some cook mix cut`
    .split(/\s+/)
    .filter(Boolean),
);

/** Fewer words than this are too few to tell a language by. */
const ENOUGH_WORDS = 12;
/** The share of a text's words that are common English ones, at or above which it is English. */
const ENGLISH_SHARE = 0.08;

/** True when `text` reads as English, or is too short to say. */
export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < ENOUGH_WORDS) {
    return true;
  }
  const english = words.filter((word) => ENGLISH.has(word)).length;
  return english / words.length >= ENGLISH_SHARE;
}

/** A draft's own words, one piece to a line: its title, description, lines, steps and notes. */
export function draftText(draft: RecipeDraft): string {
  return [
    draft.title,
    draft.description,
    ...draft.ingredientSections.flatMap((section) => [
      section.title ?? "",
      ...section.items.map((item) => item.originalText),
    ]),
    ...draft.stepSections.flatMap((section) => [
      section.title ?? "",
      ...section.steps.map((step) => step.text),
    ]),
    ...draft.notes.flatMap((note) => [note.title, note.text]),
  ]
    .map((piece) => piece.trim())
    .filter((piece) => piece !== "")
    .join("\n");
}
