import { env } from "cloudflare:workers";
import { FoodEntry, newId, OrganizerEntry, Recipe, RecipeListResponse } from "@recipeflare/schema";
import { fixtureMember } from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { ftsQuery } from "../src/db/ftsQuery";
import { seedLists, signedIn } from "./helpers";

const api = signedIn(env, fixtureMember.email ?? "");

const ids: Record<string, string> = {};
const slugs: Record<string, string> = {};

async function organizer(kind: string, name: string) {
  const entry = OrganizerEntry.parse(await (await api.post("/organizers", { kind, name })).json());
  ids[name] = entry.id;
  slugs[name] = entry.slug;
}
async function food(name: string) {
  ids[name] = FoodEntry.parse(await (await api.post("/foods", { name })).json()).id;
}
async function recipe(title: string, body: Record<string, unknown> = {}) {
  const response = await api.post("/recipes", { title, ...body });
  expect(response.status).toBe(201);
  ids[title] = Recipe.parse(await response.json()).id;
}
const lines = (...items: [string, string?][]) => [
  {
    title: null,
    items: items.map(([text, foodName]) => ({
      id: newId(),
      originalText: text,
      foodId: foodName ? ids[foodName] : null,
    })),
  },
];

beforeAll(async () => {
  await seedLists(env.DB);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM foods"),
    env.DB.prepare("DELETE FROM organizers"),
  ]);
  for (const [kind, name] of [
    ["category", "Dinner"],
    ["category", "Dessert"],
    ["tag", "Weeknight"],
    ["tag", "Holiday"],
    ["tool", "Dutch oven"],
  ]) {
    await organizer(kind ?? "", name ?? "");
  }
  for (const name of ["tomato", "butter", "brown sugar"]) {
    await food(name);
  }

  await recipe("Tomato Soup", {
    description: "With crème fraîche on top.",
    sourceName: "Grandma Rose",
    categoryIds: [ids.Dinner],
    tagIds: [ids.Weeknight],
    toolIds: [ids["Dutch oven"]],
    ingredientSections: lines(["2 lbs ripe plum ones", "tomato"], ["2 T butter", "butter"]),
  });
  await recipe("Chocolate Chip Cookies", {
    categoryIds: [ids.Dessert],
    tagIds: [ids.Holiday],
    ingredientSections: lines(
      ["1 C. Butter, Softened", "butter"],
      ["3/4 C B. Sugar", "brown sugar"],
    ),
  });
  await recipe("Tomato Tart", {
    description: "Good cold.",
    categoryIds: [ids.Dinner],
    tagIds: [ids.Weeknight, ids.Holiday],
    ingredientSections: lines(["3 large", "tomato"], ["1 sheet puff pastry"]),
  });
  await recipe("Garden Salad", {
    categoryIds: [ids.Dinner],
    ingredientSections: lines(["a few, quartered", "tomato"], ["1 cucumber"]),
  });
  await recipe("Buttered Toast", { ingredientSections: lines(["2 slices bread"]) });

  // Changed in a known order: the soup most recently, the toast longest ago.
  const order = [
    "Tomato Soup",
    "Chocolate Chip Cookies",
    "Tomato Tart",
    "Garden Salad",
    "Buttered Toast",
  ];
  await env.DB.batch(
    order.map((title, index) =>
      env.DB.prepare("UPDATE recipes SET updated_at = ?1 WHERE id = ?2").bind(
        `2026-11-2${5 - index}T10:00:00.000Z`,
        ids[title],
      ),
    ),
  );
});

async function list(params: Record<string, string>) {
  const response = await api.get(`/recipes?${new URLSearchParams(params)}`);
  expect(response.status).toBe(200);
  return RecipeListResponse.parse(await response.json());
}
const titles = async (params: Record<string, string>) =>
  (await list(params)).items.map((item) => item.title);
const found = async (q: string) => (await titles({ q })).sort();

