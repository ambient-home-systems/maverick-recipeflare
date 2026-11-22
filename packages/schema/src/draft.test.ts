import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import {
  checkDraft,
  type DraftLists,
  draftToInput,
  RecipeDraft,
  recipeDraftJsonSchema,
  unitMatcher,
} from "./draft";
import { fixtureFoods, fixtureId, fixtureOrganizers, fixtureUnits } from "./fixtures";
import { ImportJob, UrlImportRequest } from "./import-job";
import { RecipeCreate } from "./recipe";

const lists: DraftLists = {
  units: fixtureUnits,
  foods: fixtureFoods,
  organizers: fixtureOrganizers,
};

/** IDs that count up, so results are the same on every run. */
function countingIds() {
  let n = 0;
  return () => fixtureId(0xdd, ++n);
}

/** What a good importer returns for a full recipe. */
const fullDraft = {
  title: "Garlic Butter Noodles",
  description: "Ten minutes, one pot.",
  servings: 2,
  totalTimeSeconds: 600,
  sourceName: "Example Kitchen",
  sourceUrl: "https://example.com/recipes/garlic-butter-noodles",
  imageUrl: "https://example.com/images/noodles.jpg",
  nutrition: { calories: "520", proteinContent: "14 g" },
  ingredientSections: [
    {
      title: null,
      items: [
        { originalText: "8 oz spaghetti" },
        {
          originalText: "3 tbsp butter",
          quantity: 3,
          unitName: "Tbsp",
          foodName: "Butter",
        },
        {
          originalText: "4 green onions, sliced",
          quantity: 4,
          foodName: "green onion",
          note: "sliced",
        },
        {
          originalText: "1 knob ginger",
          quantity: 1,
          unitName: "knob",
          foodName: "ginger",
        },
      ],
    },
  ],
  stepSections: [
    {
      title: null,
      steps: [
        { text: "Boil the spaghetti.", durationSeconds: 480, ingredientIndexes: [0] },
        { text: "Toss with the butter and green onions.", ingredientIndexes: [1, 2] },
      ],
    },
  ],
  notes: [{ text: "Good with a fried egg." }],
  suggestedCategories: ["Dinner"],
  suggestedTags: ["weeknight", "Noodles"],
  suggestedTools: [],
};

describe("RecipeDraft", () => {
  it("accepts an empty object, so a thin source still parses", () => {
    const draft = RecipeDraft.parse({});
    expect(draft.title).toBe("");
    expect(draft.ingredientSections).toEqual([]);
    expect(draft.stepSections).toEqual([]);
    expect(draft.servings).toBeNull();
  });

  it("accepts a full draft and fills the defaults", () => {
    const draft = RecipeDraft.parse(fullDraft);
    expect(draft.ingredientSections[0]?.items[0]).toEqual({
      originalText: "8 oz spaghetti",
      quantity: null,
      unitName: null,
      foodName: null,
      note: "",
    });
    expect(draft.stepSections[0]?.steps[1]?.durationSeconds).toBeNull();
  });

  it("rejects wrong types", () => {
    expect(RecipeDraft.safeParse({ title: 12 }).success).toBe(false);
    expect(RecipeDraft.safeParse({ servings: "four" }).success).toBe(false);
    expect(
      RecipeDraft.safeParse({ ingredientSections: [{ items: [{ quantity: 2 }] }] }).success,
    ).toBe(false);
  });
});

