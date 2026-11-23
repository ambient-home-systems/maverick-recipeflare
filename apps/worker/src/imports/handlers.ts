import type { ImportHandlers } from "./runner";
import { importFromText } from "./text";
import { importFromUrl } from "./url";

/**
 * One handler for each kind of import the app can do. Photographs and video
 * are added by later tasks and phases. A kind with no handler fails with a
 * message saying so.
 */
export const IMPORT_HANDLERS: ImportHandlers = { url: importFromUrl, text: importFromText };
