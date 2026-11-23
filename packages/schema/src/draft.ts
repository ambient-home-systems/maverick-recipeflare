import { z } from "zod";
import { newId } from "./id";
import type { OrganizerKind } from "./lists";
import { type DraftLists, indexByName, unitMatcher } from "./matching";
import { nameKey } from "./name-key";
import { ingredientParser } from "./parse-ingredient";
import { LIMITS } from "./primitives";
import { Nutrition, type RecipeFormValue } from "./recipe";
import { slugify } from "./slug";

/**
 * What every importer produces, before a person has reviewed it: the JSON-LD
 * mapper in Phase 1 and AI models from Phase 2.
 *
 * It has no IDs. Units, foods and organizers are names, not references, and a
 * step refers to ingredients by their position in the whole recipe.
 *
 * Keep this schema plain: objects, arrays, strings, numbers and nullables only.
 * It is exported as JSON Schema and handed to a model as the shape to fill.
 * Checks that span several fields belong in `checkDraft`.
 */
export const DraftIngredient = z.object({
  /** The line exactly as the source wrote it. */
  originalText: z.string(),
  quantity: z.number().nullable().default(null),
  unitName: z.string().nullable().default(null),
  foodName: z.string().nullable().default(null),
  note: z.string().default(""),
});
export type DraftIngredient = z.infer<typeof DraftIngredient>;

export const DraftStep = z.object({
  text: z.string(),
  durationSeconds: z.int().nullable().default(null),
  /** Zero-based positions of the ingredients this step uses, counted across all sections. */
  ingredientIndexes: z.array(z.int()).default([]),
});
export type DraftStep = z.infer<typeof DraftStep>;

export const RecipeDraft = z.object({
  title: z.string().default(""),
  description: z.string().default(""),
  servings: z.number().nullable().default(null),
  yieldQuantity: z.number().nullable().default(null),
  yieldUnit: z.string().nullable().default(null),
  prepTimeSeconds: z.int().nullable().default(null),
  cookTimeSeconds: z.int().nullable().default(null),
  totalTimeSeconds: z.int().nullable().default(null),
  nutrition: Nutrition.nullable().default(null),
  /** Who or where the recipe is from, as the source itself states it. */
  sourceName: z.string().nullable().default(null),
  sourceUrl: z.string().nullable().default(null),
  imageUrl: z.string().nullable().default(null),
  ingredientSections: z
    .array(
      z.object({
        title: z.string().nullable().default(null),
        items: z.array(DraftIngredient).default([]),
      }),
    )
    .default([]),
  stepSections: z
    .array(
      z.object({
        title: z.string().nullable().default(null),
        steps: z.array(DraftStep).default([]),
      }),
    )
    .default([]),
  notes: z.array(z.object({ title: z.string().default(""), text: z.string() })).default([]),
  /** Organizer names the source itself mentions. */
  suggestedCategories: z.array(z.string()).default([]),
  suggestedTags: z.array(z.string()).default([]),
  suggestedTools: z.array(z.string()).default([]),
});
export type RecipeDraft = z.infer<typeof RecipeDraft>;

/** `RecipeDraft` as JSON Schema, for a model's structured-output request. */
export function recipeDraftJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(RecipeDraft, { io: "input" }) as Record<string, unknown>;
}

export const DraftIssueCode = z.enum([
  "missing_title",
  "missing_ingredients",
  "missing_steps",
  "too_many_ingredients",
  "too_many_steps",
  "bad_ingredient_reference",
  "unmatched_unit",
  "unmatched_food",
]);
export type DraftIssueCode = z.infer<typeof DraftIssueCode>;

/** Something in a draft the cook should look at before saving. */
export const DraftIssue = z.object({
  code: DraftIssueCode,
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type DraftIssue = z.infer<typeof DraftIssue>;

/**
 * Reports what a draft is missing. It never fills gaps: a draft with no steps
 * is flagged, not guessed at.
 */
export function checkDraft(draft: RecipeDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const ingredientCount = draft.ingredientSections.reduce((n, s) => n + s.items.length, 0);
  const stepCount = draft.stepSections.reduce((n, s) => n + s.steps.length, 0);

  if (draft.title.trim() === "") {
    issues.push({ code: "missing_title", path: ["title"], message: "No title was found" });
  }
  if (ingredientCount === 0) {
    issues.push({
      code: "missing_ingredients",
      path: ["ingredientSections"],
      message: "No ingredients were found",
    });
  }
  if (stepCount === 0) {
    issues.push({ code: "missing_steps", path: ["stepSections"], message: "No steps were found" });
  }
  if (ingredientCount > LIMITS.ingredientLines) {
    issues.push({
      code: "too_many_ingredients",
      path: ["ingredientSections"],
      message: `There are ${ingredientCount} ingredient lines; a recipe can have ${LIMITS.ingredientLines}`,
    });
  }
  if (stepCount > LIMITS.steps) {
    issues.push({
      code: "too_many_steps",
      path: ["stepSections"],
      message: `There are ${stepCount} steps; a recipe can have ${LIMITS.steps}`,
    });
  }
  draft.stepSections.forEach((section, sectionIndex) => {
    section.steps.forEach((step, stepIndex) => {
      if (step.ingredientIndexes.some((index) => index < 0 || index >= ingredientCount)) {
        issues.push({
          code: "bad_ingredient_reference",
          path: ["stepSections", sectionIndex, "steps", stepIndex, "ingredientIndexes"],
          message: "A step refers to an ingredient that is not in the recipe",
        });
      }
    });
  });
  return issues;
}

export type DraftConversion = {
  /** The editor's starting value. It may still be invalid, for example with no title. */
  input: RecipeFormValue;
  issues: DraftIssue[];
  /** Organizer names from the source that the household does not have yet. */
  suggestions: Record<OrganizerKind, string[]>;
};

function splitSuggestions(
  names: readonly string[],
  kind: OrganizerKind,
  organizers: DraftLists["organizers"],
): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const slug = slugify(name);
    const match = organizers.find((o) => o.kind === kind && o.slug === slug);
    if (match) {
      if (!ids.includes(match.id)) {
        ids.push(match.id);
      }
    } else if (name.trim() !== "" && !unknown.includes(name.trim())) {
      unknown.push(name.trim());
    }
  }
  return { ids, unknown };
}

