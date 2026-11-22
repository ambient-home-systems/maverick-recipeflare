import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const STORAGE_KEY = "recipeflare:theme";
const listeners = new Set<() => void>();

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStored(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Storage can be unavailable, for example in a private window.
    return "system";
  }
}

let choice: ThemeChoice = "system";

export function resolveTheme(value: ThemeChoice): Theme {
  return value === "system" ? systemTheme() : value;
}

/** The tokens switch on `data-theme` on the root element. */
function apply(): void {
  document.documentElement.dataset.theme = resolveTheme(choice);
}

/**
 * Sets the theme. "system" follows the device and is the default: a kitchen is
 * bright by day and dim in the evening.
 */
export function setThemeChoice(next: ThemeChoice): void {
  choice = next;
  try {
    if (next === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  } catch {
    // The choice still applies for this visit.
  }
  apply();
  for (const listener of listeners) {
    listener();
  }
}

/** Call once at startup: applies the stored choice and follows the device when on "system". */
export function startTheme(): void {
  choice = readStored();
  apply();
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (choice === "system") {
      apply();
    }
  });
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => choice,
  );
}
