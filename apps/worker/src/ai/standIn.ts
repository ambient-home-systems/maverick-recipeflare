import type { AiBinding } from "./runner";

/**
 * A scripted stand-in for Workers AI, for a computer with no Cloudflare
 * account: `pnpm dev` and the end-to-end run. It reads no better than a few
 * rules, on purpose. It is here so that the screens and the import jobs can be
 * tried and tested; what a real model is like is measured on staging.
 *
 * It is switched on by `AI_MODE=stand-in`, a setting the deploy script never
 * passes on. A request that is not to localhost is refused it.
 */

const answer = (value: unknown) => ({
  model: "stand-in",
  choices: [{ message: { content: JSON.stringify(value) }, finish_reason: "stop" }],
  usage: { prompt_tokens: 0, completion_tokens: 0 },
});

const HEADING = /^(.{1,60}):$/;
const INGREDIENTS = /^ingredients?:?$/i;
const METHOD = /^(?:method|directions?|instructions?|steps?|preparation):?$/i;
/** A line that starts with an amount, as an ingredient line does. */
const AMOUNT = /^(?:\d|[¼½¾⅓⅔⅛]|a\s|an\s|one\s|two\s|pinch|dash|salt\b)/i;

/**
 * A recipe read by rule from text laid out the usual way: a title, then
 * ingredient lines, then steps. Anything it cannot place it leaves out.
 */
export function readByRule(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter((line) => line !== "");
  const ingredients: { section: string | null; line: string; doubt: string | null }[] = [];
  const steps: { section: string | null; text: string; doubt: string | null }[] = [];
  const [title = "", ...rest] = lines;
  let section: string | null = null;
  let inMethod = false;

  for (const line of rest) {
    if (INGREDIENTS.test(line)) {
      inMethod = false;
      section = null;
    } else if (METHOD.test(line)) {
      inMethod = true;
      section = null;
    } else if (HEADING.test(line)) {
      section = line.slice(0, -1);
    } else if (!inMethod && AMOUNT.test(line) && line.length <= 80) {
      ingredients.push({ section, line, doubt: null });
    } else if (/[.!?]$/.test(line) || inMethod) {
      // The first sentence after the ingredients starts the method.
      if (!inMethod) {
        inMethod = true;
        section = null;
      }
      steps.push({ section, text: line, doubt: null });
    }
  }

  return {
    recipe: ingredients.length > 0 || steps.length > 0,
    title: ingredients.length > 0 || steps.length > 0 ? title : "",
    description: "",
    yield: null,
    prepTime: null,
    cookTime: null,
    totalTime: null,
    source: null,
    ingredients,
    steps,
    notes: [],
  };
}

/** What the stand-in "reads" from any card: it cannot see, so every card says this. Invented. */
export const STAND_IN_CARD = `Stand-in Shortbread

Ingredients:
1 cup butter
1/2 cup sugar
2 cups flour

Method:
Cream the butter and sugar.
Work in the flour and press into a pan.
Bake at 325 until pale gold.`;

/** A picture too small to be a photograph is how a test says "a blank photo". */
const BLANK_UNDER = 600;

/** The pictures a question came with, as their data addresses. */
function pictures(inputs: Inputs): string[] {
  const content = inputs.messages?.findLast((message) => message.role === "user")?.content;
  const parts = Array.isArray(content)
    ? (content as { type?: string; image_url?: { url?: string } }[])
    : [];
  return parts.flatMap((part) => (part.type === "image_url" ? [part.image_url?.url ?? ""] : []));
}

type Inputs = {
  messages?: { role: string; content: unknown }[];
  response_format?: { json_schema?: { name?: string } };
};

/** The words of the last message a person would have typed. */
function asked(inputs: Inputs): string {
  const content = inputs.messages?.findLast((message) => message.role === "user")?.content;
  if (typeof content === "string") {
    return content;
  }
  const parts = Array.isArray(content) ? (content as { type?: string; text?: string }[]) : [];
  return parts.find((part) => part.type === "text")?.text ?? "";
}

export const standInBinding: AiBinding = {
  aiGatewayLogId: null,
  lastRequestHttpStatusCode: null,
  async run(_model, inputs: Inputs) {
    switch (inputs.response_format?.json_schema?.name) {
      case "connection_check":
        return answer({ word: "ready", sum: 5 });
      case "card_reading": {
        const shown = pictures(inputs);
        const blank = shown.length === 0 || shown.every((url) => url.length < BLANK_UNDER);
        return answer(
          blank
            ? { readable: false, sides: [], unsure: [] }
            : {
                readable: true,
                // The front says it all; any further side is blank.
                sides: shown.map((_url, index) => (index === 0 ? STAND_IN_CARD : "")),
                unsure: [{ words: "1/2 cup sugar", why: "The amount is written over." }],
              },
        );
      }
      case "ingredient_lines":
        // Each numbered line: its first number as the amount and its last word as the food.
        return answer({
          lines: [...asked(inputs).matchAll(/^(\d+)\. (.+)$/gm)].map(([, number, line = ""]) => ({
            number: Number(number),
            quantity: Number(/\d+/.exec(line)?.[0] ?? Number.NaN) || null,
            unit: null,
            food: line.trim().split(/\s+/).at(-1) ?? null,
            note: null,
          })),
        });
      case "organizer_choice": {
        // Of the names it was given, those the recipe's own text has in it.
        const [given = "", recipe = ""] = asked(inputs).split("\n\nThe recipe:\n\n");
        const has = (name: string) => recipe.toLowerCase().includes(name.toLowerCase());
        const under = (heading: string) =>
          (new RegExp(`${heading}:\\n([\\s\\S]*?)(?:\\n\\n|$)`).exec(given)?.[1] ?? "")
            .split("\n")
            .filter((name) => name.trim() !== "" && has(name));
        return answer({
          categories: under("Categories"),
          tags: under("Tags"),
          tools: under("Tools"),
        });
      }
      case "recipe_reading":
        return answer(readByRule(asked(inputs).replace(/^The text:\s*/, "")));
      default:
        throw new Error("7003: The stand-in has no answer for this kind of question");
    }
  },
};
