import type { Food, Label, Member, Organizer, OrganizerKind, Unit } from "../lists";
import { slugify } from "../slug";

/**
 * Fixture data for mock screens and tests. Everything here is invented.
 * IDs are fixed so that screenshots and snapshots do not change between runs.
 */

export const FIXTURE_TIME = "2026-11-01T12:00:00.000Z";

/** A fixed UUIDv7-shaped ID: `group` separates kinds of thing, `n` counts within one. */
export function fixtureId(group: number, n: number): string {
  const tail = group.toString(16).padStart(2, "0") + n.toString(16).padStart(10, "0");
  return `00000000-0000-7000-8000-${tail}`;
}

const GROUP = { member: 1, unit: 2, food: 3, label: 4, organizer: 5 } as const;

export const fixtureMember: Member = {
  id: fixtureId(GROUP.member, 1),
  email: "cook@example.com",
  displayName: "Sam",
  role: "owner",
};

// name, plural, abbreviation, plural abbreviation, use abbreviation, fraction, aliases
type UnitRow = [string, string | null, string | null, string | null, boolean, boolean, string[]];

// Handwritten cards use "t" for teaspoon and "T" for tablespoon, so those two
// aliases differ only by case.
const UNIT_ROWS: UnitRow[] = [
  ["teaspoon", "teaspoons", "tsp", "tsp", true, true, ["t"]],
  ["tablespoon", "tablespoons", "tbsp", "tbsp", true, true, ["T"]],
  ["cup", "cups", "c", "c", false, true, ["C"]],
  ["ounce", "ounces", "oz", "oz", true, true, []],
  ["pound", "pounds", "lb", "lb", true, true, ["lbs"]],
  ["gram", "grams", "g", "g", true, false, []],
  ["milliliter", "milliliters", "ml", "ml", true, false, []],
  ["pinch", "pinches", null, null, false, true, []],
  ["clove", "cloves", null, null, false, true, []],
  ["can", "cans", null, null, false, true, []],
  ["stick", "sticks", null, null, false, true, []],
  ["sprig", "sprigs", null, null, false, true, []],
];

export const fixtureUnits: Unit[] = UNIT_ROWS.map(
  (
    [name, pluralName, abbreviation, pluralAbbreviation, useAbbreviation, fraction, aliases],
    index,
  ) => ({
    id: fixtureId(GROUP.unit, index + 1),
    name,
    pluralName,
    abbreviation,
    pluralAbbreviation,
    useAbbreviation,
    fraction,
    description: "",
    aliases,
    standardQuantity: null,
    standardUnit: null,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  }),
);

export const fixtureLabels: Label[] = ["Produce", "Dairy", "Pantry", "Meat"].map((name, index) => ({
  id: fixtureId(GROUP.label, index + 1),
  name,
  color: null,
  sortOrder: index,
  createdAt: FIXTURE_TIME,
  updatedAt: FIXTURE_TIME,
}));

// name, plural, label, aliases
const FOOD_ROWS: [string, string | null, string, string[]?][] = [
  ["all-purpose flour", null, "Pantry", ["flour", "all purpose flour"]],
  ["sugar", null, "Pantry"],
  ["brown sugar", null, "Pantry", ["b. sugar"]],
  ["baking powder", null, "Pantry"],
  ["baking soda", null, "Pantry", ["soda"]],
  ["salt", null, "Pantry"],
  ["black pepper", null, "Pantry"],
  ["buttermilk", null, "Dairy"],
  ["butter", null, "Dairy"],
  ["egg", "eggs", "Dairy"],
  ["vanilla extract", null, "Pantry", ["vanilla"]],
  ["ground cardamom", null, "Pantry"],
  ["whole chicken", "whole chickens", "Meat"],
  ["lemon", "lemons", "Produce"],
  ["garlic", null, "Produce"],
  ["thyme", null, "Produce"],
  ["olive oil", null, "Pantry"],
  ["chicken stock", null, "Pantry"],
  ["ground beef", null, "Meat"],
  ["yellow onion", "yellow onions", "Produce"],
  ["red bell pepper", "red bell peppers", "Produce"],
  ["jalapeño", "jalapeños", "Produce"],
  ["chili powder", null, "Pantry"],
  ["ground cumin", null, "Pantry"],
  ["smoked paprika", null, "Pantry"],
  ["dried oregano", null, "Pantry", ["oregano"]],
  ["tomato paste", null, "Pantry"],
  ["crushed tomatoes", null, "Pantry"],
  ["kidney beans", null, "Pantry"],
  ["black beans", null, "Pantry"],
  ["beef stock", null, "Pantry"],
  ["cocoa powder", null, "Pantry"],
  ["cider vinegar", null, "Pantry"],
  ["sour cream", null, "Dairy"],
  ["cheddar cheese", null, "Dairy"],
  ["scallion", "scallions", "Produce", ["green onion"]],
  ["cilantro", null, "Produce"],
  ["lime", "limes", "Produce"],
  ["bay leaf", "bay leaves", "Pantry"],
  ["carrot", "carrots", "Produce"],
  ["celery", null, "Produce"],
  ["red lentils", null, "Pantry"],
  ["milk", null, "Dairy"],
  ["ground chuck", null, "Meat"],
  ["onion", "onions", "Produce"],
  ["spaghetti sauce", null, "Pantry"],
  ["cooked rice", null, "Pantry"],
  ["green bell pepper", "green bell peppers", "Produce", ["green pepper"]],
  ["chocolate chips", null, "Pantry"],
  ["nuts", null, "Pantry"],
];

export const fixtureFoods: Food[] = FOOD_ROWS.map(([name, pluralName, label, aliases], index) => ({
  id: fixtureId(GROUP.food, index + 1),
  name,
  pluralName,
  description: "",
  aliases: aliases ?? [],
  labelId: fixtureLabels.find((l) => l.name === label)?.id ?? null,
  createdAt: FIXTURE_TIME,
  updatedAt: FIXTURE_TIME,
}));

const ORGANIZER_ROWS: [OrganizerKind, string][] = [
  ["category", "Breakfast"],
  ["category", "Dinner"],
  ["category", "Dessert"],
  ["category", "Soup"],
  ["tag", "Weeknight"],
  ["tag", "Family favorite"],
  ["tag", "Freezes well"],
  ["tag", "Holiday"],
  ["tag", "Vegetarian"],
  ["tool", "Roasting pan"],
  ["tool", "Dutch oven"],
  ["tool", "Stand mixer"],
  ["tool", "Griddle"],
];

export const fixtureOrganizers: Organizer[] = ORGANIZER_ROWS.map(([kind, name], index) => ({
  id: fixtureId(GROUP.organizer, index + 1),
  kind,
  name,
  slug: slugify(name),
  createdAt: FIXTURE_TIME,
  updatedAt: FIXTURE_TIME,
}));
