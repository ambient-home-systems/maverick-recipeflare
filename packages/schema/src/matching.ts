import type { Food, Organizer, Unit } from "./lists";
import { nameKey } from "./name-key";

/** The household's lists that a draft's names are matched against. */
export type DraftLists = {
  units: readonly Pick<
    Unit,
    "id" | "name" | "pluralName" | "abbreviation" | "pluralAbbreviation" | "aliases"
  >[];
  foods: readonly Pick<Food, "id" | "name" | "pluralName" | "aliases">[];
  organizers: readonly Pick<Organizer, "id" | "kind" | "slug">[];
};

export function indexByName<T extends { id: string }>(
  entries: readonly T[],
  names: (entry: T) => (string | null)[],
  key: (name: string) => string,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of entries) {
    for (const name of names(entry)) {
      if (name && !index.has(key(name))) {
        index.set(key(name), entry.id);
      }
    }
  }
  return index;
}

/** A unit as written, without the full stops of "c." or "lbs." */
function unitText(name: string): string {
  return name.normalize("NFKC").trim().replace(/\.+$/u, "");
}

/**
 * Finds the household's unit for a name as written on a card or a page.
 *
 * Case matters for one-letter names: handwritten recipes use "t" for teaspoon
 * and "T" for tablespoon, and confusing them triples or thirds a quantity. So a
 * one-letter name matches only in its exact case. Longer names ignore case.
 */
export function unitMatcher(units: DraftLists["units"]): (name: string) => string | null {
  const names = (u: DraftLists["units"][number]) => [
    u.name,
    u.pluralName,
    u.abbreviation,
    u.pluralAbbreviation,
    ...u.aliases,
  ];
  const exact = indexByName(units, names, unitText);
  const anyCase = indexByName(units, names, (name) => nameKey(unitText(name)));

  return (name) => {
    const text = unitText(name);
    const exactMatch = exact.get(text);
    if (exactMatch || text.length <= 1) {
      return exactMatch ?? null;
    }
    return anyCase.get(nameKey(text)) ?? null;
  };
}
