import type { IngredientReading } from "./ai";
import { type DraftLists, indexByName, unitMatcher } from "./matching";
import { nameKey } from "./name-key";
import { LIMITS } from "./primitives";

/**
 * The rule-based ingredient line parser. It reads a line the way it is written
 * on a card or a page ("2 cups flour, sifted") into an amount, a unit, a food
 * and a note.
 *
 * It is rules only: no network and no model, so it runs in the editor as the
 * cook types, offline included, and in the Worker for imported lines. It reads
 * only what it is sure of. A line it cannot read comes back as `null` and
 * stays as written; a wrong reading is worse than none. It never creates a
 * food or a unit, and it is never given the chance to change the typed text.
 */

/** What the parser read from one line. */
export type ParsedLine = {
  quantity: number | null;
  /** One of the household's units, or null. */
  unitId: string | null;
  /** One of the household's foods, or null. */
  foodId: string | null;
  /** A food name the household does not have yet. Created only when the cook confirms at save. */
  newFood: string | null;
  note: string;
};

/** Reads a typed line. Null means it could not be read, and the line stays as written. */
export type LineParser = (text: string) => ParsedLine | null;

/** The lists a line is matched against. */
export type ParserLists = Pick<DraftLists, "units" | "foods">;

// --- Amounts ---

const GLYPHS: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};
const GLYPH_CLASS = `[${Object.keys(GLYPHS).join("")}]`;
const WITH_GLYPH = new RegExp(`^(\\d+)?\\s*(${GLYPH_CLASS})`);

/**
 * Reads an amount from the start of some text: "2", "0.5", ".5", "1/2",
 * "1 1/2", "1-1/2", "1½" or "½". Returns the number and what follows it, or
 * null when the text does not start with an amount.
 */
