import { LIMITS, Nutrition, parseIsoDuration } from "@recipeflare/schema";
import { type ImportHandler, PermanentImportError, RetryableImportError } from "./runner";

/**
 * Importing a recipe from a link, as docs/implementation-plan.md §7.3
 * describes: fetch the page, find the recipe its publisher described in
 * schema.org JSON-LD, and map that to a draft. Nothing is guessed: a page with
 * no such description fails with a message that says so.
 */

/** A recipe page is text. Anything this large is not one. */
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

type Json = unknown;
type Node = Record<string, Json>;

const isNode = (value: Json): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: Json): Json[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  deg: "°",
};

/** Text as a person would read it: no tags, no entities, one space between words. */
export function plainText(value: Json, max: number = LIMITS.stepTextLength): string {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_all, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_all, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z0-9]+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all)
    .replace(/[ \t\r\f\v ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, max);
}

/** The address to fetch, or a refusal: only web addresses, and never a machine named by number. */
export function checkedUrl(text: string | undefined): URL {
  let url: URL;
  try {
    url = new URL(text ?? "");
  } catch {
    throw new PermanentImportError("bad_link", "That is not a web address.");
  }
  const host = url.hostname.toLowerCase();
  const numbered =
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || /^\d+$/.test(host);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    numbered ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".")
  ) {
    throw new PermanentImportError("bad_link", "Only a public web address can be imported.");
  }
  return url;
}

/** What was read from a page: its JSON-LD blocks, what it calls itself, and where it turned out to be. */
type Page = { blocks: string[]; siteName: string | null; url: URL };

const tooLarge = () => new PermanentImportError("too_large", "That page is too large to read.");

/**
 * Asks for the page, following a site's redirects by hand so that each
 * address on the way is checked like the first.
 */
export async function fetchChecked(
  url: URL,
  fetcher: typeof fetch,
  accept = "text/html,application/xhtml+xml",
): Promise<{ response: Response; url: URL }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetcher(current.toString(), {
        headers: {
          Accept: accept,
          // Says what is asking, plainly. Some sites refuse a request that says nothing.
          "User-Agent": "Mozilla/5.0 (compatible; Recipeflare recipe import)",
        },
        redirect: "manual",
        signal,
      });
    } catch (error) {
      throw new RetryableImportError("The site could not be reached.", { cause: error });
    }
    const location = response.headers.get("Location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        throw new PermanentImportError("no_page", "The link leads nowhere.");
      }
      current = checkedUrl(next);
      continue;
    }
    return { response, url: current };
  }
  throw new PermanentImportError("no_page", "The link leads round in circles.");
}

/** Fetches a page and reads the parts of it an import needs, without holding more than it must. */
async function readPage(url: URL, fetcher: typeof fetch): Promise<Page> {
  const { response, url: finalUrl } = await fetchChecked(url, fetcher);

  if (response.status === 401 || response.status === 403) {
    throw new PermanentImportError("blocked", "The site refused the request.");
  }
  if (response.status === 404 || response.status === 410) {
    throw new PermanentImportError("no_page", "There is no page at that address.");
  }
  if (response.status === 429 || response.status >= 500) {
    throw new RetryableImportError(`The site answered ${response.status}.`);
  }
  if (!response.ok || !response.body) {
    throw new PermanentImportError("no_page", `The site answered ${response.status}.`);
  }
  const type = response.headers.get("Content-Type") ?? "";
  if (type !== "" && !/html|xml/i.test(type)) {
    throw new PermanentImportError("not_a_page", "That link is not a web page.");
  }
  if (Number(response.headers.get("Content-Length") ?? 0) > MAX_PAGE_BYTES) {
    throw tooLarge();
  }

  // Stops reading at the cap, for a page that does not say how long it is.
  const reader = response.body.getReader();
  let seen = 0;
  let overCap = false;
  const capped = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      seen += value.byteLength;
      if (seen > MAX_PAGE_BYTES) {
        overCap = true;
        controller.close();
        await reader.cancel();
        return;
      }
      controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });

  const blocks: string[] = [];
  let block = "";
  let siteName: string | null = null;
  const rewriter = new HTMLRewriter()
    .on('script[type="application/ld+json"]', {
      text(chunk) {
        block += chunk.text;
        if (chunk.lastInTextNode) {
          blocks.push(block);
          block = "";
        }
      },
    })
    .on('meta[property="og:site_name"]', {
      element(element) {
        siteName = siteName ?? element.getAttribute("content");
      },
    });
  try {
    // Only the content type goes along: it carries the page's character set.
    await rewriter
      .transform(new Response(capped, { headers: type === "" ? {} : { "Content-Type": type } }))
      .arrayBuffer();
  } catch (error) {
    throw new RetryableImportError("The page stopped arriving part-way.", { cause: error });
  }
  if (overCap) {
    throw tooLarge();
  }
  return { blocks, siteName, url: finalUrl };
}

