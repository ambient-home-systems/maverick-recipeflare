import { z } from "zod";
import type { RecipeDraft } from "./draft";
import { Timestamp } from "./primitives";

/**
 * How far a saved recipe is from the draft an import made of it: the measure
 * of "minor fixes" in docs/phase-2-plan.md §8.
 *
 * It counts words on the page, not judgement. Ingredient lines and steps are
 * compared as text, across all sections. What is the same is set aside; of
 * what is left, a line of the draft and a line of the saved recipe make one
 * changed line, and the rest were added or removed. Section headings,
 * descriptions, notes, times and organizers are not counted.
 */

const Count = z.int().min(0);

/** What became of one list, the ingredient lines or the steps, between the draft and the save. */
export const ReviewCount = z.object({
  /** Kept word for word, and in the same order. */
  same: Count,
  /** Kept word for word, in another place. */
  moved: Count,
  /** In both, with different words. */
  changed: Count,
  /** In the saved recipe and not in the draft. */
  added: Count,
  /** In the draft and not in the saved recipe. */
  removed: Count,
});
export type ReviewCount = z.infer<typeof ReviewCount>;

export const ImportReview = z.object({
  /** The profile whose models wrote the draft. Null for a draft no model wrote. */
  profile: z.string().nullable(),
  titleChanged: z.boolean(),
  ingredients: ReviewCount,
  steps: ReviewCount,
  /**
   * Changed ingredient lines whose figures differ between the draft and the
   * save, and how many of those the draft had raised no doubt about. A wrong
   * amount nobody was warned of is the mistake that matters most.
   */
  amounts: z.object({ changed: Count, unflagged: Count }),
  at: Timestamp,
});
export type ImportReview = z.infer<typeof ImportReview>;

/** What a comparison works out; who wrote the draft, and when, is added by whoever keeps it. */
export type ReviewCounts = Omit<ImportReview, "profile" | "at">;

/** As much of a saved recipe as the comparison reads. A recipe and a recipe's input both fit. */
export type SavedText = {
  title: string;
  ingredientSections: readonly {
    items: readonly { originalText: string | null; note?: string }[];
  }[];
  stepSections: readonly { steps: readonly { text: string }[] }[];
};

/** Text as it is compared: spaces at the ends and runs of spaces do not count as a change. */
const plain = (text: string) => text.trim().replace(/\s+/g, " ");

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

const FRACTIONS: Record<string, string> = {
  "¼": "1/4",
  "½": "1/2",
  "¾": "3/4",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

/** The figures a line states, in order: "1½ cups" and "1 1/2 cups" state the same. */
function figures(text: string): string {
  const spelled = text.replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (sign) => ` ${FRACTIONS[sign]} `);
  return (spelled.match(/\d+(?:[.,]\d+)?/g) ?? []).join(" ");
}

/** How many entries two lists keep in the same order: the longest run both have, gaps allowed. */
function inOrder(a: readonly string[], b: readonly string[]): number {
  let row = new Array<number>(b.length + 1).fill(0);
  for (const left of a) {
    const next = [0];
    for (let at = 0; at < b.length; at++) {
      next.push(left === b[at] ? (row[at] ?? 0) + 1 : Math.max(row[at + 1] ?? 0, next[at] ?? 0));
    }
    row = next;
  }
  return row[b.length] ?? 0;
}

/** How many words two texts share, each counted as often as both have it. */
function shared(a: readonly string[], b: readonly string[]): number {
  const left = new Map<string, number>();
  for (const word of a) {
    left.set(word, (left.get(word) ?? 0) + 1);
  }
  let count = 0;
  for (const word of b) {
    const have = left.get(word) ?? 0;
    if (have > 0) {
      left.set(word, have - 1);
      count += 1;
    }
  }
  return count;
}

/**
 * Compares one list. `pairs` says which draft entry became which saved one,
 * for the changed entries: those that share the most words first, then
 * whatever is left, in order.
 */
