import type { Query } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

/**
 * Keeping what the API has said on the device, so recipes open with no
 * connection and with a session that has run out. Only recipes and the
 * household's lists are kept: a search's results or an import's progress are
 * worth nothing later.
 */

const STORE_KEY = "recipeflare:queries";

/**
 * The shape of what is kept. What comes back from the device is not checked
 * against the shared schema again, so when a kept shape changes (a field of
 * `Recipe`, or of a list entry, renamed or removed), raise this: copies in the
 * old shape are then thrown away and fetched afresh.
 */
export const KEPT_SHAPE = "1";

/** How long after a change the copy on the device is written. A background copy makes many. */
const WRITE_AFTER_MS = 1000;

/** True for what is worth keeping between visits: a whole recipe, or one of the household's lists. */
export function isKept(query: Pick<Query, "queryKey" | "state">): boolean {
  const [area, kind] = query.queryKey;
  return (
    query.state.status === "success" && ((area === "recipes" && kind === "one") || area === "lists")
  );
}

/** Writes the cache to the device's own database, at most once a second, and reads it back at the start. */
export function devicePersister(): Persister {
  let waiting: PersistedClient | null = null;
  let scheduled = false;
  const write = () => {
    scheduled = false;
    const client = waiting;
    waiting = null;
    if (client) {
      // A device with no room, or a private window with no database: the app works without the copy.
      set(STORE_KEY, client).catch(() => {});
    }
  };
  return {
    persistClient: (client) => {
      waiting = client;
      if (!scheduled) {
        scheduled = true;
        setTimeout(write, WRITE_AFTER_MS);
      }
    },
    restoreClient: () => get<PersistedClient>(STORE_KEY).catch(() => undefined),
    removeClient: () => del(STORE_KEY).catch(() => {}),
  };
}
