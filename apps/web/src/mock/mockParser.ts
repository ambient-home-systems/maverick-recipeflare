import { type Food, nameKey, type Unit, unitMatcher } from "@recipeflare/schema";
import { type LineParser, readQuantity } from "../pages/editor/editorState";

/**
 * A stand-in for the ingredient line parser, so the editor can be judged
 * before the real one exists. The real parser is task T1.5, in the shared
 * package, with a test corpus; this copy follows the same outline (amount,
 * unit, food, note) and nothing else should rely on it.
 */
export function makeMockParser(units: readonly Unit[], foods: readonly Food[]): LineParser {
  const matchUnit = unitMatcher(units);
  const foodIds = new Map<string, string>();
  for (const food of foods) {
    for (const name of [food.name, food.pluralName, ...food.aliases]) {
      if (name && !foodIds.has(nameKey(name))) {
        foodIds.set(nameKey(name), food.id);
      }
    }
  }

  return (text) => {
    const amount = readQuantity(text);
    let rest = (amount ? amount.rest : text).trim();
    // "1 - (15 1/2 oz can) …" and the like: too easy to misread, so it stays as written.
    if (/^[-–x]?\s*\(/.test(rest)) {
      return null;
    }
    // A range such as "2 to 3 cups" keeps its first number; the typed text keeps the range.
    rest = rest.replace(/^(?:to|-|–)\s*\d+(?:[./]\d+)?\s+/, "").replace(/^[-–]\s*/, "");

    const words = rest.split(/\s+/).filter(Boolean);
    let unitId: string | null = null;
    for (const take of [2, 1]) {
      const candidate = words.slice(0, take).join(" ");
      const found = candidate ? matchUnit(candidate) : null;
      if (found && words.length >= take) {
        unitId = found;
        rest = words.slice(take).join(" ");
        break;
      }
    }
    rest = rest.replace(/^of\s+/i, "");

    // The food is the longest run of leading words that names one of the household's foods.
    const head = rest.split(/\s*(?:,|\(|\s[-–]\s)/)[0] ?? "";
    const headWords = head.split(/\s+/).filter(Boolean);
    let foodId: string | null = null;
    let foodLength = 0;
    for (let take = headWords.length; take > 0; take--) {
      const found = foodIds.get(nameKey(headWords.slice(0, take).join(" ")));
      if (found) {
        foodId = found;
        foodLength = headWords.slice(0, take).join(" ").length;
        break;
      }
    }

    const tidy = (note: string) =>
      note
        .replace(/^[\s,–-]+/, "")
        .replace(/[()]/g, "")
        .trim();
    if (foodId) {
      return {
        quantity: amount?.quantity ?? null,
        unitId,
        foodId,
        newFood: null,
        note: tidy(rest.slice(foodLength)),
      };
    }
    if (!amount && !unitId) {
      // Nothing was recognised: the line is kept as written.
      return null;
    }
    const newFood = head.trim();
    if (!newFood) {
      return {
        quantity: amount?.quantity ?? null,
        unitId,
        foodId: null,
        newFood: null,
        note: tidy(rest),
      };
    }
    return {
      quantity: amount?.quantity ?? null,
      unitId,
      foodId: null,
      newFood: newFood.toLowerCase(),
      note: tidy(rest.slice(head.length)),
    };
  };
}
