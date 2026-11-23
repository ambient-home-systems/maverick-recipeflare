import { env } from "cloudflare:workers";
import {
  DuplicateBody,
  ErrorBody,
  FoodEntry,
  FoodListResponse,
  InUseBody,
  LabelEntry,
  LabelListResponse,
  newId,
  OrganizerEntry,
  OrganizerListResponse,
  Recipe,
  UnitEntry,
  UnitListResponse,
} from "@recipeflare/schema";
import { fixtureMember } from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { matchingRecipes, seedLists, signedIn } from "./helpers";

const api = signedIn(env, fixtureMember.email ?? "");

beforeAll(async () => {
  await seedLists(env.DB);
  // This file makes its own lists; only the member is kept from the fixtures.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM foods"),
    env.DB.prepare("DELETE FROM labels"),
    env.DB.prepare("DELETE FROM units"),
    env.DB.prepare("DELETE FROM organizers"),
  ]);
});

async function made<T>(path: string, body: unknown, parse: (value: unknown) => T): Promise<T> {
  const response = await api.post(path, body);
  expect(response.status).toBe(201);
  return parse(await response.json());
}
const organizer = (kind: string, name: string) =>
  made("/organizers", { kind, name }, (value) => OrganizerEntry.parse(value));
const food = (body: Record<string, unknown>) =>
  made("/foods", body, (value) => FoodEntry.parse(value));
const unit = (body: Record<string, unknown>) =>
  made("/units", body, (value) => UnitEntry.parse(value));
const label = (body: Record<string, unknown>) =>
  made("/labels", body, (value) => LabelEntry.parse(value));

async function recipe(body: Record<string, unknown>): Promise<Recipe> {
  const response = await api.post("/recipes", body);
  expect(response.status).toBe(201);
  return Recipe.parse(await response.json());
}
const reload = async (id: string) => Recipe.parse(await (await api.get(`/recipes/${id}`)).json());

const line = (text: string, extra: Record<string, unknown> = {}) => ({
  id: newId(),
  originalText: text,
  ...extra,
});

async function duplicateOf(response: Response) {
  expect(response.status).toBe(409);
  const body = DuplicateBody.parse(await response.json());
  expect(body.error.code).toBe("duplicate");
  return body.existingId;
}

describe("categories, tags and tools", () => {
  it("are created, listed with their use, renamed and deleted", async () => {
    const tag = await organizer("tag", "  Weeknight ");
    expect(tag).toMatchObject({ kind: "tag", name: "Weeknight", slug: "weeknight", color: null });
    const used = await recipe({ title: "Tagged Once", tagIds: [tag.id] });

    const listed = OrganizerListResponse.parse(await (await api.get("/organizers")).json());
    expect(listed.items.find((item) => item.id === tag.id)).toMatchObject({ recipeCount: 1 });

    const renamed = await api.put(`/organizers/${tag.id}`, { name: "Busy nights" });
    expect(OrganizerEntry.parse(await renamed.json())).toMatchObject({
      id: tag.id,
      name: "Busy nights",
      slug: "busy-nights",
      recipeCount: 1,
    });
    expect((await reload(used.id)).tags).toEqual([
      { id: tag.id, name: "Busy nights", slug: "busy-nights" },
    ]);

    expect((await api.delete(`/organizers/${tag.id}`)).status).toBe(204);
    expect((await reload(used.id)).tags).toEqual([]);
    expect((await api.delete(`/organizers/${tag.id}`)).status).toBe(404);
  });

  it("refuse a name that is taken within the kind, ignoring capitals and spacing, and say who has it", async () => {
    const tool = await organizer("tool", "Dutch oven");

    expect(
      await duplicateOf(await api.post("/organizers", { kind: "tool", name: "dutch  OVEN" })),
    ).toBe(tool.id);
    // The same name is free in another kind.
    const tag = await organizer("tag", "Dutch oven");
    expect(tag.id).not.toBe(tool.id);

    const other = await organizer("tool", "Skillet");
    expect(
      await duplicateOf(await api.put(`/organizers/${other.id}`, { name: "Dutch Oven" })),
    ).toBe(tool.id);
    // Renaming something to its own name, differently capitalised, is not a clash.
    expect((await api.put(`/organizers/${tool.id}`, { name: "Dutch Oven" })).status).toBe(200);
  });

  it("give each new category the stock the fewest categories have", async () => {
    const colors: (string | null)[] = [];
    for (const name of ["Breakfast", "Dinner", "Dessert", "Soup", "Salad", "Bread"]) {
      colors.push((await organizer("category", name)).color);
    }
    expect(colors).toEqual(["buff", "salmon", "sky", "mint", "lilac", "buff"]);

    // Delete the only salmon one: the next category takes salmon, and the others keep theirs.
    const listed = OrganizerListResponse.parse(await (await api.get("/organizers")).json());
    const dinner = listed.items.find((item) => item.name === "Dinner");
    await api.delete(`/organizers/${dinner?.id}`);
    expect((await organizer("category", "Lunch")).color).toBe("salmon");
    const after = OrganizerListResponse.parse(await (await api.get("/organizers")).json());
    expect(after.items.find((item) => item.name === "Dessert")?.color).toBe("sky");
  });

  it("keep search in step when one is renamed or deleted", async () => {
    const tag = await organizer("tag", "Potluck");
    const other = await organizer("tag", "Picnic");
    const first = await recipe({ title: "Seven Layer Dip", tagIds: [tag.id, other.id] });
    const second = await recipe({ title: "Deviled Eggs", tagIds: [tag.id] });

    await api.put(`/organizers/${tag.id}`, { name: "Jamboree" });

    expect(await matchingRecipes(env.DB, '"potluck"')).toEqual([]);
    expect((await matchingRecipes(env.DB, '"jamboree"')).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    // What the recipes are otherwise found by is untouched.
    expect(await matchingRecipes(env.DB, '"picnic"')).toEqual([first.id]);
    expect(await matchingRecipes(env.DB, '"deviled"')).toEqual([second.id]);

    await api.delete(`/organizers/${tag.id}`);

    expect(await matchingRecipes(env.DB, '"jamboree"')).toEqual([]);
    expect(await matchingRecipes(env.DB, '"picnic"')).toEqual([first.id]);
  });

  it("answer 400 to a body that does not fit and 404 to an ID that is not there", async () => {
    const bad = await api.post("/organizers", { kind: "cuisine", name: "" });
    expect(bad.status).toBe(400);
    const paths = ErrorBody.parse(await bad.json()).error.issues?.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["kind", "name"]));

    expect((await api.put(`/organizers/${newId()}`, { name: "Nobody" })).status).toBe(404);
    expect((await api.put("/organizers/not-an-id", { name: "Nobody" })).status).toBe(404);
  });
});