export function readQuantity(text: string): { quantity: number; rest: string } | null {
  const source = text.trimStart();
  // "1 1/2" and "1-1/2" are both one and a half.
  const mixed = /^(\d+)(?:\s+|-)(\d+)\s*\/\s*(\d+)/.exec(source);
  const fraction = /^(\d+)\s*\/\s*(\d+)/.exec(source);
  const withGlyph = WITH_GLYPH.exec(source);
  const plain = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(source);

  let quantity: number;
  let length: number;
  if (mixed && Number(mixed[3]) !== 0) {
    quantity = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    length = mixed[0].length;
  } else if (fraction && Number(fraction[2]) !== 0) {
    quantity = Number(fraction[1]) / Number(fraction[2]);
    length = fraction[0].length;
  } else if (withGlyph) {
    quantity = Number(withGlyph[1] ?? 0) + (GLYPHS[withGlyph[2] as string] ?? 0);
    length = withGlyph[0].length;
  } else if (plain) {
    quantity = Number(plain[0]);
    length = plain[0].length;
  } else {
    return null;
  }
  return quantity > 0 && Number.isFinite(quantity)
    ? { quantity, rest: source.slice(length) }
    : null;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

// --- Words that describe a food without being part of its name ---

/** How it is prepared. Before the food ("minced onions") or after it ("butter melted"). */
const PREPARED = new Set(
  `beaten blanched boiled browned chilled chopped cooked cooled cored creamed crumbled crushed
   cubed diced divided drained flaked grated halved hulled juiced julienned mashed melted minced
   packed peeled pitted quartered rinsed roasted scrubbed seeded separated shelled shredded
   shucked sifted sliced slivered softened squeezed stemmed thawed toasted torn trimmed uncooked
   warmed washed whipped whisked zested`.split(/\s+/),
);
/** How much of a thing, or how full the spoon. Before a unit or a food. */
const SIZES = new Set(
  `big generous heaped heaping jumbo large level medium rounded scant small`.split(/\s+/),
);
/** How it is done. Only ever beside one of the words above. */
const MANNER = new Set(
  `coarsely finely firmly freshly gently lightly loosely roughly slightly thickly thinly tightly
   very well`.split(/\s+/),
);
/** Dropped to find a food the household has: "fresh thyme" is "thyme". Kept in a new food's name. */
const INCIDENTAL = new Set(`fresh organic raw ripe`.split(/\s+/));

const isDescriptor = (word: string) => {
  const lower = word.toLowerCase();
  return PREPARED.has(lower) || SIZES.has(lower) || MANNER.has(lower);
};

/** "to taste", "for serving" and the like, at the end of the food: they belong in the note. */
const TRAILING_PHRASE =
  /\s+(to taste|as needed|if desired|if needed|optional|at room temperature|for [a-z].*|plus .*|with .*|or to taste|or more.*|or as needed)$/i;

/** Splits the food from what follows it: a comma, a semicolon, or a dash with spaces around it. */
const AFTER_FOOD = /\s*[,;]\s*|\s+[-–—]\s+/;

const lowerFirstWords = (text: string) =>
  text
    .split(" ")
    .map((word) => {
      const bare = word.replace(/[^\p{L}-]/gu, "");
      return isDescriptor(bare) || INCIDENTAL.has(bare.toLowerCase()) ? word.toLowerCase() : word;
    })
    .join(" ");

/** Possible singulars of a word a card wrote in the plural: "onions", "tomatoes", "berries". */
function singulars(text: string): string[] {
  const options: string[] = [];
  if (/ies$/i.test(text)) {
    options.push(text.replace(/ies$/i, "y"));
  }
  if (/(?:ches|shes|sses|xes|oes)$/i.test(text)) {
    options.push(text.replace(/es$/i, ""));
  }
  if (/[^s]s$/i.test(text)) {
    options.push(text.replace(/s$/i, ""));
  }
  return options;
}

/**
 * Makes a parser for one household's units and foods. Build it once and use it
 * for every line: it indexes the lists when it is made.
 */
export function ingredientParser(lists: ParserLists): LineParser {
  const matchUnit = unitMatcher(lists.units);
  const foodIndex = indexByName(lists.foods, (f) => [f.name, f.pluralName, ...f.aliases], nameKey);

  const knownFood = (words: readonly string[]): string | null => {
    if (words.length === 0) {
      return null;
    }
    const text = words.join(" ");
    const exact = foodIndex.get(nameKey(text));
    if (exact) {
      return exact;
    }
    for (const singular of singulars(text)) {
      const found = foodIndex.get(nameKey(singular));
      if (found) {
        return found;
      }
    }
    return null;
  };

  /** A unit at the start of `words`: two words first, then one. A short symbol needs an amount before it. */
  const unitAt = (
    words: readonly string[],
    hasAmount: boolean,
  ): { id: string; taken: number } | null => {
    for (const taken of [2, 1]) {
      if (words.length < taken) {
        continue;
      }
      const candidate = words.slice(0, taken).join(" ").replace(/[,;]$/, "");
      const id = matchUnit(candidate);
      if (id && (hasAmount || candidate.replace(/\./g, "").length > 2)) {
        return { id, taken };
      }
    }
    return null;
  };

  return (typed) => {
    // Work on a copy; the typed text is the caller's and is never changed.
    let text = typed.replace(/[   ]/g, " ").replace(/⁄/g, "/").replace(/\s+/g, " ").trim();
    // A heading ("For the sauce:") or something far too long to be one ingredient.
    if (text === "" || text.endsWith(":") || text.length > 200) {
      return null;
    }
    text = text
      .replace(/^[-–—•*·▪◦]+\s*/, "")
      .replace(/^(?:about|approximately|approx\.?|around|roughly|~)\s*/i, "");

    const notes: string[] = [];
    let quantity: number | null = null;
    let unitId: string | null = null;
    let rest = text;

    // --- The amount ---
    const amount = readQuantity(rest);
    const word = /^([a-z]+)\s+/i.exec(rest);
    /** "a" or "an" counts as one only in front of a unit: "a pinch of salt". */
    let articleBefore: string | null = null;
    if (amount) {
      quantity = amount.quantity;
      rest = amount.rest.trim();
    } else if (word && NUMBER_WORDS[(word[1] as string).toLowerCase()] !== undefined) {
      quantity = NUMBER_WORDS[(word[1] as string).toLowerCase()] ?? null;
      rest = rest.slice(word[0].length);
    } else if (word && /^an?$/i.test(word[1] as string)) {
      articleBefore = rest;
      quantity = 1;
      rest = rest.slice(word[0].length);
    }

    if (amount) {
      // "2 to 3 cups", "2-3 cups": a range keeps its first number, and the typed text keeps the range.
      // "1 - 12 oz chips", "2 x 400 g tins", "1 15-ounce can": a count of packages and their size.
      const joiner = /^(to\b|or\b|x\b|[-–—])\s*/i.exec(rest);
      const afterJoiner = joiner ? rest.slice(joiner[0].length) : rest;
      // Only a number written as one: "1 one-pound loaf" is not a size this reads.
      const second =
        /^[\d.]/.test(afterJoiner) || WITH_GLYPH.test(afterJoiner)
          ? readQuantity(afterJoiner)
          : null;
      if (second) {
        const how = joiner ? (joiner[1] as string).toLowerCase() : "";
        const dash = joiner !== null && /^[-–—]$/.test(how);
        const isRange =
          how === "to" ||
          how === "or" ||
          (dash && second.quantity > amount.quantity && second.quantity <= amount.quantity * 3);
        if (isRange) {
          rest = second.rest.trim();
        } else {
          // A size: its unit follows, perhaps joined by a hyphen ("15-ounce").
          const sizeWords = second.rest.replace(/^-/, "").trim().split(" ");
          const sizeUnit = unitAt(sizeWords, true);
          if (!sizeUnit) {
            return null;
          }
          const afterSize = sizeWords.slice(sizeUnit.taken);
          const container = unitAt(afterSize, true);
          if (container) {
            // "2 14-oz cans tomatoes": two cans, and the size is a note.
            const remaining = afterSize.join(" ");
            notes.push(afterJoiner.slice(0, afterJoiner.length - remaining.length).trim());
            unitId = container.id;
            rest = afterSize.slice(container.taken).join(" ");
          } else {
            // "1 - 12 oz chocolate chips": twelve ounces in all.
            quantity = amount.quantity * second.quantity;
            unitId = sizeUnit.id;
            rest = afterSize.join(" ");
          }
        }
      } else if (joiner && /^[-–—]$/.test(joiner[1] as string)) {
        // "1 - (15 oz can) …": a dash before the rest, and nothing to read from it.
        rest = rest.slice(joiner[0].length);
      }
    }

    // --- A size in brackets before the unit: "1 (15-ounce) can", "1 - (15 1/2 oz can)" ---
    const bracket = /^\(([^)]*)\)\s*/.exec(rest);
    if (bracket && quantity !== null && unitId === null) {
      const inner = (bracket[1] as string).trim();
      const innerWords = inner.split(" ");
      // The unit may be inside the brackets, as its last word: "(15 1/2 oz can)".
      const last = innerWords.length > 1 ? unitAt(innerWords.slice(-1), true) : null;
      const sized = readQuantity(inner) !== null;
      if (last && sized && innerWords.length > 2) {
        unitId = last.id;
        notes.push(innerWords.slice(0, -1).join(" "));
      } else if (inner !== "") {
        notes.push(inner);
      }
      rest = rest.slice(bracket[0].length);
    }

    // --- The unit ---
    if (unitId === null) {
      let words = rest.split(" ").filter(Boolean);
      // "2 heaping tablespoons", "1 small can": the word before the unit is a note.
      const modifier =
        words.length > 1 &&
        SIZES.has((words[0] as string).toLowerCase()) &&
        unitAt(words.slice(1), quantity !== null)
          ? (words[0] as string)
          : null;
      if (modifier) {
        words = words.slice(1);
      }
      const unit = unitAt(words, quantity !== null);
      if (unit) {
        unitId = unit.id;
        if (modifier) {
          notes.push(modifier.toLowerCase());
        }
        rest = words.slice(unit.taken).join(" ");
      }
    }
    if (articleBefore !== null && unitId === null) {
      // "a ripe banana": the article was not an amount after all.
      quantity = null;
      rest = articleBefore;
    }
    rest = rest.replace(/^of\s+(?:the\s+)?/i, "");

    // --- The food, and what is said about it ---
    const bracketed: string[] = [];
    rest = rest
      .replace(/\(([^)]*)\)/g, (_all, inner: string) => {
        if (inner.trim() !== "") {
          bracketed.push(inner.trim());
        }
        return " ";
      })
      // A bracket that was never closed: what follows it is still an aside.
      .replace(/\((.*)$/, (_all, inner: string) => {
        if (inner.trim() !== "") {
          bracketed.push(inner.trim());
        }
        return " ";
      })
      .replace(/[()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const cut = AFTER_FOOD.exec(rest);
    let head = (cut ? rest.slice(0, cut.index) : rest).trim();
    const tail = cut ? rest.slice(cut.index + cut[0].length).trim() : "";

    const after: string[] = [];
    const phrase = TRAILING_PHRASE.exec(head);
    if (phrase) {
      after.push((phrase[1] as string).trim());
      head = head.slice(0, phrase.index).trim();
    }
    const alternative = /\s+or\s+/i.exec(head);
    if (alternative) {
      after.unshift(`or ${head.slice(alternative.index + alternative[0].length).trim()}`);
      head = head.slice(0, alternative.index).trim();
    }

    const words = head.split(" ").filter(Boolean);
    let foodId: string | null = null;
    let newFood: string | null = null;
    const before: string[] = [];
    const behind: string[] = [];

    // 1. The words as they stand: "cooked rice" is a food if the household says so.
    foodId = knownFood(words);
    let core = words;
    if (!foodId) {
      // 2. Without the words that say how it is prepared or how big it is.
      let start = 0;
      let end = words.length;
      while (start < end && isDescriptor(words[start] as string)) {
        start++;
      }
      while (end > start && isDescriptor(words[end - 1] as string)) {
        end--;
      }
      // A manner word alone at the end says nothing: "black pepper freshly" is not a reading.
      core = words.slice(start, end);
      before.push(...words.slice(0, start));
      behind.push(...words.slice(end));
      foodId = knownFood(core);

      if (!foodId) {
        // 3. Without "fresh", "ripe" and the like in front.
        let soft = 0;
        while (soft < core.length - 1 && INCIDENTAL.has((core[soft] as string).toLowerCase())) {
          soft++;
        }
        const softened = core.slice(soft);
        if (soft > 0 && knownFood(softened)) {
          foodId = knownFood(softened);
          before.push(...core.slice(0, soft));
          core = softened;
        }
      }
      if (!foodId) {
        // 4. A brand in capitals before a food written small: "Chef Boy-ar-Dee spaghetti sauce".
        // Two words at least: one capital is as likely "Greek yogurt", which is not yogurt.
        for (let lead = 2; lead < core.length; lead++) {
          const brand = core.slice(0, lead);
          const named = core.slice(lead);
          const brandLike = brand.every((part) => /^\p{Lu}/u.test(part));
          const plain = named.every((part) => !/^\p{Lu}/u.test(part));
          if (brandLike && plain && knownFood(named)) {
            foodId = knownFood(named);
            before.push(brand.join(" "));
            core = named;
            break;
          }
          if (!brandLike) {
            break;
          }
        }
      }
    }

    if (!foodId) {
      if (quantity === null && unitId === null) {
        // Nothing was recognised: the line is kept as written.
        return null;
      }
      const name = core
        .join(" ")
        .replace(/[.:]+$/, "")
        .trim();
      newFood = name === "" ? null : name.toLowerCase();
    }
    if (foodId === null && newFood === null && unitId === null) {
      // A number and nothing it could be a number of.
      return null;
    }

    const note = [
      ...notes,
      ...(before.length > 0 ? [before.join(" ")] : []),
      ...(behind.length > 0 ? [behind.join(" ")] : []),
      ...bracketed,
      ...after,
      ...(tail !== "" ? [tail] : []),
    ]
      .map((piece) => lowerFirstWords(piece.trim()))
      .filter((piece) => piece !== "")
      .join(", ")
      .slice(0, LIMITS.ingredientTextLength);

    return { quantity, unitId, foodId, newFood, note };
  };
}

/** True when the rules read nothing from a line, and it is kept as written. */
export function isUnread(read: ParsedLine | null): boolean {
  return (
    read === null ||
    (read.quantity === null &&
      read.unitId === null &&
      read.foodId === null &&
      read.newFood === null)
  );
}

/**
 * Matches a model's reading of a line to the household's own units and foods,
 * as a typed line is matched. A unit the household does not have is left out;
 * a food it does not have rides on the line as a new food, for the cook to
 * confirm at save. Nothing is created. Null when nothing is left to say.
 */
export function matchReading(reading: IngredientReading, lists: ParserLists): ParsedLine | null {
  const unitName = reading.unitName?.trim() ?? "";
  const unitId = unitName === "" ? null : unitMatcher(lists.units)(unitName);

  const foodName = (reading.foodName?.trim() ?? "").slice(0, LIMITS.nameLength);
  let foodId: string | null = null;
  if (foodName !== "") {
    const index = indexByName(lists.foods, (f) => [f.name, f.pluralName, ...f.aliases], nameKey);
    foodId =
      [foodName, ...singulars(foodName)]
        .map((name) => index.get(nameKey(name)))
        .find((id) => id !== undefined) ?? null;
  }
  const newFood = foodId === null && foodName !== "" ? foodName : null;
  const quantity = reading.quantity !== null && reading.quantity > 0 ? reading.quantity : null;

  if (quantity === null && unitId === null && foodId === null && newFood === null) {
    return null;
  }
  return {
    quantity,
    unitId,
    foodId,
    newFood,
    note: reading.note.trim().slice(0, LIMITS.ingredientTextLength),
  };
}

/** Reads one line. For more than one, make a parser with `ingredientParser` and reuse it. */
export function parseIngredientLine(text: string, lists: ParserLists): ParsedLine | null {
  return ingredientParser(lists)(text);
}
