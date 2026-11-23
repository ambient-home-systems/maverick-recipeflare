import type { ImportHandlers } from "./runner";
import { importFromUrl } from "./url";

/**
 * One handler for each kind of import the app can do. Photographs, pasted
 * text and video are added by later phases. A kind with no handler fails with
 * a message saying so.
 */
export const IMPORT_HANDLERS: ImportHandlers = { url: importFromUrl };
