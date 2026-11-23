import { useEffect, useState } from "react";

/**
 * What a cook has ticked off, and the scale they are cooking at. It is kept on
 * the device for one recipe, so it survives a reload, a locked phone and a
 * closed app. It is cleared by "Done", or twelve hours after it was last
 * touched, so that next week's batch starts clean.
 */
export type CookSession = {
  scale: number;
  /** IDs of the steps that are done. */
  steps: string[];
  /** IDs of the ingredients that are out on the counter. */
  ingredients: string[];
  /** When it was last changed, in milliseconds since 1970. */
  touchedAt: number;
};

export const COOK_SESSION_MS = 12 * 60 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const key = (recipeId: string) => `recipeflare:cook:${recipeId}`;

/** The device's storage, or null where the browser refuses it, as some private windows do. */
function deviceStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const ids = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];

/** The saved session for a recipe, or null if there is none, it is too old, or it cannot be read. */
export function loadCookSession(
  store: Store | null,
  recipeId: string,
  now: number,
): CookSession | null {
  if (!store) {
    return null;
  }
  try {
    const raw = store.getItem(key(recipeId));
    if (!raw) {
      return null;
    }
    const saved = JSON.parse(raw) as Partial<CookSession> | null;
    const touchedAt = typeof saved?.touchedAt === "number" ? saved.touchedAt : 0;
    const scale = typeof saved?.scale === "number" && saved.scale > 0 ? saved.scale : 1;
    if (now - touchedAt > COOK_SESSION_MS) {
      store.removeItem(key(recipeId));
      return null;
    }
    return { scale, steps: ids(saved?.steps), ingredients: ids(saved?.ingredients), touchedAt };
  } catch {
    return null;
  }
}

export function saveCookSession(store: Store | null, recipeId: string, session: CookSession): void {
  try {
    store?.setItem(key(recipeId), JSON.stringify(session));
  } catch {
    // A full or refused store only means the ticks will not outlive this page.
  }
}

export function clearCookSession(store: Store | null, recipeId: string): void {
  try {
    store?.removeItem(key(recipeId));
  } catch {
    // Nothing to clear.
  }
}

const toggled = (list: string[], id: string) =>
  list.includes(id) ? list.filter((other) => other !== id) : [...list, id];

/**
 * The cook's session for one recipe: read from the device when cook mode
 * opens, and written back on every change. `startScale` is used only when
 * there is nothing saved, so a scale chosen on the recipe carries over.
 */
export function useCookSession(recipeId: string, startScale = 1) {
  const [session, setSession] = useState<CookSession>(
    () =>
      loadCookSession(deviceStore(), recipeId, Date.now()) ?? {
        scale: startScale,
        steps: [],
        ingredients: [],
        touchedAt: Date.now(),
      },
  );

  useEffect(() => {
    saveCookSession(deviceStore(), recipeId, session);
  }, [recipeId, session]);

  const change = (patch: Partial<CookSession>) =>
    setSession((now) => ({ ...now, ...patch, touchedAt: Date.now() }));

  return {
    session,
    toggleStep: (id: string) => change({ steps: toggled(session.steps, id) }),
    toggleIngredient: (id: string) => change({ ingredients: toggled(session.ingredients, id) }),
    setScale: (scale: number) => change({ scale }),
    /** Forgets the session. Called by "Done". */
    finish: () => clearCookSession(deviceStore(), recipeId),
  };
}

const WAKE_NOTE = "recipeflare:cook:wake-note";

/** Whether the cook has already been told that this browser cannot keep the screen on. */
export function useWakeNote(): [seen: boolean, markSeen: () => void] {
  const [seen, setSeen] = useState(() => {
    try {
      return deviceStore()?.getItem(WAKE_NOTE) === "seen";
    } catch {
      return false;
    }
  });
  return [
    seen,
    () => {
      setSeen(true);
      try {
        deviceStore()?.setItem(WAKE_NOTE, "seen");
      } catch {
        // It will be said again next time, which is harmless.
      }
    },
  ];
}
