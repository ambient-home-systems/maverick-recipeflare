import { readStatedDuration } from "./duration";

/**
 * What a step says about itself, read by rules: the time it states, and which
 * of the recipe's ingredients it names. See docs/phase-2-plan.md §7.
 *
 * Like the ingredient parser, these read only what they are sure of. A step
 * that states two times, or a range, has no one time; an ingredient is linked
 * only when the step has its name, and not when the name could be either of
 * two lines. A missing detail costs the cook a glance at the list. A wrong one
 * puts the wrong amount in front of them at the stove.
 */

const AMOUNT = String.raw`(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+(?:\.\d+)?)`;
// Spelt out, or its usual short form. A bare "m" or "s" in a step is not surely a time.
const UNIT = "(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)";
const PART = String.raw`${AMOUNT}\s*${UNIT}\b\.?`;
/** One time, in one or more parts: "45 minutes", "1 hr 30 min", "1 hour and 15 minutes". */
const TIME = new RegExp(String.raw`${PART}(?:\s*(?:,|and\b)?\s*${PART})*`, "gi");
/** Just before a time, what makes it the far end of a range or a choice: "20 to", "20-", "2 or". */
const RANGE_BEFORE = new RegExp(String.raw`${AMOUNT}\s*(?:to|or|-|–|—)\s*$`, "i");
/** Just before a time, what makes it how often and not how long: "stir every 5 minutes". */
const EVERY_BEFORE = /\b(?:every|each|per)\s*$/i;

/**
 * The time a step states, in seconds, when it states exactly one plain time:
 * "Bake until golden, about 15 minutes" is 900. Null for a step with no time,
 * with more than one, with a range ("20 to 25 minutes") or with a time that
 * says how often.
 */
export function statedStepTime(text: string): number | null {
  const plain = text
    // "1½" is one and a half: the half is set apart before it is spelt out as 1/2.
    .replace(/(\d)(\p{No})/gu, "$1 $2")
    .normalize("NFKD")
    .replace(/⁄/g, "/");
  const found = [...plain.matchAll(TIME)];
  const only = found[0];
  if (found.length !== 1 || only === undefined) {
    return null;
  }
  const before = plain.slice(0, only.index);
  if (RANGE_BEFORE.test(before) || EVERY_BEFORE.test(before)) {
    return null;
  }
  return readStatedDuration(only[0].replace(/\.$/, ""));
}

/** An ingredient line, by its ID, and the names its food goes by. A line with no food has none. */
export type NamedIngredient = { id: string; names: readonly (string | null | undefined)[] };

/** A word as it is compared: lower case, without accents, and in the singular where that is plain. */
function stem(word: string): string {
  if (/ies$/.test(word) && word.length > 4) {
    return word.replace(/ies$/, "y");
  }
  if (/(?:ches|shes|sses|xes|oes)$/.test(word)) {
    return word.replace(/es$/, "");
  }
  return /[^s]s$/.test(word) && word.length > 3 ? word.replace(/s$/, "") : word;
}

function stems(text: string): string[] {
  const plain = text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  return (plain.match(/\p{L}+/gu) ?? []).map(stem);
}

/**
 * The ingredients a step names, by ID, in the order given. A line is linked
 * when the step has its food's name, words together and in order, singular or
 * plural. A shorter name is not taken from inside a longer one that is also
 * an ingredient: with "butter" and "peanut butter" both in the recipe, "peanut
 * butter" in a step is only the second. A name that two lines share is linked
 * to neither: the step does not say which.
 */
export function namedIngredients(
  stepText: string,
  ingredients: readonly NamedIngredient[],
): string[] {
  const words = stems(stepText);
  type Found = { id: string; start: number; length: number };
  const found: Found[] = [];
  for (const { id, names } of ingredients) {
    for (const name of names) {
      const wanted = name ? stems(name) : [];
      if (wanted.length === 0) {
        continue;
      }
      for (let start = 0; start + wanted.length <= words.length; start++) {
        if (wanted.every((word, offset) => words[start + offset] === word)) {
          found.push({ id, start, length: wanted.length });
        }
      }
    }
  }

  // Longest names first: a word that is part of a longer name belongs to that name.
  const taken = new Set<number>();
  const claims = new Map<string, Set<string>>();
  const lengths = [...new Set(found.map((match) => match.length))].sort((a, b) => b - a);
  for (const length of lengths) {
    const these = found.filter(
      (match) =>
        match.length === length &&
        !Array.from({ length }, (_, offset) => match.start + offset).some((at) => taken.has(at)),
    );
    for (const match of these) {
      const place = `${match.start}:${match.length}`;
      claims.set(place, (claims.get(place) ?? new Set()).add(match.id));
    }
    for (const match of these) {
      for (let offset = 0; offset < length; offset++) {
        taken.add(match.start + offset);
      }
    }
  }

  const sure = new Set<string>();
  const shared = new Set<string>();
  for (const ids of claims.values()) {
    if (ids.size === 1) {
      sure.add([...ids][0] as string);
    } else {
      for (const id of ids) {
        shared.add(id);
      }
    }
  }
  return ingredients.map((line) => line.id).filter((id) => sure.has(id) && !shared.has(id));
}
