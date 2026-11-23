import { buildDraft } from "./build";
import { AiDraft, type ImportHandler } from "./runner";

/**
 * Text the cook pasted in: a recipe copied from a message, a document or a
 * page. One stage: a model copies the recipe out, and the draft goes to
 * review with the text beside it.
 */
export const importFromText: ImportHandler = async (_job, input, tools) => {
  const text = input.text ?? "";
  return new AiDraft(await buildDraft(text, tools.ai), text);
};
