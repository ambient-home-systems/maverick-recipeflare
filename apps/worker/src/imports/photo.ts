import { LIMITS } from "@recipeflare/schema";
import { z } from "zod";
import { READ_PROMPT } from "../ai/prompts";
import type { AiImage } from "../ai/runner";
import { assetsOfImport } from "../db/assets";
import { assetKey } from "../media";
import { buildDraft, doubtsAbout } from "./build";
import { afterBuild, detailsStage } from "./details";
import { type ImportHandler, NextStage, PermanentImportError } from "./runner";

/**
 * A photographed card. See docs/phase-2-plan.md §4.
 *
 * Two stages, each one model call. `read` copies out what is written on the
 * card's photos, front first. `build` makes a draft of that text exactly as
 * it would of pasted text, so the same checks against invented words apply.
 * What the reader was unsure of is carried along and said on the line it is about.
 */

/** What the reader is asked to fill: each side's text as written, and what it could not be sure of. */
export const CardReading = z.object({
  readable: z.boolean(),
  sides: z.array(z.string()),
  unsure: z.array(z.object({ words: z.string(), why: z.string() })),
});
export type CardReading = z.infer<typeof CardReading>;

const Unsure = CardReading.shape.unsure;

/** Kinds of picture every model that looks at pictures can be shown as they are. */
const SHOWN_AS_IT_IS = new Set(["image/jpeg", "image/png"]);
/** A photo as the phone sent it is about a megabyte. One much larger is shown in its smaller size. */
const SHOWN_AS_IT_IS_BYTES = 4 * 1024 * 1024;
/**
 * How long the reader is waited for. Reading photographs is the slowest thing
 * asked of a model: on the first real cards it often ran past the minute and
 * a half that other calls get, and was given up on while still at work.
 */
const READ_TIMEOUT_MS = 180_000;

const unreadable = (message = "Nothing could be read from the photo.") =>
  new PermanentImportError("unreadable", message);

/**
 * A card's photos as a model is shown them, front first. A JPEG or a PNG is
 * shown as it was sent, which keeps handwriting sharpest; any other kind is
 * shown in the smaller size the app made of it, when it could make one.
 */
async function cardImages(env: Env, jobId: string): Promise<AiImage[]> {
  const sides = (await assetsOfImport(env.DB, jobId)).slice(0, LIMITS.cardPhotos);
  const images: AiImage[] = [];
  for (const side of sides) {
    const asIs = SHOWN_AS_IT_IS.has(side.contentType) && side.sizeBytes <= SHOWN_AS_IT_IS_BYTES;
    if (!asIs && !side.hasVariants) {
      throw unreadable("The photo is of a kind that cannot be read here.");
    }
    const file = await env.MEDIA.get(assetKey(side.id, asIs ? "original" : "full"));
    if (!file) {
      throw unreadable("The photo is no longer here.");
    }
    images.push({
      type: asIs ? side.contentType : "image/webp",
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }
  return images;
}

export const importFromPhoto: ImportHandler = async (job, _input, tools, work) => {
  if (job.stage === "details") {
    return detailsStage(work, tools);
  }
  if (job.stage === "build") {
    const text = typeof work.text === "string" ? work.text : "";
    const draft = await buildDraft(text, tools.ai);
    const unsure = Unsure.safeParse(work.unsure);
    return afterBuild(
      { ...draft, doubts: [...draft.doubts, ...doubtsAbout(draft, unsure.data ?? [])] },
      text,
      tools,
    );
  }

  const images = await cardImages(tools.env, job.id);
  if (images.length === 0) {
    throw unreadable("The card has no photo.");
  }
  const answer = await tools.ai.run({
    task: "read",
    promptVersion: READ_PROMPT.version,
    system: READ_PROMPT.system,
    prompt:
      images.length === 1
        ? "The card has one photograph."
        : `The card has ${images.length} photographs, in order: the front first, then the back.`,
    images,
    schema: CardReading,
    schemaName: "card_reading",
    maxTokens: 8000,
    timeoutMs: READ_TIMEOUT_MS,
  });
  const sides = answer.value.sides.map((side) => side.trim()).filter((side) => side !== "");
  if (!answer.value.readable || sides.length === 0) {
    throw unreadable();
  }
  return new NextStage("build", {
    // Front, then back, as one text: a recipe that runs over the card runs on.
    text: sides.join("\n\n").slice(0, LIMITS.pastedText),
    unsure: answer.value.unsure
      .map((entry) => ({ words: entry.words.trim(), why: entry.why.trim() }))
      .filter((entry) => entry.words !== "" || entry.why !== "")
      .slice(0, 40),
  });
};