describe("foods", () => {
  it("are created, listed with their use, changed and deleted", async () => {
    const produce = await label({ name: "Produce" });
    const leek = await food({ name: "Leek", pluralName: "leeks", aliases: ["poireau"] });
    expect(leek).toMatchObject({
      name: "Leek",
      pluralName: "leeks",
      labelId: null,
      recipeCount: 0,
    });

    const changed = await api.put(`/foods/${leek.id}`, {
      name: "Leek",
      pluralName: "leeks",
      description: "Wash well.",
      aliases: ["poireau"],
      labelId: produce.id,
    });
    expect(FoodEntry.parse(await changed.json())).toMatchObject({
      description: "Wash well.",
      labelId: produce.id,
      createdAt: leek.createdAt,
    });

    const listed = FoodListResponse.parse(await (await api.get("/foods")).json());
    expect(listed.items.find((item) => item.id === leek.id)).toMatchObject({
      aliases: ["poireau"],
      labelId: produce.id,
      recipeCount: 0,
    });

    expect((await api.delete(`/foods/${leek.id}`)).status).toBe(204);
    expect((await api.delete(`/foods/${leek.id}`)).status).toBe(404);
  });

  it("refuse a name that is taken, ignoring capitals and spacing", async () => {
    const sugar = await food({ name: "Brown sugar" });

    expect(await duplicateOf(await api.post("/foods", { name: " brown   SUGAR " }))).toBe(sugar.id);
    const other = await food({ name: "White sugar" });
    expect(await duplicateOf(await api.put(`/foods/${other.id}`, { name: "Brown Sugar" }))).toBe(
      sugar.id,
    );
  });

  it("cannot be deleted while a recipe uses one, and say how many do", async () => {
    const saffron = await food({ name: "Saffron" });
    const first = await recipe({
      title: "Paella",
      ingredientSections: [
        {
          title: null,
          // Twice in one recipe is still one recipe.
          items: [
            line("a pinch saffron", { foodId: saffron.id }),
            line("more saffron", { foodId: saffron.id }),
          ],
        },
      ],
    });
    await recipe({
      title: "Bouillabaisse",
      ingredientSections: [{ title: null, items: [line("saffron", { foodId: saffron.id })] }],
    });

    const refused = await api.delete(`/foods/${saffron.id}`);

    expect(refused.status).toBe(409);
    const body = InUseBody.parse(await refused.json());
    expect(body).toMatchObject({ error: { code: "in_use" }, recipeCount: 2 });
    const listed = FoodListResponse.parse(await (await api.get("/foods")).json());
    expect(listed.items.find((item) => item.id === saffron.id)?.recipeCount).toBe(2);
    expect((await reload(first.id)).ingredientSections[0]?.items[0]?.food?.id).toBe(saffron.id);
  });

  it("keep search in step when one is renamed", async () => {
    const zucchini = await food({ name: "Zucchini" });
    const fritters = await recipe({
      title: "Fritters",
      ingredientSections: [
        { title: null, items: [line("2 medium, grated", { foodId: zucchini.id })] },
      ],
    });
    expect(await matchingRecipes(env.DB, '"zucchini"')).toEqual([fritters.id]);

    await api.put(`/foods/${zucchini.id}`, { name: "Courgette" });

    expect(await matchingRecipes(env.DB, '"zucchini"')).toEqual([]);
    expect(await matchingRecipes(env.DB, '"courgette"')).toEqual([fritters.id]);
    // The line as written is still found.
    expect(await matchingRecipes(env.DB, '"grated"')).toEqual([fritters.id]);
    expect((await reload(fritters.id)).ingredientSections[0]?.items[0]?.food?.name).toBe(
      "Courgette",
    );
  });

  it("refuse a label that does not exist", async () => {
    const response = await api.post("/foods", { name: "Orphan", labelId: newId() });

    expect(response.status).toBe(400);
    expect(ErrorBody.parse(await response.json()).error.issues?.[0]?.path).toEqual(["labelId"]);
  });
});

