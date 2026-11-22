import { formatDuration, formatQuantity, type Nutrition, type Recipe } from "@recipeflare/schema";

/** The amounts a recipe can be scaled by on the recipe view and in cook mode. */
export const SCALES = [0.5, 1, 2, 3] as const;
export type Scale = (typeof SCALES)[number];

export const SCALE_LABELS: Record<Scale, string> = { 0.5: "½×", 1: "1×", 2: "2×", 3: "3×" };
export const SCALE_NAMES: Record<Scale, string> = {
  0.5: "Half",
  1: "As written",
  2: "Double",
  3: "Triple",
};

/** The scale named in a page address, or 1 for anything else. */
export function parseScale(value: unknown): Scale {
  const number = typeof value === "string" ? Number(value) : value;
  return SCALES.find((scale) => scale === number) ?? 1;
}

export type Fact = { label: string; value: string };

/**
 * The short facts under a recipe's title: times, servings and yield. Only what
 * the recipe states is listed. Servings and yield follow the scale; times do not.
 */
export function recipeFacts(
  recipe: Pick<
    Recipe,
    | "prepTimeSeconds"
    | "cookTimeSeconds"
    | "totalTimeSeconds"
    | "servings"
    | "yieldQuantity"
    | "yieldUnit"
  >,
  scale: number = 1,
): Fact[] {
  const facts: Fact[] = [];
  const { prepTimeSeconds: prep, cookTimeSeconds: cook } = recipe;
  if (prep !== null) {
    facts.push({ label: "Prep", value: formatDuration(prep) });
  }
  if (cook !== null) {
    facts.push({ label: "Cook", value: formatDuration(cook) });
  }
  // With no total stated, prep and cook are added, but only when both are given:
  // one of them alone would only repeat itself.
  const total = recipe.totalTimeSeconds ?? (prep !== null && cook !== null ? prep + cook : null);
  if (total !== null) {
    facts.push({ label: "Total", value: formatDuration(total) });
  }
  if (recipe.servings !== null) {
    facts.push({ label: "Serves", value: formatQuantity(recipe.servings * scale) });
  }
  if (recipe.yieldQuantity !== null) {
    const amount = formatQuantity(recipe.yieldQuantity * scale);
    facts.push({
      label: "Makes",
      value: recipe.yieldUnit ? `${amount} ${recipe.yieldUnit}` : amount,
    });
  }
  return facts;
}

const NUTRITION_LABELS: [keyof Nutrition, string][] = [
  ["calories", "Calories"],
  ["fatContent", "Fat"],
  ["saturatedFatContent", "Saturated fat"],
  ["unsaturatedFatContent", "Unsaturated fat"],
  ["transFatContent", "Trans fat"],
  ["cholesterolContent", "Cholesterol"],
  ["sodiumContent", "Sodium"],
  ["carbohydrateContent", "Carbohydrate"],
  ["fiberContent", "Fiber"],
  ["sugarContent", "Sugar"],
  ["proteinContent", "Protein"],
];

/** The nutrition values a recipe states, in the order a label prints them. */
export function nutritionFacts(nutrition: Nutrition | null): Fact[] {
  if (!nutrition) {
    return [];
  }
  return NUTRITION_LABELS.flatMap(([key, label]) => {
    const value = nutrition[key];
    return value ? [{ label, value }] : [];
  });
}

/** The site a link points at, without the "www". Null when the text is not a link. */
export function linkHost(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** True when a recipe has nothing but its title. */
export function isTitleOnly(recipe: Recipe): boolean {
  return (
    recipe.description === "" &&
    recipe.ingredientSections.every((section) => section.items.length === 0) &&
    recipe.stepSections.every((section) => section.steps.length === 0) &&
    recipe.notes.length === 0 &&
    recipe.assets.length === 0 &&
    recipeFacts(recipe).length === 0 &&
    nutritionFacts(recipe.nutrition).length === 0 &&
    recipe.sourceName === null &&
    recipe.sourceUrl === null
  );
}
