import {
  type Asset,
  type Food,
  formatQuantity,
  type Nutrition,
  newId,
  type Organizer,
  type Recipe,
  type RecipeFormValue,
  RecipeInput,
  type Unit,
} from "@recipeflare/schema";

/**
 * What the recipe editor holds while a recipe is being typed.
 *
 * It differs from the saved shape in three ways, each for the cook's sake:
 * numbers are kept as the text that was typed, so a half-typed "1 1/" is not
 * thrown away; ingredients and steps are flat lists in which a section is a
 * divider row, so a row can be dragged anywhere; and a food the household does
 * not have yet is kept by name until the cook confirms it at save.
 */

/** What the parser made of one typed line. */
export type ParsedLine = {
  quantity: number | null;
  unitId: string | null;
  foodId: string | null;
  /** A food name the household does not have yet. Created only when the cook confirms at save. */
  newFood: string | null;
  note: string;
};

/** Reads a typed line. Null means it could not be read, and the line stays as written. */
export type LineParser = (text: string) => ParsedLine | null;

export type DividerRow = { kind: "divider"; id: string; title: string };
export type LineRow = { kind: "line"; id: string; text: string } & ParsedLine;
export type StepRow = {
  kind: "step";
  id: string;
  text: string;
  durationSeconds: number | null;
  ingredientIds: string[];
};
export type IngredientListRow = LineRow | DividerRow;
export type StepListRow = StepRow | DividerRow;
export type NoteRow = { id: string; title: string; text: string };
export type Duration = { hours: string; minutes: string };

export const NUTRITION_FIELDS: [keyof Nutrition, string][] = [
  ["calories", "Calories"],
  ["fatContent", "Fat"],
  ["saturatedFatContent", "Saturated fat"],
  ["unsaturatedFatContent", "Unsaturated fat"],
  ["transFatContent", "Trans fat"],
  ["cholesterolContent", "Cholesterol"],
  ["sodiumContent", "Sodium"],
  ["carbohydrateContent", "Carbohydrate"],
  ["fiberContent", "Fiber"],
  ["sugarContent", "Sugar"],
  ["proteinContent", "Protein"],
];

export type EditorValue = {
  title: string;
  description: string;
  sourceName: string;
  sourceUrl: string;
  servings: string;
  yieldQuantity: string;
  yieldUnit: string;
  prep: Duration;
  cook: Duration;
  total: Duration;
  nutrition: Record<keyof Nutrition, string>;
  ingredients: IngredientListRow[];
  steps: StepListRow[];
  notes: NoteRow[];
  categoryIds: string[];
  tagIds: string[];
  toolIds: string[];
  assets: Asset[];
};

export type EditorLists = {
  units: Unit[];
  foods: Food[];
  organizers: Organizer[];
};

const NO_PARSE: ParsedLine = {
  quantity: null,
  unitId: null,
  foodId: null,
  newFood: null,
  note: "",
};

/** True when a line has no parsed fields and is kept exactly as written. */
export function isAsWritten(line: ParsedLine): boolean {
  return (
    line.quantity === null && line.unitId === null && line.foodId === null && line.newFood === null
  );
}

// --- Numbers as text ---

const GLYPHS: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};
const GLYPH_CLASS = "[½⅓⅔¼¾⅛⅜⅝⅞]";

/**
 * Reads an amount from the start of some text: "2", "0.5", "1/2", "1 1/2",
 * "1½" or "½". Returns the number and what follows it, or null when the text
 * does not start with an amount.
 */
export function readQuantity(text: string): { quantity: number; rest: string } | null {
  const source = text.trimStart();
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/.exec(source);
  const fraction = /^(\d+)\s*\/\s*(\d+)/.exec(source);
  const withGlyph = new RegExp(`^(\\d+)?\\s*(${GLYPH_CLASS})`).exec(source);
  const plain = /^\d+(?:\.\d+)?/.exec(source);

  let quantity: number;
  let length: number;
  if (mixed && Number(mixed[3]) !== 0) {
    quantity = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    length = mixed[0].length;
  } else if (fraction && Number(fraction[2]) !== 0) {
    quantity = Number(fraction[1]) / Number(fraction[2]);
    length = fraction[0].length;
  } else if (withGlyph) {
    quantity = Number(withGlyph[1] ?? 0) + (GLYPHS[withGlyph[2] as string] ?? 0);
    length = withGlyph[0].length;
  } else if (plain) {
    quantity = Number(plain[0]);
    length = plain[0].length;
  } else {
    return null;
  }
  return quantity > 0 ? { quantity, rest: source.slice(length) } : null;
}