describe("units", () => {
  it("are created, listed with their use, changed and deleted", async () => {
    const stick = await unit({ name: "stick", pluralName: "sticks", fraction: true });
    expect(stick).toMatchObject({ name: "stick", useAbbreviation: false, fraction: true });

    const changed = await api.put(`/units/${stick.id}`, {
      name: "stick",
      pluralName: "sticks",
      abbreviation: "stk",
      useAbbreviation: true,
      aliases: ["Stk"],
    });
    expect(UnitEntry.parse(await changed.json())).toMatchObject({
      abbreviation: "stk",
      useAbbreviation: true,
      aliases: ["Stk"],
    });

    const listed = UnitListResponse.parse(await (await api.get("/units")).json());
    expect(listed.items.find((item) => item.id === stick.id)).toMatchObject({
      abbreviation: "stk",
      recipeCount: 0,
    });
    expect((await api.delete(`/units/${stick.id}`)).status).toBe(204);
  });

  it("refuse a name that is taken", async () => {
    const pinch = await unit({ name: "pinch" });

    expect(await duplicateOf(await api.post("/units", { name: "Pinch" }))).toBe(pinch.id);
    const dash = await unit({ name: "dash" });
    expect(await duplicateOf(await api.put(`/units/${dash.id}`, { name: "PINCH" }))).toBe(pinch.id);
  });

  it("cannot be deleted while a recipe uses one", async () => {
    const handful = await unit({ name: "handful" });
    await recipe({
      title: "Trail Mix",
      ingredientSections: [
        { title: null, items: [line("1 handful raisins", { quantity: 1, unitId: handful.id })] },
      ],
    });

    const refused = await api.delete(`/units/${handful.id}`);

    expect(refused.status).toBe(409);
    expect(InUseBody.parse(await refused.json()).recipeCount).toBe(1);
  });
});

describe("labels", () => {
  it("are created, listed in the household's order with their use, changed and deleted", async () => {
    const dairy = await label({ name: "Dairy", sortOrder: 2 });
    const bakery = await label({ name: "Bakery", sortOrder: 1, color: "#aa5500" });
    const milk = await food({ name: "Milk", labelId: dairy.id });

    const listed = LabelListResponse.parse(await (await api.get("/labels")).json());
    const names = listed.items.map((item) => item.name);
    expect(names.indexOf("Bakery")).toBeLessThan(names.indexOf("Dairy"));
    expect(listed.items.find((item) => item.id === dairy.id)).toMatchObject({ foodCount: 1 });
    expect(listed.items.find((item) => item.id === bakery.id)).toMatchObject({ color: "#aa5500" });

    const renamed = await api.put(`/labels/${dairy.id}`, { name: "Chilled", sortOrder: 0 });
    expect(LabelEntry.parse(await renamed.json())).toMatchObject({
      name: "Chilled",
      sortOrder: 0,
      foodCount: 1,
    });

    // Deleting a label takes it off its foods and leaves the foods.
    expect((await api.delete(`/labels/${dairy.id}`)).status).toBe(204);
    const foods = FoodListResponse.parse(await (await api.get("/foods")).json());
    expect(foods.items.find((item) => item.id === milk.id)).toMatchObject({ labelId: null });
    expect((await api.delete(`/labels/${dairy.id}`)).status).toBe(404);
  });

  it("refuse a name that is taken", async () => {
    const frozen = await label({ name: "Frozen" });

    expect(await duplicateOf(await api.post("/labels", { name: "frozen" }))).toBe(frozen.id);
  });
});

describe("the lists", () => {
  it("need sign-in", async () => {
    const stranger = signedIn(env, "");
    for (const path of ["/organizers", "/foods", "/units", "/labels"]) {
      expect((await stranger.get(path)).status).toBe(401);
    }
  });
});