describe("recipeDraftJsonSchema", () => {
  const schema = recipeDraftJsonSchema();
  const validate = new Ajv2020({ strict: true }).compile(schema);

  it("has not changed without review", () => {
    expect(schema).toMatchSnapshot();
  });

  it("describes every field of the draft", () => {
    const properties = schema.properties as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual(Object.keys(RecipeDraft.shape).sort());
  });

  it("uses only plain JSON Schema types, with nothing left unconstrained", () => {
    const allowed = new Set(["object", "array", "string", "number", "integer", "null"]);
    const visit = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((child, index) => {
          visit(child, `${path}[${index}]`);
        });
        return;
      }
      if (node === null || typeof node !== "object") {
        return;
      }
      const record = node as Record<string, unknown>;
      const isSchema = "type" in record || "anyOf" in record || "properties" in record;
      if (isSchema && !("anyOf" in record)) {
        // A nullable field is written as a list of types, such as ["number", "null"].
        const types = Array.isArray(record.type) ? record.type : [record.type];
        for (const type of types) {
          expect(allowed.has(type as string), `${path} has type ${type}`).toBe(true);
        }
      }
      for (const [key, child] of Object.entries(record)) {
        if (key === "properties") {
          for (const [name, property] of Object.entries(child as Record<string, unknown>)) {
            expect(Object.keys(property as object).length, `${path}.${name} is empty`).not.toBe(0);
            visit(property, `${path}.${name}`);
          }
        } else if (key === "items" || key === "anyOf") {
          visit(child, `${path}.${key}`);
        }
      }
    };
    visit(schema, "draft");
  });

  it.each([
    ["an empty draft", {}],
    ["a full draft", fullDraft],
    ["a draft with nulls", { title: "x", servings: null, nutrition: null, yieldUnit: null }],
  ])("agrees with Zod that %s is valid", (_name, value) => {
    expect(RecipeDraft.safeParse(value).success).toBe(true);
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each([
    ["a number for the title", { title: 12 }],
    ["text for servings", { servings: "four" }],
    ["a fractional duration", { cookTimeSeconds: 1.5 }],
    ["an ingredient without its text", { ingredientSections: [{ items: [{ quantity: 2 }] }] }],
    ["a step without text", { stepSections: [{ steps: [{ durationSeconds: 60 }] }] }],
    [
      "text for a step's ingredient indexes",
      { stepSections: [{ steps: [{ text: "x", ingredientIndexes: ["0"] }] }] },
    ],
    ["a tag that is not text", { suggestedTags: [1] }],
  ])("agrees with Zod that %s is invalid", (_name, value) => {
    expect(RecipeDraft.safeParse(value).success).toBe(false);
    expect(validate(value)).toBe(false);
  });
});

describe("checkDraft", () => {
  const codes = (value: unknown) => checkDraft(RecipeDraft.parse(value)).map((issue) => issue.code);

  it("finds nothing wrong with a full draft", () => {
    expect(codes(fullDraft)).toEqual([]);
  });

  it("flags a missing title, ingredients and steps without filling them in", () => {
    expect(codes({})).toEqual(["missing_title", "missing_ingredients", "missing_steps"]);
    expect(codes({ title: "   " })).toContain("missing_title");
  });

  it("treats sections with nothing in them as missing", () => {
    expect(codes({ title: "x", ingredientSections: [{ title: "Sauce" }] })).toContain(
      "missing_ingredients",
    );
  });

  it("flags more lines or steps than a recipe can hold", () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ originalText: `line ${i}` }));
    const steps = Array.from({ length: 101 }, (_, i) => ({ text: `step ${i}` }));
    expect(
      codes({ title: "x", ingredientSections: [{ items }], stepSections: [{ steps }] }),
    ).toEqual(["too_many_ingredients", "too_many_steps"]);
  });

  it("flags a step that points at an ingredient that is not there", () => {
    const issues = checkDraft(
      RecipeDraft.parse({
        title: "x",
        ingredientSections: [{ items: [{ originalText: "salt" }] }],
        stepSections: [{ steps: [{ text: "Season.", ingredientIndexes: [0, 1] }] }],
      }),
    );
    expect(issues).toEqual([
      {
        code: "bad_ingredient_reference",
        path: ["stepSections", 0, "steps", 0, "ingredientIndexes"],
        message: "A step refers to an ingredient that is not in the recipe",
      },
    ]);
  });
});

