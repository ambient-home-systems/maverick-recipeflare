import type { ImportReview, ImportRun, ReportCard, ReviewCount } from "@recipeflare/schema";
import { describe, expect, it } from "vitest";
import {
  amountWarning,
  changesDetail,
  changesHeadline,
  runStatus,
  summarise,
  sumWords,
  tookWords,
} from "./reportWords";

const count = (changes: Partial<ReviewCount> = {}): ReviewCount => ({
  same: 5,
  moved: 0,
  changed: 0,
  added: 0,
  removed: 0,
  ...changes,
});
const review = (changes: Partial<ImportReview> = {}): ImportReview => ({
  profile: "standard",
  titleChanged: false,
  ingredients: count(),
  steps: count(),
  amounts: { changed: 0, unflagged: 0 },
  at: "2026-11-24T09:00:00.000Z",
  ...changes,
});
const run = (profile: string | null, changes: Partial<ImportRun> = {}): ImportRun => ({
  id: crypto.randomUUID(),
  profile,
  status: "compared",
  review: review({ profile }),
  error: null,
  milliseconds: 10_000,
  ...changes,
});
const card = (changes: Partial<ReportCard> = {}): ReportCard => ({
  ...run("standard", { status: "completed" }),
  kind: "photo",
  title: "A Card",
  slug: "a-card",
  savedAt: "2026-11-24T09:00:00.000Z",
  comparisons: [],
  ...changes,
});

describe("what a review says", () => {
  it("says there were no changes, and nothing more", () => {
    expect(changesHeadline(review())).toBe("No changes");
    expect(changesDetail(review())).toBe("");
    expect(amountWarning(review())).toBeNull();
  });

  it("counts lines and steps together, and says where they were", () => {
    const changed = review({
      titleChanged: true,
      ingredients: count({ changed: 1, added: 1 }),
      steps: count({ removed: 1, moved: 2 }),
    });

    expect(changesHeadline(changed)).toBe("5 changes");
    expect(changesDetail(changed)).toBe(
      "Ingredients: 1 changed, 1 added. Steps: 1 removed, 2 moved. Title changed.",
    );
    expect(changesHeadline(review({ steps: count({ changed: 1 }) }))).toBe("1 change");
  });

  it("warns of an amount that was corrected with no doubt raised", () => {
    expect(amountWarning(review({ amounts: { changed: 2, unflagged: 1 } }))).toBe(
      "1 amount was corrected that the import had not doubted.",
    );
    expect(amountWarning(review({ amounts: { changed: 2, unflagged: 2 } }))).toBe(
      "2 amounts were corrected that the import had not doubted.",
    );
    // One the import had doubted is the review doing its job.
    expect(amountWarning(review({ amounts: { changed: 1, unflagged: 0 } }))).toBeNull();
  });

  it("gives a time a person would say", () => {
    expect(tookWords(400)).toBe("1 second");
    expect(tookWords(24_500)).toBe("25 seconds");
    expect(tookWords(96_000)).toBe("2 minutes");
  });

  it("says what a comparison with no result is doing, or why it has none", () => {
    expect(runStatus(run("gemma", { status: "queued", review: null }))).toBe("Waiting to start");
    expect(runStatus(run("gemma", { status: "running", review: null }))).toBe("Reading it again");
    expect(
      runStatus(
        run("gemma", {
          status: "failed",
          review: null,
          error: { code: "ai_unavailable", message: "The model took too long to answer." },
        }),
      ),
    ).toBe("Could not be compared. The model took too long to answer.");
  });
});

describe("the report added up", () => {
  const cards = [
    // Saved with four changes; gemma made two on the same card, qwen none.
    card({
      review: review({ ingredients: count({ changed: 3 }), steps: count({ added: 1 }) }),
      comparisons: [
        run("gemma", { review: review({ steps: count({ changed: 2 }) }), milliseconds: 30_000 }),
        run("qwen", { milliseconds: 60_000 }),
      ],
    }),
    // Saved as read, but for an amount nobody had doubted; gemma is still at work on it.
    card({
      review: review({
        ingredients: count({ changed: 1 }),
        amounts: { changed: 1, unflagged: 1 },
      }),
      comparisons: [run("gemma", { status: "running", review: null, milliseconds: 0 })],
    }),
    // Saved before the record was kept.
    card({ review: null }),
  ];

  it("adds up the cook's own reviews first, then each profile by name", () => {
    expect(summarise(cards)).toEqual([
      // Two measured: 4 + 1 changes. Neither is minor fixes: one has four, one an unflagged amount.
      { profile: null, cards: 2, changes: 5, minor: 0, unflagged: 1, milliseconds: 10_000 },
      { profile: "gemma", cards: 1, changes: 2, minor: 1, unflagged: 0, milliseconds: 30_000 },
      { profile: "qwen", cards: 1, changes: 0, minor: 1, unflagged: 0, milliseconds: 60_000 },
    ]);
  });

  it("leaves out a name with nothing measured yet", () => {
    expect(summarise([card({ review: null })])).toEqual([]);
  });

  it("says a sum in a sentence", () => {
    const [own, gemma] = summarise(cards);

    expect(own && sumWords(own)).toBe(
      "2 imports. 5 changes, 2.5 each. 0 of 2 within minor fixes. 1 amount corrected without a warning.",
    );
    expect(gemma && sumWords(gemma)).toBe("1 import. 2 changes. 1 of 1 within minor fixes.");
  });
});