function compareList(
  draft: readonly string[],
  saved: readonly string[],
): { count: ReviewCount; pairs: [draft: number, saved: number][] } {
  // Word for word, wherever it is: each saved entry answers for one draft entry.
  const waiting = new Map<string, number[]>();
  saved.forEach((text, at) => {
    waiting.set(text, [...(waiting.get(text) ?? []), at]);
  });
  const taken = new Set<number>();
  const leftDraft: number[] = [];
  draft.forEach((text, at) => {
    const match = waiting.get(text)?.shift();
    if (match === undefined) {
      leftDraft.push(at);
    } else {
      taken.add(match);
    }
  });
  let leftSaved = saved.map((_text, at) => at).filter((at) => !taken.has(at));

  const kept = draft.length - leftDraft.length;
  const same = inOrder(draft, saved);
  const changed = Math.min(leftDraft.length, leftSaved.length);

  const candidates = leftDraft
    .flatMap((d) =>
      leftSaved.map((s) => ({ d, s, score: shared(words(draft[d] ?? ""), words(saved[s] ?? "")) })),
    )
    .filter((pair) => pair.score > 0)
    .sort((a, b) => b.score - a.score || a.d - b.d || a.s - b.s);
  const pairs: [number, number][] = [];
  let restDraft = [...leftDraft];
  for (const { d, s } of candidates) {
    if (restDraft.includes(d) && leftSaved.includes(s)) {
      pairs.push([d, s]);
      restDraft = restDraft.filter((at) => at !== d);
      leftSaved = leftSaved.filter((at) => at !== s);
    }
  }
  restDraft.slice(0, leftSaved.length).forEach((d, at) => {
    pairs.push([d, leftSaved[at] as number]);
  });

  return {
    count: {
      same,
      moved: kept - same,
      changed,
      added: saved.length - kept - changed,
      removed: draft.length - kept - changed,
    },
    pairs,
  };
}

/**
 * How far `saved` is from `draft`. The same function measures a cook's review
 * (the draft against what they saved) and a comparison (another model's draft
 * against the recipe the cook settled on).
 */
export function compareWithDraft(draft: RecipeDraft, saved: SavedText): ReviewCounts {
  const draftLines = draft.ingredientSections.flatMap((section) =>
    section.items.map((item) => plain(item.originalText)),
  );
  // A doubt names a line by its place among all of them, empty ones included.
  const placed = draftLines.map((text, at) => ({ text, at })).filter((line) => line.text !== "");
  const savedLines = saved.ingredientSections
    .flatMap((section) => section.items.map((item) => plain(item.originalText ?? item.note ?? "")))
    .filter((text) => text !== "");
  const lines = compareList(
    placed.map((line) => line.text),
    savedLines,
  );

  const steps = compareList(
    draft.stepSections
      .flatMap((section) => section.steps.map((step) => plain(step.text)))
      .filter((text) => text !== ""),
    saved.stepSections
      .flatMap((section) => section.steps.map((step) => plain(step.text)))
      .filter((text) => text !== ""),
  );

  const doubted = new Set(draft.doubts.map((doubt) => doubt.where));
  const amounts = { changed: 0, unflagged: 0 };
  for (const [d, s] of lines.pairs) {
    const was = placed[d];
    if (was && figures(was.text) !== figures(savedLines[s] ?? "")) {
      amounts.changed += 1;
      if (!doubted.has(`ingredient:${was.at}`)) {
        amounts.unflagged += 1;
      }
    }
  }

  return {
    titleChanged: plain(draft.title) !== plain(saved.title),
    ingredients: lines.count,
    steps: steps.count,
    amounts,
  };
}

/** The number the gate counts: ingredient lines and steps changed, added, removed or moved. */
export function reviewChanges(review: Pick<ImportReview, "ingredients" | "steps">): number {
  const of = (count: ReviewCount) => count.changed + count.added + count.removed + count.moved;
  return of(review.ingredients) + of(review.steps);
}

/** The most changed lines and steps a card may have and still count as "minor fixes" (the plan's decision 6). */
export const MINOR_FIXES = 3;

/** Whether a review was minor fixes: few enough changes, and no amount put right that the draft had not doubted. */
export function isMinorFixes(review: Pick<ImportReview, "ingredients" | "steps" | "amounts">) {
  return reviewChanges(review) <= MINOR_FIXES && review.amounts.unflagged === 0;
}