/** True for a node that says it is a recipe, alone or among other types. */
const isRecipe = (node: Node) => list(node["@type"]).some((type) => type === "Recipe");

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
export function findRecipe(blocks: readonly string[]): Node | null {
  const seen = new Set<Json>();
  const search = (value: Json, depth: number): Node | null => {
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

/** The name of a person or an organisation, however it was written. */
function nameOf(value: Json): string | null {
  for (const item of list(value)) {
    const name = plainText(isNode(item) ? item.name : item, LIMITS.sourceNameLength);
    if (name !== "") {
      return name;
    }
  }
  return null;
}

/** "4", "4 servings", "Makes 24 cookies", 6: how many it serves, or how much it makes. */
export function readYield(value: Json): {
  servings: number | null;
  yieldQuantity: number | null;
  yieldUnit: string | null;
} {
  const none = { servings: null, yieldQuantity: null, yieldUnit: null };
  // A list such as ["4", "4 servings"] says one thing twice; the wordiest says the most.
  const texts = list(value)
    .map((item) => plainText(item, 200))
    .filter((text) => text !== "")
    .sort((a, b) => b.length - a.length);
  for (const text of texts) {
    const match = /^(?:makes|yields?|serves)?:?\s*(\d+(?:\.\d+)?)\s*(.*)$/i.exec(text);
    if (!match) {
      continue;
    }
    const amount = Number(match[1]);
    const what = (match[2] ?? "").replace(/^(?:[-–—]|to\b)\s*\d+(\.\d+)?\s*/i, "").trim();
    if (!(amount > 0)) {
      continue;
    }
    if (
      what === "" ||
      /^(servings?|portions?|people|persons?)\b/i.test(what) ||
      /^serves/i.test(text)
    ) {
      return { ...none, servings: amount };
    }
    return {
      servings: null,
      yieldQuantity: amount,
      yieldUnit: what.slice(0, LIMITS.yieldUnitLength),
    };
  }
  return none;
}

type DraftSteps = { title: string | null; steps: { text: string }[] };

/** Instructions as sections of steps, from a string, a list of strings, steps, or sections of steps. */
export function readInstructions(value: Json): DraftSteps[] {
  const sections: DraftSteps[] = [];
  let loose: { text: string }[] = [];
  const closeLoose = () => {
    if (loose.length > 0) {
      sections.push({ title: null, steps: loose });
      loose = [];
    }
  };
  const stepsOf = (item: Json): { text: string }[] => {
    if (typeof item === "string") {
      // One string for the whole method: each line of it is a step.
      return plainText(item, 100_000)
        .split("\n")
        .map((line) => ({ text: line.trim().slice(0, LIMITS.stepTextLength) }))
        .filter((step) => step.text !== "");
    }
    if (!isNode(item)) {
      return [];
    }
    if (list(item["@type"]).includes("HowToSection") || Array.isArray(item.itemListElement)) {
      return list(item.itemListElement).flatMap(stepsOf);
    }
    const text = plainText(item.text ?? item.name);
    return text === "" ? [] : [{ text }];
  };

  for (const item of list(value)) {
    if (isNode(item) && list(item["@type"]).includes("HowToSection")) {
      closeLoose();
      const steps = stepsOf(item);
      if (steps.length > 0) {
        sections.push({
          title: plainText(item.name, LIMITS.sectionTitleLength) || null,
          steps,
        });
      }
    } else {
      loose.push(...stepsOf(item));
    }
  }
  closeLoose();
  return sections;
}

/** Names from a comma-separated string or a list: keywords, categories. */
function names(value: Json): string[] {
  return [
    ...new Set(
      list(value)
        .flatMap((item) => plainText(item, 1000).split(","))
        .map((name) => name.trim().slice(0, LIMITS.nameLength))
        .filter((name) => name !== ""),
    ),
  ].slice(0, 20);
}

/** The first picture the page offers that has a web address. */
function imageUrl(value: Json, base: URL): string | null {
  for (const item of list(value)) {
    const text = isNode(item) ? item.url : item;
    if (typeof text !== "string" || text.trim() === "") {
      continue;
    }
    try {
      const url = new URL(text.trim(), base);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.toString();
      }
    } catch {
      // Not an address. Try the next.
    }
  }
  return null;
}

/** A schema.org recipe as a draft. Only what the page states is carried over. */
export function draftFromJsonLd(
  recipe: Node,
  page: { sourceUrl: URL; pageUrl: URL; siteName: string | null },
) {
  const nutrition = isNode(recipe.nutrition) ? recipe.nutrition : {};
  const stated = Object.fromEntries(
    Object.keys(Nutrition.shape).flatMap((key) => {
      const text = plainText(nutrition[key], LIMITS.nutritionValueLength);
      return text === "" ? [] : [[key, text]];
    }),
  );
  const lines = list(recipe.recipeIngredient ?? recipe.ingredients)
    .map((line) => plainText(line, LIMITS.ingredientTextLength).replace(/\n/g, " "))
    .filter((line) => line !== "");

  return {
    title: plainText(recipe.name, LIMITS.titleLength).replace(/\n/g, " "),
    description: plainText(recipe.description, LIMITS.descriptionLength),
    ...readYield(recipe.recipeYield),
    prepTimeSeconds: typeof recipe.prepTime === "string" ? parseIsoDuration(recipe.prepTime) : null,
    cookTimeSeconds: typeof recipe.cookTime === "string" ? parseIsoDuration(recipe.cookTime) : null,
    totalTimeSeconds:
      typeof recipe.totalTime === "string" ? parseIsoDuration(recipe.totalTime) : null,
    nutrition: Object.keys(stated).length > 0 ? stated : null,
    // Who the page says wrote it, or failing that what the site calls itself.
    sourceName:
      nameOf(recipe.author) ??
      nameOf(recipe.publisher) ??
      (page.siteName ? plainText(page.siteName, LIMITS.sourceNameLength) : null),
    // The link as it was given, so the same link pasted twice is recognised.
    sourceUrl: page.sourceUrl.toString(),
    imageUrl: imageUrl(recipe.image, page.pageUrl),
    ingredientSections:
      lines.length > 0
        ? [{ title: null, items: lines.map((originalText) => ({ originalText })) }]
        : [],
    stepSections: readInstructions(recipe.recipeInstructions),
    notes: [],
    suggestedCategories: names(recipe.recipeCategory),
    suggestedTags: [...new Set([...names(recipe.keywords), ...names(recipe.recipeCuisine)])].slice(
      0,
      20,
    ),
    suggestedTools: [],
  };
}

/** The handler for imports of kind `url`. */
export const importFromUrl: ImportHandler = async (_job, input, tools) => {
  const url = checkedUrl(input.url);
  const page = await readPage(url, tools.fetch);
  const recipe = findRecipe(page.blocks);
  if (!recipe) {
    throw new PermanentImportError(
      "no_recipe",
      "The page does not describe a recipe in a way the app can read.",
    );
  }
  return draftFromJsonLd(recipe, { sourceUrl: url, pageUrl: page.url, siteName: page.siteName });
};
