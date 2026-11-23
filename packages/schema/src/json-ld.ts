/**
 * Finding the recipe a page describes in its schema.org JSON-LD. It is shared
 * because two things read a page's blocks: the Worker, which fetches the page,
 * and the web app, which is handed a page by the cook's own browser and says
 * what it found before anything is sent.
 */

type Json = unknown;
/** One thing a page describes: a set of named values. */
export type JsonLdNode = Record<string, Json>;

const isNode = (value: Json): value is JsonLdNode =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: Json): Json[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

/** True for a node that says it is a recipe, alone or among other types. */
const isRecipe = (node: JsonLdNode) => list(node["@type"]).some((type) => type === "Recipe");

/**
 * A JSON-LD block as data, or undefined. A line break typed inside a string is
 * the commonest mistake in these blocks, so a block that fails is tried once
 * more with its line breaks as spaces.
 */
function parseBlock(block: string): Json | undefined {
  for (const text of [block, block.replace(/[\r\n\t]+/g, " ")]) {
    try {
      return JSON.parse(text);
    } catch {
      // Try the next reading.
    }
  }
  return undefined;
}

/** The first recipe described anywhere in a page's JSON-LD: at the top, in a list, or inside `@graph`. */
export function findRecipe(blocks: readonly string[]): JsonLdNode | null {
  const seen = new Set<Json>();
  const search = (value: Json, depth: number): JsonLdNode | null => {
    if (depth > 6 || seen.has(value)) {
      return null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = search(item, depth + 1);
        if (found) {
          return found;
        }
      }
      return null;
    }
    if (!isNode(value)) {
      return null;
    }
    seen.add(value);
    if (isRecipe(value)) {
      return value;
    }
    return search(value["@graph"], depth + 1) ?? search(value.mainEntity, depth + 1);
  };

  for (const block of blocks) {
    const parsed = parseBlock(block);
    if (parsed === undefined) {
      // A block that is not valid JSON is the site's mistake; the next may be fine.
      continue;
    }
    const found = search(parsed, 0);
    if (found) {
      return found;
    }
  }
  return null;
}