/** An amount field's text as a number. Null for an empty field; NaN for text that is not an amount. */
function amount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  const read = readQuantity(trimmed);
  return read && read.rest.trim() === "" ? read.quantity : Number.NaN;
}

const quantityText = (value: number | null) => (value === null ? "" : formatQuantity(value));

function toDuration(seconds: number | null): Duration {
  if (seconds === null) {
    return { hours: "", minutes: "" };
  }
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return { hours: hours > 0 ? String(hours) : "", minutes: String(minutes % 60) };
}

/** A duration's seconds. Null when both boxes are empty; NaN when either is not a whole number. */
function durationSeconds({ hours, minutes }: Duration): number | null {
  if (hours.trim() === "" && minutes.trim() === "") {
    return null;
  }
  const whole = (text: string) =>
    text.trim() === "" ? 0 : /^\d+$/.test(text.trim()) ? Number(text) : Number.NaN;
  const h = whole(hours);
  const m = whole(minutes);
  return Number.isNaN(h) || Number.isNaN(m) || m > 59 ? Number.NaN : h * 3600 + m * 60;
}

// --- Into the editor ---

const emptyNutrition = () =>
  Object.fromEntries(NUTRITION_FIELDS.map(([key]) => [key, ""])) as Record<keyof Nutrition, string>;

export function emptyEditorValue(): EditorValue {
  return {
    title: "",
    description: "",
    sourceName: "",
    sourceUrl: "",
    servings: "",
    yieldQuantity: "",
    yieldUnit: "",
    prep: toDuration(null),
    cook: toDuration(null),
    total: toDuration(null),
    nutrition: emptyNutrition(),
    ingredients: [],
    steps: [],
    notes: [],
    categoryIds: [],
    tagIds: [],
    toolIds: [],
    assets: [],
  };
}

/** The editor's value for a recipe as the API accepts it: a saved recipe, or an import's draft. */
export function fromInput(input: RecipeFormValue, assets: Asset[] = []): EditorValue {
  const ingredients: IngredientListRow[] = [];
  for (const section of input.ingredientSections ?? []) {
    if (section.title) {
      ingredients.push({ kind: "divider", id: newId(), title: section.title });
    }
    for (const item of section.items) {
      ingredients.push({
        kind: "line",
        id: item.id,
        text: item.originalText ?? "",
        quantity: item.quantity ?? null,
        unitId: item.unitId ?? null,
        foodId: item.foodId ?? null,
        newFood: null,
        note: item.note ?? "",
      });
    }
  }
  const steps: StepListRow[] = [];
  for (const section of input.stepSections ?? []) {
    if (section.title) {
      steps.push({ kind: "divider", id: newId(), title: section.title });
    }
    for (const step of section.steps) {
      steps.push({
        kind: "step",
        id: step.id,
        text: step.text,
        durationSeconds: step.durationSeconds ?? null,
        ingredientIds: step.ingredientIds ?? [],
      });
    }
  }
  const nutrition = emptyNutrition();
  for (const [key] of NUTRITION_FIELDS) {
    nutrition[key] = input.nutrition?.[key] ?? "";
  }
  return {
    title: input.title,
    description: input.description ?? "",
    sourceName: input.sourceName ?? "",
    sourceUrl: input.sourceUrl ?? "",
    servings: quantityText(input.servings ?? null),
    yieldQuantity: quantityText(input.yieldQuantity ?? null),
    yieldUnit: input.yieldUnit ?? "",
    prep: toDuration(input.prepTimeSeconds ?? null),
    cook: toDuration(input.cookTimeSeconds ?? null),
    total: toDuration(input.totalTimeSeconds ?? null),
    nutrition,
    ingredients,
    steps,
    notes: (input.notes ?? []).map((note) => ({
      id: note.id,
      title: note.title ?? "",
      text: note.text,
    })),
    categoryIds: [...(input.categoryIds ?? [])],
    tagIds: [...(input.tagIds ?? [])],
    toolIds: [...(input.toolIds ?? [])],
    assets: [...assets].sort((a, b) => a.position - b.position),
  };
}

