import { compareWithDraft, ingredientParser, reviewChanges } from "@recipeflare/schema";
import {
  fixtureFoods,
  fixtureOrganizers,
  fixtureUnits,
  importForeign,
  importNeedsReview,
  importPastedText,
} from "@recipeflare/schema/fixtures";
import { describe, expect, it } from "vitest";
import { checkEditorValue } from "./editorState";
import { prepareReview } from "./reviewState";

/**
 * The record of a review counts what the cook changed, so opening a draft in
 * review and saving it untouched must count nothing: whatever the editor does
 * to a draft on the way in and out, it must not look like a cook's correction.
 */

const lists = { foods: fixtureFoods, units: fixtureUnits, organizers: fixtureOrganizers };
const parse = ingredientParser(lists);

describe("a draft opened in review and saved untouched", () => {
  it.each([
    ["a link's own recipe data", importNeedsReview],
    ["pasted text a model wrote up", importPastedText],
    ["a recipe in another language", importForeign],
  ])("records no change for %s", (_what, job) => {
    const draft = job.result?.draft;
    if (!draft) {
      throw new Error("the fixture has no draft");
    }
    const { value } = prepareReview(draft, lists, parse, [], job.result?.readBy === "ai");

    const { input } = checkEditorValue(value);

    if (!input) {
      throw new Error("the review could not be saved as it stood");
    }
    const review = compareWithDraft(draft, input);
    expect(reviewChanges(review)).toBe(0);
    expect(review.titleChanged).toBe(false);
    expect(review.amounts).toEqual({ changed: 0, unflagged: 0 });
    // Every line and step of the draft is accounted for.
    expect(review.ingredients.same).toBe(
      draft.ingredientSections.flatMap((section) => section.items).length,
    );
    expect(review.steps.same).toBe(draft.stepSections.flatMap((section) => section.steps).length);
  });
});
