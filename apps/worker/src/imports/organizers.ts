import { type OrganizerKind, type RecipeDraft, slugify } from "@recipeflare/schema";
import { z } from "zod";
import { AiFailure } from "../ai/failure";
import { ORGANIZE_PROMPT } from "../ai/prompts";
import { listOrganizers } from "../db/lists";
import { buildDraft } from "./build";
import type { ImportTools } from "./runner";

/**
 * Organizers for a recipe a model wrote up: which of the household's own
 * categories, tags and tools fit it. See docs/phase-2-plan.md §5, rule 5.
 *
 * The model is given the household's lists and may only choose among them.
 * What it answers is checked against those lists here, and a name that is not
 * on them is refused. It never creates one. What is left is offered in
 * review, never ticked: a model is guessing.
 */

/** What the model is asked to fill: names from the lists it was given, and no others. */
export const OrganizerChoice = z.object({
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  tools: z.array(z.string()),
});
export type OrganizerChoice = z.infer<typeof OrganizerChoice>;

export type Suggested = Pick<
  RecipeDraft,
  "suggestedCategories" | "suggestedTags" | "suggestedTools"
>;

const NONE: Suggested = { suggestedCategories: [], suggestedTags: [], suggestedTools: [] };

/** How many of each kind the model is shown, and how many it may choose. */
const SHOWN = 150;
const MOST: Record<OrganizerKind, number> = { category: 2, tag: 4, tool: 4 };
/** How much of the recipe's text the model is given to choose by. */
const TEXT_SHOWN = 6000;

type Listed = { kind: OrganizerKind; name: string; slug: string };

/**
 * Of the names a model chose, those that are the household's own, by the
 * household's spelling. A name that is not on the list is refused.
 */
export function ownOnly(
  chosen: readonly string[],
  kind: OrganizerKind,
  organizers: readonly Listed[],
): string[] {
  const names: string[] = [];
  for (const name of chosen) {
    const slug = slugify(name);
    const own = organizers.find((entry) => entry.kind === kind && entry.slug === slug);
    if (own && !names.includes(own.name)) {
      names.push(own.name);
    }
  }
  return names.slice(0, MOST[kind]);
}

const HEADINGS: [OrganizerKind, string][] = [
  ["category", "Categories"],
  ["tag", "Tags"],
  ["tool", "Tools"],
];

/**
 * Asks a model which of the household's organizers fit the recipe in `text`.
 * A household with none is not asked about. This is an extra: it always
 * answers, with nothing when the model gave no usable answer.
 */
export async function suggestOrganizers(text: string, tools: ImportTools): Promise<Suggested> {
  if (text.trim() === "") {
    return NONE;
  }
  const organizers: Listed[] = await listOrganizers(tools.env.DB);
  if (organizers.length === 0) {
    return NONE;
  }
  const lists = HEADINGS.flatMap(([kind, heading]) => {
    const names = organizers.filter((entry) => entry.kind === kind).map((entry) => entry.name);
    return names.length === 0 ? [] : [`${heading}:\n${names.slice(0, SHOWN).join("\n")}`];
  });
  try {
    const answer = await tools.ai.run({
      task: "details",
      promptVersion: ORGANIZE_PROMPT.version,
      system: ORGANIZE_PROMPT.system,
      prompt: `The household's own lists:\n\n${lists.join("\n\n")}\n\nThe recipe:\n\n${text.slice(0, TEXT_SHOWN)}`,
      schema: OrganizerChoice,
      schemaName: "organizer_choice",
      maxTokens: 1000,
    });
    return {
      suggestedCategories: ownOnly(answer.value.categories, "category", organizers),
      suggestedTags: ownOnly(answer.value.tags, "tag", organizers),
      suggestedTools: ownOnly(answer.value.tools, "tool", organizers),
    };
  } catch (error) {
    if (error instanceof AiFailure) {
      return NONE;
    }
    throw error;
  }
}

/**
 * A draft of the recipe in `text`, with the household's organizers that fit
 * it. Two calls, made side by side so that the second costs the cook no wait.
 * The draft is what matters: when it cannot be made, that is the outcome.
 */
export async function draftWithOrganizers(text: string, tools: ImportTools): Promise<RecipeDraft> {
  const suggesting = suggestOrganizers(text, tools).catch((): Suggested => NONE);
  let draft: RecipeDraft;
  try {
    draft = await buildDraft(text, tools.ai);
  } finally {
    // Waited for either way, so that its call is on the job's record.
    await suggesting;
  }
  return { ...draft, ...(await suggesting) };
}