/** The editor's value for a saved recipe. */
export function fromRecipe(recipe: Recipe): EditorValue {
  return fromInput(
    {
      ...recipe,
      ingredientSections: recipe.ingredientSections.map((section) => ({
        title: section.title,
        items: section.items.map((item) => ({
          id: item.id,
          originalText: item.originalText,
          quantity: item.quantity,
          unitId: item.unit?.id ?? null,
          foodId: item.food?.id ?? null,
          note: item.note,
        })),
      })),
      categoryIds: recipe.categories.map((organizer) => organizer.id),
      tagIds: recipe.tags.map((organizer) => organizer.id),
      toolIds: recipe.tools.map((organizer) => organizer.id),
    },
    recipe.assets,
  );
}

// --- Rows ---

export function newLine(text: string, parse: LineParser): LineRow {
  return { kind: "line", id: newId(), text: text.trim(), ...(parse(text.trim()) ?? NO_PARSE) };
}

export function newStep(text: string): StepRow {
  return { kind: "step", id: newId(), text: text.trim(), durationSeconds: null, ingredientIds: [] };
}

export function newDivider(title = ""): DividerRow {
  return { kind: "divider", id: newId(), title };
}

/** Pasted or typed text as separate entries: one for each line that is not blank. */
export function splitEntries(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

/** The list with the row at `from` moved to sit at `to`. */
export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) {
    return [...rows];
  }
  const next = [...rows];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row as T);
  return next;
}

export type SummaryPart = { text: string; isNew?: boolean };

/** What the app read in a line, as short parts to show under it: amount, unit, food, note. */
export function lineSummary(line: LineRow, lists: EditorLists): SummaryPart[] {
  const parts: SummaryPart[] = [];
  if (line.quantity !== null) {
    parts.push({ text: formatQuantity(line.quantity) });
  }
  const unit = lists.units.find((u) => u.id === line.unitId);
  if (unit) {
    parts.push({ text: unit.name });
  }
  const food = lists.foods.find((f) => f.id === line.foodId);
  if (food) {
    parts.push({ text: food.name });
  } else if (line.newFood) {
    parts.push({ text: line.newFood, isNew: true });
  }
  if (line.note) {
    parts.push({ text: line.note });
  }
  return parts;
}

// --- Out of the editor ---

/** Problems by field. A row's problem is keyed `row:<id>`; a nutrition value's, `nutrition.<key>`. */
export type FieldErrors = Record<string, string>;

export type Checked = {
  errors: FieldErrors;
  /** The recipe as the API accepts it. Present only when there are no errors. */
  input?: RecipeInput;
  /** Food names to create, once the cook has confirmed them. */
  newFoods: string[];
};

const NUMBER = "Use a number above zero, such as 6 or 1 1/2.";
const TIME = "Use whole numbers, with minutes below 60.";

/** A friendlier sentence than the schema's own, for the fields a cook is likely to trip on. */
function messageFor(key: string, fallback: string): string {
  switch (key) {
    case "title":
      return fallback.includes("200")
        ? "A title can be up to 200 characters."
        : "A recipe needs a title.";
    case "sourceUrl":
      return "This does not look like a web address. It should start with https://";
    default:
      return fallback;
  }
}

/**
 * Turns the editor's value into the saved shape and checks it with the shared
 * schema. Every problem is tied to the field or the row it belongs to.
 */
