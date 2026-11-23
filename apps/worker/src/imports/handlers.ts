import type { ImportHandlers } from "./runner";

/**
 * One handler for each kind of import the app can do. Importing from a link
 * is added by T1.12; photographs, pasted text and video by later phases. A
 * kind with no handler fails with a message saying so.
 */
export const IMPORT_HANDLERS: ImportHandlers = {};