/**
 * Turns a draft into the editor's starting value: assigns IDs, and replaces
 * unit, food and organizer names with the household's own entries where the
 * name matches exactly. A name with no match is reported and left in the
 * line's original text; nothing is created.
 */
export function draftToInput(
  draft: RecipeDraft,
  lists: DraftLists,
  makeId: () => string = newId,
): DraftConversion {
  const issues = checkDraft(draft);

  const matchUnit = unitMatcher(lists.units);
  const parseLine = ingredientParser(lists);
  const foodIndex = indexByName(lists.foods, (f) => [f.name, f.pluralName, ...f.aliases], nameKey);

  const ingredientIds: string[] = [];
  const ingredientSections = draft.ingredientSections
    .filter((section) => section.items.length > 0)
    .map((section, sectionIndex) => ({
      title: section.title?.trim() || null,
      items: section.items.map((item, itemIndex) => {
        const id = makeId();
        ingredientIds.push(id);
        const path = ["ingredientSections", sectionIndex, "items", itemIndex];

        // A line that arrives as text only is read by the rule-based parser. Its
        // reading is used when it names a food the household has; otherwise the
        // line stays as written, and the editor offers the food as a new one.
        if (item.quantity === null && item.unitName === null && item.foodName === null) {
          const read = parseLine(item.originalText);
          const known = read?.foodId ? read : null;
          return {
            id,
            originalText: item.originalText.trim() || null,
            quantity: known?.quantity ?? null,
            unitId: known?.unitId ?? null,
            foodId: known?.foodId ?? null,
            note: item.note.trim() || (known?.note ?? ""),
          };
        }

        const unitId = item.unitName ? matchUnit(item.unitName) : null;
        if (item.unitName && !unitId) {
          issues.push({
            code: "unmatched_unit",
            path: [...path, "unitName"],
            message: `"${item.unitName}" is not one of your units`,
          });
        }
        const foodId = item.foodName ? (foodIndex.get(nameKey(item.foodName)) ?? null) : null;
        if (item.foodName && !foodId) {
          issues.push({
            code: "unmatched_food",
            path: [...path, "foodName"],
            message: `"${item.foodName}" is not one of your foods`,
          });
        }

        return {
          id,
          originalText: item.originalText.trim() || null,
          quantity: item.quantity !== null && item.quantity > 0 ? item.quantity : null,
          unitId,
          foodId,
          note: item.note.trim(),
        };
      }),
    }));

  const stepSections = draft.stepSections
    .filter((section) => section.steps.length > 0)
    .map((section) => ({
      title: section.title?.trim() || null,
      steps: section.steps.map((step) => ({
        id: makeId(),
        text: step.text.trim(),
        durationSeconds: step.durationSeconds,
        ingredientIds: step.ingredientIndexes
          .map((index) => ingredientIds[index])
          .filter((id): id is string => id !== undefined),
      })),
    }));

  const categories = splitSuggestions(draft.suggestedCategories, "category", lists.organizers);
  const tags = splitSuggestions(draft.suggestedTags, "tag", lists.organizers);
  const tools = splitSuggestions(draft.suggestedTools, "tool", lists.organizers);

  return {
    input: {
      title: draft.title.trim(),
      description: draft.description.trim(),
      servings: draft.servings !== null && draft.servings > 0 ? draft.servings : null,
      yieldQuantity:
        draft.yieldQuantity !== null && draft.yieldQuantity > 0 ? draft.yieldQuantity : null,
      yieldUnit: draft.yieldUnit?.trim() || null,
      prepTimeSeconds: draft.prepTimeSeconds,
      cookTimeSeconds: draft.cookTimeSeconds,
      totalTimeSeconds: draft.totalTimeSeconds,
      nutrition: draft.nutrition,
      sourceName: draft.sourceName?.trim() || null,
      sourceUrl: draft.sourceUrl,
      ingredientSections,
      stepSections,
      notes: draft.notes
        .filter((note) => note.text.trim() !== "")
        .map((note) => ({ id: makeId(), title: note.title.trim(), text: note.text.trim() })),
      categoryIds: categories.ids,
      tagIds: tags.ids,
      toolIds: tools.ids,
    },
    issues,
    suggestions: { category: categories.unknown, tag: tags.unknown, tool: tools.unknown },
  };
}
