import {
  type Asset,
  type DraftLists,
  doubtTarget,
  draftToInput,
  type OrganizerKind,
  type RecipeDraft,
} from "@recipeflare/schema";
import { type EditorValue, fromInput, isAsWritten, type LineParser } from "./editorState";

/** What review mode needs to open on a draft: the editor's value, and what to point the cook at. */
export type PreparedReview = {
  value: EditorValue;
  /** What needs attention, in sentences, each with where it is. */
  attention: { text: string; field?: string }[];
  flaggedRows: string[];
  flaggedParts: string[];
  /** Organizer names from the source that the household does not have. */
  suggestions: Record<OrganizerKind, string[]>;
};

const PART: Record<string, string> = {
  missing_title: "title",
  missing_ingredients: "ingredients",
  missing_steps: "steps",
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A line's own words, to say which line is meant: all of a short one, the start of a long one. */
const shortened = (text: string, most = 48) =>
  text.length > most ? `${text.slice(0, most).trimEnd()}…` : text;

/**
 * Turns what an importer found into the editor's starting value for review.
 * Lines are read by the same parser the editor uses; a food the household does
 * not have rides on its line as a new food, to be confirmed at save like any
 * typed one. Nothing here stops a save: it only says where to look.
 */
export function prepareReview(
  draft: RecipeDraft,
  lists: DraftLists,
  parse: LineParser,
  assets: Asset[] = [],
): PreparedReview {
  const conversion = draftToInput(draft, lists);
  const value = fromInput(conversion.input, assets);
  value.ingredients = value.ingredients.map((row) =>
    row.kind === "line" && !row.foodId ? { ...row, ...(parse(row.text) ?? {}) } : row,
  );

  const lines = value.ingredients.flatMap((row) => (row.kind === "line" ? [row] : []));
  const unread = lines.filter(isAsWritten);
  const fresh = lines.filter((row) => row.newFood);
  const missing = conversion.issues.filter((issue) => issue.code in PART);

  const attention = missing.map((issue) => ({
    text: `${issue.message}.`,
    field: PART[issue.code],
  }));
  if (unread.length > 0) {
    attention.push({
      text: `${count(unread.length, "ingredient line", "ingredient lines")} could not be read and ${unread.length === 1 ? "is" : "are"} kept as written.`,
      field: `row:${unread[0]?.id}`,
    });
  }
  if (fresh.length > 0) {
    attention.push({
      text: `${count(fresh.length, "food is", "foods are")} not among yours yet: ${[...new Set(fresh.map((row) => row.newFood))].join(", ")}.`,
      field: `row:${fresh[0]?.id}`,
    });
  }

  // What the importer was unsure of, each on the line it is about. The rows
  // are in the draft's order, so a doubt's position finds its row.
  const steps = value.steps.flatMap((row) => (row.kind === "step" ? [row] : []));
  const doubtedRows: string[] = [];
  const doubtedParts: string[] = [];
  for (const doubt of draft.doubts) {
    const target = doubtTarget(doubt.where);
    const why = doubt.why.trim();
    if (why === "") {
      continue;
    }
    let text = why;
    let field: string | undefined;
    if (target?.part === "title" || target?.part === "description") {
      field = target.part;
      doubtedParts.push(target.part);
    } else if (target?.part === "ingredient") {
      const row = lines[target.index];
      if (row) {
        field = `row:${row.id}`;
        doubtedRows.push(row.id);
        text = `${shortened(row.text)}: ${why}`;
      }
    } else if (target?.part === "step") {
      const row = steps[target.index];
      if (row) {
        field = `row:${row.id}`;
        doubtedRows.push(row.id);
        text = `Step ${target.index + 1}: ${why}`;
      }
    } else if (target?.part === "note") {
      const note = value.notes[target.index];
      if (note) {
        field = `row:${note.id}`;
        text = `Note ${target.index + 1}: ${why}`;
      }
    }
    if (!attention.some((item) => item.text === text)) {
      attention.push({ text, field });
    }
  }

  return {
    value,
    attention,
    flaggedRows: [...new Set([...unread, ...fresh].map((row) => row.id).concat(doubtedRows))],
    flaggedParts: [
      ...new Set(missing.flatMap((issue) => PART[issue.code] ?? []).concat(doubtedParts)),
    ],
    suggestions: conversion.suggestions,
  };
}
