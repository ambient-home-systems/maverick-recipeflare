import {
  type ImportReview,
  type ImportRun,
  isMinorFixes,
  type ReportCard,
  type ReviewCount,
  reviewChanges,
} from "@recipeflare/schema";

/**
 * The report's words and sums, as plain functions. The screen only lays them
 * out, so what a number means is said, and tested, here.
 */

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** "1 changed, 2 added": what became of one list, leaving out what did not happen. */
function ofList(count: ReviewCount): string {
  return [
    count.changed > 0 ? `${count.changed} changed` : "",
    count.added > 0 ? `${count.added} added` : "",
    count.removed > 0 ? `${count.removed} removed` : "",
    count.moved > 0 ? `${count.moved} moved` : "",
  ]
    .filter((part) => part !== "")
    .join(", ");
}

/** "3 changes", or "No changes" for a draft that was right as it stood. */
export function changesHeadline(review: ImportReview): string {
  const changes = reviewChanges(review);
  return changes === 0 ? "No changes" : plural(changes, "change");
}

/** Where the changes were: "Ingredients: 1 changed, 1 added. Steps: 1 removed. Title changed." */
export function changesDetail(review: ImportReview): string {
  const lines = ofList(review.ingredients);
  const steps = ofList(review.steps);
  return [
    lines ? `Ingredients: ${lines}.` : "",
    steps ? `Steps: ${steps}.` : "",
    review.titleChanged ? "Title changed." : "",
  ]
    .filter((part) => part !== "")
    .join(" ");
}

/** The warning a review carries when an amount was put right that the draft had raised no doubt about. */
export function amountWarning(review: ImportReview): string | null {
  const count = review.amounts.unflagged;
  if (count === 0) {
    return null;
  }
  return count === 1
    ? "1 amount was corrected that the import had not doubted."
    : `${count} amounts were corrected that the import had not doubted.`;
}

/** "41 seconds", "2 minutes": how long the models took, to the nearest that matters. */
export function tookWords(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 90) {
    return plural(Math.max(1, seconds), "second");
  }
  return plural(Math.round(seconds / 60), "minute");
}

/** What a comparison is doing, or how it ended, when it has no review to show. */
export function runStatus(run: ImportRun): string {
  switch (run.status) {
    case "queued":
      return "Waiting to start";
    case "running":
      return "Reading it again";
    case "failed":
      return `Could not be compared. ${run.error?.message ?? ""}`.trim();
    default:
      return "Not compared";
  }
}

export const isUnderWay = (run: ImportRun) => run.status === "queued" || run.status === "running";

/** One line of the summary: everything measured under one name, added up. */
export type ReportSum = {
  /** A profile's name, or null for the cook's own reviews. */
  profile: string | null;
  cards: number;
  changes: number;
  /** How many of the cards were minor fixes. */
  minor: number;
  /** Amounts corrected that the draft had not doubted, over all the cards. */
  unflagged: number;
  /** The models' time for a card, on average. */
  milliseconds: number;
};

function sumOf(profile: string | null, runs: readonly ImportRun[]): ReportSum {
  const measured = runs.flatMap((run) => (run.review ? [{ review: run.review, run }] : []));
  return {
    profile,
    cards: measured.length,
    changes: measured.reduce((sum, { review }) => sum + reviewChanges(review), 0),
    minor: measured.filter(({ review }) => isMinorFixes(review)).length,
    unflagged: measured.reduce((sum, { review }) => sum + review.amounts.unflagged, 0),
    milliseconds:
      measured.length === 0
        ? 0
        : Math.round(
            measured.reduce((sum, { run }) => sum + run.milliseconds, 0) / measured.length,
          ),
  };
}

/**
 * The report added up: the cook's own reviews first, then each profile the
 * cards were run again with, by name. A name with nothing measured is left out.
 */
export function summarise(cards: readonly ReportCard[]): ReportSum[] {
  const byProfile = new Map<string, ImportRun[]>();
  for (const run of cards.flatMap((card) => card.comparisons)) {
    if (run.profile !== null) {
      byProfile.set(run.profile, [...(byProfile.get(run.profile) ?? []), run]);
    }
  }
  return [
    sumOf(null, cards),
    ...[...byProfile.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([profile, runs]) => sumOf(profile, runs)),
  ].filter((sum) => sum.cards > 0);
}

/** "20 imports. 31 changes, 1.6 each. 17 of 20 within minor fixes. 2 amounts corrected without a warning." */
export function sumWords(sum: ReportSum): string {
  const each = (sum.changes / sum.cards).toFixed(1).replace(/\.0$/, "");
  return [
    `${plural(sum.cards, "import")}.`,
    sum.cards === 1
      ? `${plural(sum.changes, "change")}.`
      : `${plural(sum.changes, "change")}, ${each} each.`,
    `${sum.minor} of ${sum.cards} within minor fixes.`,
    sum.unflagged > 0 ? `${plural(sum.unflagged, "amount")} corrected without a warning.` : "",
  ]
    .filter((part) => part !== "")
    .join(" ");
}
