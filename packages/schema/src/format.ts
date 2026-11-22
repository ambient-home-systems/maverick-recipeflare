import type { Ingredient } from "./recipe";

/** Fractions a cook would recognise, with the glyph for each. */
const FRACTIONS: readonly (readonly [number, string])[] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];
const FRACTION_TOLERANCE = 0.02;

function formatDecimal(quantity: number): string {
  return String(Number(quantity.toFixed(2)));
}

/**
 * A quantity for display. With `fraction`, 1.5 becomes "1½" and 0.333 becomes
 * "⅓"; a value that is not near a common fraction falls back to a decimal.
 */
export function formatQuantity(quantity: number, options: { fraction?: boolean } = {}): string {
  if (!(options.fraction ?? true)) {
    return formatDecimal(quantity);
  }
  const whole = Math.floor(quantity + FRACTION_TOLERANCE);
  const rest = quantity - whole;
  if (Math.abs(rest) <= FRACTION_TOLERANCE) {
    return String(whole);
  }
  const match = FRACTIONS.find(([value]) => Math.abs(value - rest) <= FRACTION_TOLERANCE);
  if (!match) {
    return formatDecimal(quantity);
  }
  return whole === 0 ? match[1] : `${whole}${match[1]}`;
}

/** True when the line has a quantity, so it changes when the recipe is scaled. */
export function isScalable(line: Pick<Ingredient, "quantity">): boolean {
  return line.quantity !== null;
}

/** True when the line has no parsed fields and is shown exactly as written. */
export function isFreeText(line: Pick<Ingredient, "quantity" | "unit" | "food">): boolean {
  return line.quantity === null && line.unit === null && line.food === null;
}

type DisplayLine = Pick<Ingredient, "originalText" | "quantity" | "unit" | "food" | "note">;

/**
 * The amount an ingredient line starts with, scaled by `scale`: "1½ cups", or
 * "2" for two eggs. Empty for a free-text line and for a line with no quantity
 * and no unit. It is always the start of what `formatIngredient` returns for
 * the same line and scale, so a screen can set it in a heavier weight.
 */
export function ingredientAmount(line: DisplayLine, options: { scale?: number } = {}): string {
  if (isFreeText(line)) {
    return "";
  }
  const quantity = line.quantity === null ? null : line.quantity * (options.scale ?? 1);
  const plural = quantity !== null && quantity > 1 + FRACTION_TOLERANCE;
  const parts: string[] = [];
  if (quantity !== null) {
    parts.push(formatQuantity(quantity, { fraction: line.unit?.fraction ?? true }));
  }
  if (line.unit) {
    const unit = line.unit;
    const singular = unit.useAbbreviation ? (unit.abbreviation ?? unit.name) : unit.name;
    const pluralForm = unit.useAbbreviation
      ? (unit.pluralAbbreviation ?? unit.abbreviation ?? unit.pluralName)
      : unit.pluralName;
    parts.push(plural ? (pluralForm ?? singular) : singular);
  }
  return parts.join(" ");
}

/**
 * An ingredient line for display, scaled by `scale`.
 *
 * A parsed line is built from its fields: "1½ cups flour, sifted". A line with
 * no parsed fields is returned as it was written and is not scaled.
 */
export function formatIngredient(line: DisplayLine, options: { scale?: number } = {}): string {
  if (isFreeText(line)) {
    return line.originalText ?? line.note;
  }

  const quantity = line.quantity === null ? null : line.quantity * (options.scale ?? 1);
  const plural = quantity !== null && quantity > 1 + FRACTION_TOLERANCE;
  const parts: string[] = [];

  const amount = ingredientAmount(line, options);
  if (amount) {
    parts.push(amount);
  }
  if (line.food) {
    // "2 eggs", but "2 cups flour": the unit carries the plural when there is one.
    const usePlural = plural && !line.unit;
    parts.push(usePlural ? (line.food.pluralName ?? line.food.name) : line.food.name);
  }

  const main = parts.join(" ");
  if (!line.note) {
    return main;
  }
  return main ? `${main}, ${line.note}` : line.note;
}
