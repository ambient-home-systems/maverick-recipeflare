import { createApp } from "./app";
import { IMPORT_HANDLERS } from "./imports/handlers";
import { handleImportBatch } from "./imports/runner";

export type { AppType } from "./app";

const app = createApp();

export default {
  fetch: app.fetch,
  /** Imports: each message names a job to run, or on the dead-letter queue a job to give up on. */
  queue(batch, env) {
    return handleImportBatch(batch, IMPORT_HANDLERS, { fetch, env });
  },
} satisfies ExportedHandler<Env>;