describe("draftToInput", () => {
  const convert = (value: unknown) => draftToInput(RecipeDraft.parse(value), lists, countingIds());

  it("produces a recipe that can be saved as it is", () => {
    const { input } = convert(fullDraft);
    const parsed = RecipeCreate.safeParse(input);
    expect(parsed.error?.issues).toBeUndefined();
    expect(parsed.data?.title).toBe("Garlic Butter Noodles");
    expect(parsed.data?.sourceName).toBe("Example Kitchen");
  });

  it("matches units and foods by name, plural, abbreviation and alias, ignoring case", () => {
    const { input } = convert(fullDraft);
    const [, butter, scallions] = input.ingredientSections?.[0]?.items ?? [];

    expect(butter?.unitId).toBe(fixtureUnits.find((u) => u.name === "tablespoon")?.id);
    expect(butter?.foodId).toBe(fixtureFoods.find((f) => f.name === "butter")?.id);
    // "green onion" is an alias of scallion in the fixtures.
    expect(scallions?.foodId).toBe(fixtureFoods.find((f) => f.name === "scallion")?.id);
    expect(scallions?.note).toBe("sliced");
  });

  it("reports names it cannot match, keeps the original text and creates nothing", () => {
    const { input, issues } = convert(fullDraft);
    const ginger = input.ingredientSections?.[0]?.items[3];

    expect(ginger).toMatchObject({
      originalText: "1 knob ginger",
      quantity: 1,
      unitId: null,
      foodId: null,
    });
    expect(issues).toEqual([
      {
        code: "unmatched_unit",
        path: ["ingredientSections", 0, "items", 3, "unitName"],
        message: '"knob" is not one of your units',
      },
      {
        code: "unmatched_food",
        path: ["ingredientSections", 0, "items", 3, "foodName"],
        message: '"ginger" is not one of your foods',
      },
    ]);
  });

  it("leaves a line that was not parsed as free text", () => {
    const { input } = convert(fullDraft);
    expect(input.ingredientSections?.[0]?.items[0]).toMatchObject({
      originalText: "8 oz spaghetti",
      quantity: null,
      unitId: null,
      foodId: null,
    });
  });

  it("turns a step's ingredient positions into IDs", () => {
    const { input } = convert(fullDraft);
    const ids = input.ingredientSections?.[0]?.items.map((item) => item.id) ?? [];
    const steps = input.stepSections?.[0]?.steps ?? [];

    expect(steps[0]?.ingredientIds).toEqual([ids[0]]);
    expect(steps[1]?.ingredientIds).toEqual([ids[1], ids[2]]);
    expect(steps[0]?.durationSeconds).toBe(480);
  });

  it("selects organizers the household has and only suggests the rest", () => {
    const { input, suggestions } = convert(fullDraft);

    expect(input.categoryIds).toEqual([fixtureOrganizers.find((o) => o.name === "Dinner")?.id]);
    expect(input.tagIds).toEqual([fixtureOrganizers.find((o) => o.name === "Weeknight")?.id]);
    expect(suggestions).toEqual({ category: [], tag: ["Noodles"], tool: [] });
  });

  it("does not match a tag name against a category", () => {
    const { input, suggestions } = convert({ title: "x", suggestedTags: ["Dinner"] });
    expect(input.tagIds).toEqual([]);
    expect(suggestions.tag).toEqual(["Dinner"]);
  });

  it("drops empty sections and blank notes, and cleans up spacing", () => {
    const { input } = convert({
      title: "  Soup  ",
      ingredientSections: [
        { title: "Empty" },
        { title: "  Broth ", items: [{ originalText: "  water  " }] },
      ],
      notes: [{ text: "   " }, { title: " Tip ", text: " Salt late. " }],
    });

    expect(input.title).toBe("Soup");
    expect(input.ingredientSections).toEqual([
      {
        title: "Broth",
        items: [
          {
            id: fixtureId(0xdd, 1),
            originalText: "water",
            quantity: null,
            unitId: null,
            foodId: null,
            note: "",
          },
        ],
      },
    ]);
    expect(input.notes).toEqual([{ id: fixtureId(0xdd, 2), title: "Tip", text: "Salt late." }]);
  });

  it("ignores quantities and servings that are not above zero", () => {
    const { input } = convert({
      title: "x",
      servings: 0,
      ingredientSections: [{ items: [{ originalText: "salt", quantity: 0 }] }],
    });
    expect(input.servings).toBeNull();
    expect(input.ingredientSections?.[0]?.items[0]?.quantity).toBeNull();
  });

  it("passes through what checkDraft found", () => {
    expect(convert({}).issues.map((issue) => issue.code)).toEqual([
      "missing_title",
      "missing_ingredients",
      "missing_steps",
    ]);
  });
});