export function checkEditorValue(value: EditorValue): Checked {
  const errors: FieldErrors = {};
  const flag = (key: string, message: string) => {
    errors[key] ??= message;
  };

  const servings = amount(value.servings);
  const yieldQuantity = amount(value.yieldQuantity);
  if (Number.isNaN(servings)) {
    flag("servings", NUMBER);
  }
  if (Number.isNaN(yieldQuantity)) {
    flag("yield", NUMBER);
  }
  if (yieldQuantity === null && value.yieldUnit.trim() !== "") {
    flag("yield", "Say how many, such as 24, before what they are.");
  }
  const times = {
    prep: durationSeconds(value.prep),
    cook: durationSeconds(value.cook),
    total: durationSeconds(value.total),
  };
  for (const key of ["prep", "cook", "total"] as const) {
    if (Number.isNaN(times[key])) {
      flag(key, TIME);
    }
  }

  // Sections: a divider opens one, and its rows are those up to the next divider.
  // A divider with nothing under it is dropped; one with no title is a problem.
  type Section<T> = { title: string | null; dividerId: string | null; rows: T[] };
  const group = <T extends { kind: string; id: string }>(
    rows: (T | DividerRow)[],
  ): Section<T>[] => {
    const sections: Section<T>[] = [];
    for (const row of rows) {
      if (row.kind === "divider") {
        const divider = row as DividerRow;
        if (divider.title.trim() === "") {
          flag(`row:${divider.id}`, "Give this section a title, or remove it.");
        }
        sections.push({ title: divider.title.trim() || null, dividerId: divider.id, rows: [] });
      } else {
        if (sections.length === 0) {
          sections.push({ title: null, dividerId: null, rows: [] });
        }
        sections[sections.length - 1]?.rows.push(row as T);
      }
    }
    return sections.filter((section) => section.rows.length > 0);
  };
  const ingredientSections = group<LineRow>(value.ingredients);
  const stepSections = group<StepRow>(value.steps);

  // Only the values that were filled in are kept, as the saved recipe keeps them.
  const nutrition = Object.fromEntries(
    NUTRITION_FIELDS.flatMap(([key]) => {
      const text = value.nutrition[key].trim();
      return text ? [[key, text]] : [];
    }),
  ) as Nutrition;
  const hasNutrition = Object.keys(nutrition).length > 0;

  const candidate: RecipeFormValue = {
    title: value.title,
    description: value.description,
    servings: Number.isNaN(servings) ? null : servings,
    yieldQuantity: Number.isNaN(yieldQuantity) ? null : yieldQuantity,
    yieldUnit: value.yieldUnit.trim() || null,
    prepTimeSeconds: Number.isNaN(times.prep) ? null : times.prep,
    cookTimeSeconds: Number.isNaN(times.cook) ? null : times.cook,
    totalTimeSeconds: Number.isNaN(times.total) ? null : times.total,
    nutrition: hasNutrition ? nutrition : null,
    sourceName: value.sourceName.trim() || null,
    sourceUrl: value.sourceUrl.trim() || null,
    ingredientSections: ingredientSections.map((section) => ({
      title: section.title,
      items: section.rows.map((line) => ({
        id: line.id,
        originalText: line.text.trim() || null,
        quantity: line.quantity,
        unitId: line.unitId,
        foodId: line.foodId,
        note: line.note,
      })),
    })),
    stepSections: stepSections.map((section) => ({
      title: section.title,
      steps: section.rows.map((step) => ({
        id: step.id,
        text: step.text,
        durationSeconds: step.durationSeconds,
        ingredientIds: step.ingredientIds,
      })),
    })),
    notes: value.notes.filter((note) => note.title.trim() !== "" || note.text.trim() !== ""),
    categoryIds: value.categoryIds,
    tagIds: value.tagIds,
    toolIds: value.toolIds,
  };

  const result = RecipeInput.safeParse(candidate);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const [head, index, part, rowIndex] = issue.path;
      if (head === "ingredientSections" || head === "stepSections") {
        const sections = head === "ingredientSections" ? ingredientSections : stepSections;
        const section = typeof index === "number" ? sections[index] : undefined;
        const row = typeof rowIndex === "number" ? section?.rows[rowIndex] : undefined;
        if (row) {
          flag(`row:${row.id}`, issue.message);
        } else if (part === "title" && section?.dividerId) {
          flag(`row:${section.dividerId}`, "Two sections in a row need different titles.");
        } else {
          flag(head === "ingredientSections" ? "ingredients" : "steps", issue.message);
        }
      } else if (head === "notes" && typeof index === "number") {
        const note = candidate.notes?.[index];
        flag(note ? `row:${note.id}` : "notes", "A note needs some text.");
      } else if (head === "nutrition" && typeof index === "string") {
        flag(`nutrition.${index}`, "Keep this to 60 characters, such as 12 g.");
      } else if (head === "categoryIds" || head === "tagIds" || head === "toolIds") {
        flag("organizers", issue.message);
      } else if (head === "yieldUnit" || head === "yieldQuantity") {
        flag("yield", issue.message);
      } else if (typeof head === "string") {
        flag(head, messageFor(head, issue.message));
      } else {
        flag("form", issue.message);
      }
    }
  }

  const newFoods = [
    ...new Set(
      value.ingredients.flatMap((row) =>
        row.kind === "line" && !row.foodId && row.newFood ? [row.newFood] : [],
      ),
    ),
  ];
  const ok = Object.keys(errors).length === 0 && result.success;
  return { errors, input: ok ? result.data : undefined, newFoods };
}

/** True when the editor holds something different from what it started with. */
export function isDirty(value: EditorValue, initial: EditorValue): boolean {
  return JSON.stringify(value) !== JSON.stringify(initial);
}