describe("searching", () => {
  it("finds a recipe by its title", async () => {
    expect(await found("cookies")).toEqual(["Chocolate Chip Cookies"]);
  });

  it("finds a recipe by an ingredient line as written", async () => {
    expect(await found("pastry")).toEqual(["Tomato Tart"]);
    expect(await found("softened")).toEqual(["Chocolate Chip Cookies"]);
  });

  it("finds a recipe by the household's name for a food the card abbreviated", async () => {
    expect(await found("brown sugar")).toEqual(["Chocolate Chip Cookies"]);
    expect(await found("tomato")).toEqual(["Garden Salad", "Tomato Soup", "Tomato Tart"]);
  });

  it("finds a recipe by its tag, its category and its tool", async () => {
    expect(await found("holiday")).toEqual(["Chocolate Chip Cookies", "Tomato Tart"]);
    expect(await found("dessert")).toEqual(["Chocolate Chip Cookies"]);
    expect(await found("dutch oven")).toEqual(["Tomato Soup"]);
  });

  it("finds a recipe by who it is from and by its description", async () => {
    expect(await found("grandma")).toEqual(["Tomato Soup"]);
    expect(await found("cold")).toEqual(["Tomato Tart"]);
  });

  it("needs every word, wherever each is found", async () => {
    expect(await found("tomato weeknight")).toEqual(["Tomato Soup", "Tomato Tart"]);
    expect(await found("tomato weeknight holiday")).toEqual(["Tomato Tart"]);
    expect(await found("tomato cookies")).toEqual([]);
  });

  it("matches the last word as it is being typed, and only the last", async () => {
    expect(await found("choc")).toEqual(["Chocolate Chip Cookies"]);
    expect(await found("tomato so")).toEqual(["Tomato Soup"]);
    expect(await found("choc cookies")).toEqual([]);
  });

  it("ignores plurals, capitals and accents", async () => {
    expect(await found("TOMATOES")).toEqual(["Garden Salad", "Tomato Soup", "Tomato Tart"]);
    expect(await found("cookie")).toEqual(["Chocolate Chip Cookies"]);
    expect(await found("creme fraiche")).toEqual(["Tomato Soup"]);
    expect(await found("crème")).toEqual(["Tomato Soup"]);
  });

  it("puts a match in the title above a match in the ingredients", async () => {
    const order = await titles({ q: "tomato" });

    expect(order.slice(0, 2).sort()).toEqual(["Tomato Soup", "Tomato Tart"]);
    expect(order[2]).toBe("Garden Salad");
  });

  it("counts what matched, and pages through it", async () => {
    const first = await list({ q: "tomato", perPage: "2" });
    const second = await list({ q: "tomato", perPage: "2", page: "2" });

    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    expect(second.items.map((item) => item.title)).toEqual(["Garden Salad"]);
  });

  it("can be sorted another way while searching, and falls back when there is nothing to rank", async () => {
    expect(await titles({ q: "tomato", sort: "title" })).toEqual([
      "Garden Salad",
      "Tomato Soup",
      "Tomato Tart",
    ]);
    // Best match without a search is the usual order: last changed first.
    expect(await titles({ sort: "match" })).toEqual(await titles({}));
  });
});

describe("search and what changes", () => {
  it("stops finding a recipe once it is deleted", async () => {
    await recipe("Vanishing Vindaloo");
    expect(await found("vindaloo")).toEqual(["Vanishing Vindaloo"]);

    await api.delete(`/recipes/${ids["Vanishing Vindaloo"]}`);

    expect(await found("vindaloo")).toEqual([]);
    expect((await list({ q: "vindaloo" })).total).toBe(0);
  });

  it("follows a renamed tag", async () => {
    await organizer("tag", "Potluck");
    await recipe("Seven Layer Dip", { tagIds: [ids.Potluck] });
    expect(await found("potluck")).toEqual(["Seven Layer Dip"]);

    await api.put(`/organizers/${ids.Potluck}`, { name: "Jamboree" });

    expect(await found("potluck")).toEqual([]);
    expect(await found("jamboree")).toEqual(["Seven Layer Dip"]);
    expect(await titles({ tags: "jamboree" })).toEqual(["Seven Layer Dip"]);
    await api.delete(`/recipes/${ids["Seven Layer Dip"]}`);
  });
});

