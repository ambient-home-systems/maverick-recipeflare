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

/** The least time between two writes of the copy. A background copy changes the cache many times. */
const WRITE_AFTER_MS = 1000;

/** True for what is worth keeping between visits: a whole recipe, or one of the household's lists. */
export function isKept(query: Pick<Query, "queryKey" | "state">): boolean {
  const [area, kind] = query.queryKey;
  return (
    query.state.status === "success" && ((area === "recipes" && kind === "one") || area === "lists")
  );
}

/**
 * Writes the cache to the device's own database and reads it back at the
 * start. A change is written at once; changes that follow within a second are
 * written together at its end, and whatever is still waiting is written when
 * the page is hidden or left, so that closing the app loses nothing.
 */
export function devicePersister(): Persister {
  let waiting: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastWrite = 0;
  const write = () => {
    clearTimeout(timer);
    timer = undefined;
    const client = waiting;
    waiting = null;
    if (client) {
      lastWrite = Date.now();
      // A device with no room, or a private window with no database: the app works without the copy.
      set(STORE_KEY, client).catch(() => {});
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", write);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        write();
      }
    });
  }
  return {
    persistClient: (client) => {
      waiting = client;
      const wait = lastWrite + WRITE_AFTER_MS - Date.now();
      if (wait <= 0) {
        write();
      } else if (timer === undefined) {
        timer = setTimeout(write, wait);
      }
    },
    restoreClient: () => get<PersistedClient>(STORE_KEY).catch(() => undefined),
    removeClient: () => del(STORE_KEY).catch(() => {}),
  };
}
