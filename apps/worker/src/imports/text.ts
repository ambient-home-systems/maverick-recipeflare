import { afterBuild, detailsStage } from "./details";
import { draftWithOrganizers } from "./organizers";
import type { ImportHandler } from "./runner";
import { translateStage } from "./translate";

/**
 * Text the cook pasted in: a recipe copied from a message, a document or a
 * page. A model copies the recipe out, and the draft goes to review with the
 * text beside it. Where the rules cannot read one of its ingredient lines,
 * there is a second stage, in which a model reads those.
 */
export const importFromText: ImportHandler = async (job, input, tools, work) => {
  if (job.stage === "translate") {
    return translateStage(work, tools);
  }
  if (job.stage === "details") {
    return detailsStage(work, tools);
  }
  const text = input.text ?? "";
  return afterBuild(await draftWithOrganizers(text, tools), text, tools);
};
