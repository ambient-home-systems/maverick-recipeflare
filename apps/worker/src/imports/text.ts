import { buildDraft } from "./build";
import { afterBuild, detailsStage } from "./details";
import type { ImportHandler } from "./runner";

/**
 * Text the cook pasted in: a recipe copied from a message, a document or a
 * page. A model copies the recipe out, and the draft goes to review with the
 * text beside it. Where the rules cannot read one of its ingredient lines,
 * there is a second stage, in which a model reads those.
 */
export const importFromText: ImportHandler = async (job, input, tools, work) => {
  if (job.stage === "details") {
    return detailsStage(work, tools);
  }
  const text = input.text ?? "";
  return afterBuild(await buildDraft(text, tools.ai), text, tools);
};