describe("unitMatcher", () => {
  const match = unitMatcher(fixtureUnits);
  const unitId = (name: string) => fixtureUnits.find((u) => u.name === name)?.id ?? null;

  it("tells a one-letter teaspoon from a one-letter tablespoon by case", () => {
    expect(match("t")).toBe(unitId("teaspoon"));
    expect(match("T")).toBe(unitId("tablespoon"));
  });

  it("ignores the full stops of handwritten abbreviations", () => {
    expect(match("t.")).toBe(unitId("teaspoon"));
    expect(match("T.")).toBe(unitId("tablespoon"));
    expect(match("C.")).toBe(unitId("cup"));
    expect(match("c.")).toBe(unitId("cup"));
    expect(match("lbs.")).toBe(unitId("pound"));
  });

  it("ignores case for longer names", () => {
    expect(match("TBSP")).toBe(unitId("tablespoon"));
    expect(match("Tsp.")).toBe(unitId("teaspoon"));
    expect(match("Cups")).toBe(unitId("cup"));
    expect(match(" Ounces ")).toBe(unitId("ounce"));
  });

  it("does not guess a one-letter name in the wrong case", () => {
    // "G" is not an alias of gram here, and guessing could be badly wrong.
    expect(match("G")).toBeNull();
    expect(match("g")).toBe(unitId("gram"));
  });

  it("returns null for a unit the household does not have", () => {
    expect(match("knob")).toBeNull();
    expect(match("")).toBeNull();
  });
});

describe("the sample cards' lines", () => {
  // Units and foods exactly as the three sample cards write them.
  it.each([
    ["2 lbs. ground chuck", "lbs.", "ground chuck", "pound", "ground chuck"],
    ["1/3 c. minced onions", "c.", "onions", "cup", "onion"],
    ["2 1/4 C. flour", "C.", "flour", "cup", "all-purpose flour"],
    ["1 t. soda", "t.", "soda", "teaspoon", "baking soda"],
    ["1 t. vanilla", "t.", "vanilla", "teaspoon", "vanilla extract"],
    ["3/4 C B. Sugar", "C", "B. Sugar", "cup", "brown sugar"],
    ["1/3 c. minced green pepper", "c.", "green pepper", "cup", "green bell pepper"],
    ["1 1/2 cups all purpose flour", "cups", "all purpose flour", "cup", "all-purpose flour"],
  ])("%s matches the household's unit and food", (text, unitName, foodName, unit, food) => {
    const { input, issues } = draftToInput(
      RecipeDraft.parse({
        title: "x",
        ingredientSections: [{ items: [{ originalText: text, quantity: 1, unitName, foodName }] }],
        stepSections: [{ steps: [{ text: "Cook." }] }],
      }),
      lists,
      countingIds(),
    );
    const line = input.ingredientSections?.[0]?.items[0];

    expect(issues).toEqual([]);
    expect(line?.unitId).toBe(fixtureUnits.find((u) => u.name === unit)?.id);
    expect(line?.foodId).toBe(fixtureFoods.find((f) => f.name === food)?.id);
    expect(line?.originalText).toBe(text);
  });
});

describe("import jobs", () => {
  it("accepts a job waiting for review with its draft and issues", () => {
    const draft = RecipeDraft.parse({ title: "x" });
    const job = {
      id: fixtureId(0xcc, 1),
      kind: "url",
      status: "needs_review",
      stage: null,
      sourceUrl: "https://example.com/r",
      result: { draft, issues: checkDraft(draft) },
      error: null,
      attempts: 1,
      recipeId: null,
      createdAt: "2026-11-22T12:00:00.000Z",
      updatedAt: "2026-11-22T12:00:03.000Z",
      finishedAt: null,
    };
    expect(ImportJob.parse(job)).toEqual(job);
  });

  it("accepts only http and https links for a URL import", () => {
    expect(UrlImportRequest.safeParse({ kind: "url", url: "https://example.com/r" }).success).toBe(
      true,
    );
    expect(UrlImportRequest.safeParse({ kind: "url", url: "ftp://example.com/r" }).success).toBe(
      false,
    );
    expect(UrlImportRequest.safeParse({ kind: "photo", url: "https://example.com" }).success).toBe(
      false,
    );
  });
});