describe("text that is not a plain search", () => {
  const HOSTILE = [
    '"',
    "'",
    '"unbalanced',
    'say "cheese',
    '""',
    "AND",
    "OR",
    "NOT tomato",
    "tomato AND",
    "tomato OR cookies",
    "NEAR(tomato soup, 2)",
    "*",
    "tom*",
    "*tomato",
    "-tomato",
    "+tomato",
    "^tomato",
    "title:tomato",
    "title : tomato",
    "{title description}: tomato",
    "(",
    ")",
    "((tomato)",
    "tomato)",
    "; DROP TABLE recipes; --",
    "' OR '1'='1",
    "%",
    "_",
    "\\",
    '\\"',
    "🍕",
    "🍕🍕 🍅",
    "tomato 🍅 soup",
    "\u0000",
    "tomato\u0000soup",
    "‮tomato",
    "　",
    "tomato\nsoup\ttart",
    "x".repeat(5000),
    "tomato ".repeat(200),
    "日本語のレシピ",
    "1/2",
    "50%",
    "#weeknight",
    "@grandma",
  ];

  it.each(HOSTILE)("never errors: %j", async (q) => {
    const page = await list({ q });

    expect(page.items.length).toBeLessThanOrEqual(page.total);
  });

  it("is read as words, never as search operators", async () => {
    // "OR" is a word that must match like any other, so this is not "either".
    expect(await found("tomato OR cookies")).toEqual([]);
    // A column name in front does not narrow the search to that column.
    expect(await found("title:tomato")).toEqual([]);
    expect(await found("ingredients:pastry")).toEqual([]);
    // A leading minus does not exclude.
    expect(await found("-tomato")).toEqual(["Garden Salad", "Tomato Soup", "Tomato Tart"]);
    // Quotes do not make a phrase out of words that are apart.
    expect(await found('"tomato weeknight"')).toEqual(["Tomato Soup", "Tomato Tart"]);
    expect(await found("tomato* soup")).toEqual(["Tomato Soup"]);
  });

  it("finds nothing for text with no letter or digit in it, without calling that an error", async () => {
    expect(await list({ q: "🍕" })).toMatchObject({ items: [], total: 0 });
    expect(await list({ q: '"' })).toMatchObject({ items: [], total: 0 });
    // Nothing typed is not a search: everything is listed.
    expect((await list({ q: "   " })).total).toBe(5);
  });

  it("is turned into a query of quoted words", () => {
    expect(ftsQuery("Tomato soup")).toBe('"Tomato" AND "soup"*');
    expect(ftsQuery('  "choc  ')).toBe('"choc"*');
    expect(ftsQuery("grandma's crème-fraîche")).toBe(
      '"grandma" AND "s" AND "crème" AND "fraîche"*',
    );
    expect(ftsQuery("title:x OR y*")).toBe('"title" AND "x" AND "OR" AND "y"*');
    expect(ftsQuery("🍕 ()")).toBeNull();
    expect(ftsQuery("")).toBeNull();
    expect(ftsQuery("a ".repeat(50))?.split(" AND ")).toHaveLength(12);
  });
});

describe("filters", () => {
  it("narrow the list to one category", async () => {
    expect(await titles({ category: slugs.Dinner ?? "" })).toEqual([
      "Tomato Soup",
      "Tomato Tart",
      "Garden Salad",
    ]);
    expect(await titles({ category: slugs.Dessert ?? "" })).toEqual(["Chocolate Chip Cookies"]);
  });

  it("need every tag chosen, and every tool", async () => {
    expect((await titles({ tags: "weeknight" })).sort()).toEqual(["Tomato Soup", "Tomato Tart"]);
    expect(await titles({ tags: "weeknight,holiday" })).toEqual(["Tomato Tart"]);
    expect(await titles({ tags: "holiday, weeknight ,holiday" })).toEqual(["Tomato Tart"]);
    expect(await titles({ tools: slugs["Dutch oven"] ?? "" })).toEqual(["Tomato Soup"]);
  });

  it("need every food chosen", async () => {
    expect((await titles({ foods: ids.butter ?? "" })).sort()).toEqual([
      "Chocolate Chip Cookies",
      "Tomato Soup",
    ]);
    expect(await titles({ foods: `${ids.butter},${ids.tomato}` })).toEqual(["Tomato Soup"]);
    expect(await titles({ foods: `${ids.butter},${ids["brown sugar"]},${ids.tomato}` })).toEqual(
      [],
    );
  });

  it("combine with each other and with the search", async () => {
    expect(
      await titles({ category: "dinner", tags: "weeknight", foods: ids.tomato ?? "" }),
    ).toEqual(["Tomato Soup", "Tomato Tart"]);
    expect(await titles({ q: "tart", category: "dinner", tags: "weeknight" })).toEqual([
      "Tomato Tart",
    ]);
    expect(await titles({ q: "tomato", category: "dessert" })).toEqual([]);
    expect(await titles({ q: "butter", tools: "dutch-oven" })).toEqual(["Tomato Soup"]);

    const page = await list({ q: "tomato", tags: "weeknight", perPage: "1" });
    expect(page).toMatchObject({ total: 2 });
    expect(page.items).toHaveLength(1);
  });

  it("find nothing for a name the household does not have, and a tag is not a tool", async () => {
    expect(await titles({ category: "brunch" })).toEqual([]);
    expect(await titles({ tags: "weeknight,no-such-tag" })).toEqual([]);
    expect(await titles({ tools: "weeknight" })).toEqual([]);
    expect(await titles({ foods: "not-an-id" })).toEqual([]);
    expect(await titles({ category: "'; DROP TABLE recipes; --" })).toEqual([]);
    expect((await list({})).total).toBe(5);
  });

  it("keep the usual order when there is no search", async () => {
    expect(await titles({ tags: "holiday" })).toEqual(["Chocolate Chip Cookies", "Tomato Tart"]);
    expect(await titles({ tags: "holiday", sort: "title" })).toEqual([
      "Chocolate Chip Cookies",
      "Tomato Tart",
    ]);
  });
});
