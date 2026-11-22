import { describe, expect, it } from "vitest";
import {
  COOK_SESSION_MS,
  type CookSession,
  clearCookSession,
  loadCookSession,
  saveCookSession,
} from "./cookSession";

function memoryStore() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const NOW = 1_800_000_000_000;
const session = (touchedAt = NOW): CookSession => ({
  scale: 2,
  steps: ["s1", "s2"],
  ingredients: ["i1"],
  touchedAt,
});

describe("a cook's session on the device", () => {
  it("comes back as it was saved", () => {
    const store = memoryStore();
    saveCookSession(store, "recipe-1", session());
    expect(loadCookSession(store, "recipe-1", NOW + 60_000)).toEqual(session());
  });

  it("is kept apart for each recipe", () => {
    const store = memoryStore();
    saveCookSession(store, "recipe-1", session());
    expect(loadCookSession(store, "recipe-2", NOW)).toBeNull();
  });

  it("lasts twelve hours from when it was last touched, and is then thrown away", () => {
    const store = memoryStore();
    saveCookSession(store, "recipe-1", session());
    expect(loadCookSession(store, "recipe-1", NOW + COOK_SESSION_MS)).not.toBeNull();
    expect(loadCookSession(store, "recipe-1", NOW + COOK_SESSION_MS + 1)).toBeNull();
    expect(store.items.size).toBe(0);
  });

  it("is forgotten when cleared", () => {
    const store = memoryStore();
    saveCookSession(store, "recipe-1", session());
    clearCookSession(store, "recipe-1");
    expect(loadCookSession(store, "recipe-1", NOW)).toBeNull();
  });

  it("ignores what it cannot read, and mends what is half there", () => {
    const store = memoryStore();
    store.setItem("recipeflare:cook:recipe-1", "not json");
    expect(loadCookSession(store, "recipe-1", NOW)).toBeNull();

    store.setItem(
      "recipeflare:cook:recipe-1",
      JSON.stringify({ scale: -3, steps: ["s1", 7], touchedAt: NOW }),
    );
    expect(loadCookSession(store, "recipe-1", NOW)).toEqual({
      scale: 1,
      steps: ["s1"],
      ingredients: [],
      touchedAt: NOW,
    });
  });

  it("works without storage, as in a private window that refuses it", () => {
    expect(loadCookSession(null, "recipe-1", NOW)).toBeNull();
    expect(() => saveCookSession(null, "recipe-1", session())).not.toThrow();
    const full = {
      ...memoryStore(),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => saveCookSession(full, "recipe-1", session())).not.toThrow();
  });
});
