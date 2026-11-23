import { newId, slugify } from "@recipeflare/schema";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-utils";

afterEach(() => {
  cleanup();
});

const TIME = "2026-11-20T10:00:00.000Z";
const at = { createdAt: TIME, updatedAt: TIME };

type Row = Record<string, unknown> & { id: string; name: string };
type Call = { method: string; path: string; body: Record<string, unknown> | null };

const organizer = (
  kind: string,
  name: string,
  recipeCount: number,
  color: string | null = null,
) => ({
  id: newId(),
  kind,
  name,
  slug: slugify(name),
  color,
  recipeCount,
  ...at,
});
const food = (name: string, recipeCount: number, extra: Record<string, unknown> = {}) => ({
  id: newId(),
  name,
  pluralName: null,
  description: "",
  aliases: [],
  labelId: null,
  recipeCount,
  ...at,
  ...extra,
});
const unit = (name: string, recipeCount: number, extra: Record<string, unknown> = {}) => ({
  id: newId(),
  name,
  pluralName: null,
  abbreviation: null,
  pluralAbbreviation: null,
  useAbbreviation: false,
  fraction: true,
  description: "",
  aliases: [],
  standardQuantity: null,
  standardUnit: null,
  recipeCount,
  ...at,
  ...extra,
});
const label = (name: string, sortOrder: number, foodCount: number) => ({
  id: newId(),
  name,
  color: null,
  sortOrder,
  foodCount,
  ...at,
});

/** A stand-in for the lists API that behaves like it: names that are taken, entries in use, and an order. */
function fakeApi() {
  const produce = label("Produce", 0, 1);
  const db: Record<string, Row[]> = {
    organizers: [
      organizer("category", "Dinner", 4, "buff"),
      organizer("category", "Dessert", 0, "salmon"),
      organizer("tag", "Weeknight", 3),
      organizer("tag", "Holiday", 0),
      organizer("tool", "Dutch oven", 1),
    ],
    foods: [food("brown sugar", 2), food("leek", 0, { pluralName: "leeks", labelId: produce.id })],
    units: [
      unit("cup", 5, { pluralName: "cups", abbreviation: "c", aliases: ["C"] }),
      unit("stick", 0),
    ],
    labels: [produce, label("Dairy", 1, 0), label("Pantry", 2, 0)],
  };
  const calls: Call[] = [];
  const refusal = (status: number, code: string, extra: object = {}) =>
    Response.json({ error: { code, message: code }, ...extra }, { status });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const [, list, id] = url.pathname.replace("/api/v1", "").split("/");
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ method, path: `/${list}${id ? `/${id}` : ""}`, body });
      const rows = db[list ?? ""];
      if (!rows) {
        return refusal(404, "not_found");
      }
      if (method === "GET") {
        const items =
          list === "labels"
            ? [...rows].sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
            : [...rows].sort((a, b) => a.name.localeCompare(b.name));
        return Response.json({ items });
      }
      const sameName = (other: Row) =>
        other.id !== id &&
        other.name.toLowerCase() === String(body?.name).toLowerCase() &&
        (list !== "organizers" ||
          other.kind === (body?.kind ?? rows.find((row) => row.id === id)?.kind));
      if (method === "POST") {
        const taken = rows.find(sameName);
        if (taken) {
          return refusal(409, "duplicate", { existingId: taken.id });
        }
        const template =
          list === "organizers"
            ? organizer(String(body.kind), String(body.name), 0)
            : list === "foods"
              ? food(String(body.name), 0)
              : list === "units"
                ? unit(String(body.name), 0)
                : label(String(body.name), Number(body.sortOrder ?? 0), 0);
        const created = { ...template, ...body } as Row;
        rows.push(created);
        return Response.json(created, { status: 201 });
      }
      const index = rows.findIndex((row) => row.id === id);
      const found = rows[index];
      if (!found) {
        return refusal(404, "not_found");
      }
      if (method === "PUT") {
        if (rows.some(sameName)) {
          return refusal(409, "duplicate", { existingId: rows.find(sameName)?.id });
        }
        const next = { ...found, ...body } as Row;
        rows[index] = next;
        return Response.json(next);
      }
      if ((list === "foods" || list === "units") && Number(found.recipeCount) > 0) {
        return refusal(409, "in_use", { recipeCount: found.recipeCount });
      }
      rows.splice(index, 1);
      return new Response(null, { status: 204 });
    }),
  );
  const sent = (method: string) => calls.filter((call) => call.method === method);
  return { db, calls, sent };
}

const rows = (name: string) =>
  within(screen.getByRole("list", { name }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);
const sheet = (name: string | RegExp) => within(screen.getByRole("dialog", { name }));
const openRow = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const addBox = (one: string) => screen.getByLabelText(`Add a ${one}`) as HTMLInputElement;

describe("the index of lists", () => {
  it("names the six lists with how many entries each has, and leads to each", async () => {
    fakeApi();
    await renderAt("/manage");

    await waitFor(() =>
      expect(rows("Lists")).toEqual([
        expect.stringMatching(/^Categories.*2$/),
        expect.stringMatching(/^Tags.*2$/),
        expect.stringMatching(/^Tools.*1$/),
        expect.stringMatching(/^Foods.*2$/),
        expect.stringMatching(/^Units.*2$/),
        expect.stringMatching(/^Labels.*3$/),
      ]),
    );
    expect(screen.getByRole("link", { name: /^Tags/ }).getAttribute("href")).toBe("/manage/tags");
    expect(screen.getByRole("link", { name: /^Foods/ }).getAttribute("href")).toBe("/manage/foods");
  });

  it("says so when the lists cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "internal_error", message: "No" } }, { status: 500 }),
      ),
    );
    await renderAt("/manage");

    expect(await screen.findByRole("heading", { name: "Could not load your lists" })).toBeTruthy();
  });
});

describe("tags, categories and tools", () => {
  it("lists each entry with how much it is used, and leads back to Manage", async () => {
    fakeApi();
    await renderAt("/manage/tags");

    await waitFor(() =>
      expect(rows("Tags")).toEqual(["HolidayNot used", "WeeknightUsed in 3 recipes"]),
    );
    expect(screen.getByRole("heading", { level: 1, name: "Tags" })).toBeTruthy();
    expect(screen.getByText("2 tags")).toBeTruthy();
    expect(
      within(screen.getByRole("navigation", { name: "Back to" }))
        .getByRole("link", { name: "Manage" })
        .getAttribute("href"),
    ).toBe("/manage");
  });

  it("adds an entry from the box at the top", async () => {
    const api = fakeApi();
    await renderAt("/manage/tags");
    await screen.findByRole("list", { name: "Tags" });

    fireEvent.change(addBox("tag"), { target: { value: "  Picnic " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(rows("Tags")).toContain("PicnicNot used"));
    expect(api.sent("POST")[0]).toMatchObject({
      path: "/organizers",
      body: { kind: "tag", name: "Picnic" },
    });
    expect(addBox("tag").value).toBe("");
  });

  it("refuses a name that is taken, under the box, and one that is empty", async () => {
    const api = fakeApi();
    await renderAt("/manage/tags");
    await screen.findByRole("list", { name: "Tags" });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Type a name for the tag first.")).toBeTruthy();
    expect(api.sent("POST")).toEqual([]);

    fireEvent.change(addBox("tag"), { target: { value: "weeknight" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("That is already a tag.")).toBeTruthy();
    expect(addBox("tag").getAttribute("aria-invalid")).toBe("true");
    expect(addBox("tag").value).toBe("weeknight");
  });

  it("renames an entry from its sheet", async () => {
    const api = fakeApi();
    await renderAt("/manage/tags");
    await screen.findByRole("list", { name: "Tags" });

    openRow(/^Weeknight/);
    const change = sheet("Change tag");
    expect(change.getByText(/Used in 3 recipes\./)).toBeTruthy();
    fireEvent.change(change.getByLabelText("Name"), { target: { value: "Busy nights" } });
    fireEvent.click(change.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rows("Tags")).toContain("Busy nightsUsed in 3 recipes"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.sent("PUT")[0]?.body).toEqual({ name: "Busy nights" });
  });

  it("says so in the sheet when the new name is taken, and keeps the sheet open", async () => {
    fakeApi();
    await renderAt("/manage/tags");
    await screen.findByRole("list", { name: "Tags" });

    openRow(/^Weeknight/);
    fireEvent.change(sheet("Change tag").getByLabelText("Name"), { target: { value: "holiday" } });
    fireEvent.click(sheet("Change tag").getByRole("button", { name: "Save" }));

    expect(await sheet("Change tag").findByText("That is already a tag.")).toBeTruthy();
  });

  it("asks before deleting, says what it will be taken off, and deletes only then", async () => {
    const api = fakeApi();
    await renderAt("/manage/tags");
    await screen.findByRole("list", { name: "Tags" });

    openRow(/^Weeknight/);
    fireEvent.click(sheet("Change tag").getByRole("button", { name: "Delete" }));
    const asking = sheet("Delete this tag?");
    expect(asking.getByText(/will be taken off 3 recipes/)).toBeTruthy();
    expect(asking.getByText(/The recipes stay\./)).toBeTruthy();

    fireEvent.click(asking.getByRole("button", { name: "Keep it" }));
    expect(api.sent("DELETE")).toEqual([]);
    // Back at the entry's boxes, nothing changed.
    expect((sheet("Change tag").getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Weeknight",
    );

    fireEvent.click(sheet("Change tag").getByRole("button", { name: "Delete" }));
    fireEvent.click(sheet("Delete this tag?").getByRole("button", { name: "Delete tag" }));

    await waitFor(() => expect(rows("Tags")).toEqual(["HolidayNot used"]));
    expect(api.sent("DELETE")).toHaveLength(1);
  });

  it("shows each category with its own colour, and adds a category as a category", async () => {
    const api = fakeApi();
    await renderAt("/manage/categories");

    await waitFor(() => expect(rows("Categories")).toHaveLength(2));
    const dinner = screen.getByRole("button", { name: /^Dinner/ });
    expect(dinner.querySelector(".bg-stock-buff")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /^Dessert/ }).querySelector(".bg-stock-salmon"),
    ).toBeTruthy();

    fireEvent.change(addBox("category"), { target: { value: "Breakfast" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(api.sent("POST")[0]?.body).toEqual({ kind: "category", name: "Breakfast" }),
    );
  });

  it("allows a name that another kind already has", async () => {
    const api = fakeApi();
    await renderAt("/manage/tools");
    await screen.findByRole("list", { name: "Tools" });

    fireEvent.change(addBox("tool"), { target: { value: "Holiday" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(rows("Tools")).toContain("HolidayNot used"));
    expect(api.sent("POST")[0]?.body).toEqual({ kind: "tool", name: "Holiday" });
  });
});

describe("foods", () => {
  it("cannot be deleted while a recipe uses one, and say so instead of offering it", async () => {
    const api = fakeApi();
    await renderAt("/manage/foods");
    await screen.findByRole("list", { name: "Foods" });

    openRow(/^brown sugar/);
    const change = sheet("Change food");

    expect(change.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(change.getByText(/A food that recipes use cannot be deleted/)).toBeTruthy();
    expect(api.sent("DELETE")).toEqual([]);
  });

  it("can be deleted when no recipe uses one", async () => {
    const api = fakeApi();
    await renderAt("/manage/foods");
    await screen.findByRole("list", { name: "Foods" });

    openRow(/^leek/);
    fireEvent.click(sheet("Change food").getByRole("button", { name: "Delete" }));
    fireEvent.click(sheet("Delete this food?").getByRole("button", { name: "Delete food" }));

    await waitFor(() => expect(rows("Foods")).toEqual(["brown sugarUsed in 2 recipes"]));
    expect(api.sent("DELETE")).toHaveLength(1);
  });

  it("take a plural, the card's shorthand and a label, and show the label on the row", async () => {
    const api = fakeApi();
    await renderAt("/manage/foods");
    await waitFor(() =>
      expect(rows("Foods")).toEqual(["brown sugarUsed in 2 recipes", "leekProduce · Not used"]),
    );

    openRow(/^brown sugar/);
    const change = sheet("Change food");
    fireEvent.change(change.getByLabelText("Also written as"), {
      target: { value: "B. Sugar,  dark sugar ," },
    });
    fireEvent.change(change.getByLabelText("Label"), {
      target: { value: api.db.labels?.find((row) => row.name === "Pantry")?.id },
    });
    fireEvent.click(change.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rows("Foods")).toContain("brown sugarPantry · Used in 2 recipes"));
    expect(api.sent("PUT")[0]?.body).toEqual({
      name: "brown sugar",
      pluralName: null,
      aliases: ["B. Sugar", "dark sugar"],
      labelId: api.db.labels?.find((row) => row.name === "Pantry")?.id,
    });
  });

  it("offer a box to find one once the list is long", async () => {
    const api = fakeApi();
    for (let n = 0; n < 12; n++) {
      api.db.foods?.push(food(`spice ${n}`, 0));
    }
    await renderAt("/manage/foods");
    await waitFor(() => expect(rows("Foods")).toHaveLength(14));

    fireEvent.change(screen.getByLabelText("Find a food"), { target: { value: "SUG" } });
    expect(rows("Foods")).toEqual(["brown sugarUsed in 2 recipes"]);

    fireEvent.change(screen.getByLabelText("Find a food"), { target: { value: "zzz" } });
    expect(screen.getByRole("heading", { name: "No food matches" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show them all" }));
    expect(rows("Foods")).toHaveLength(14);
  });
});

describe("units", () => {
  it("show the abbreviation on the row and save every box, keeping what has no box", async () => {
    const api = fakeApi();
    await renderAt("/manage/units");
    await waitFor(() =>
      expect(rows("Units")).toEqual(["cupc · Used in 5 recipes", "stickNot used"]),
    );

    openRow(/^cup/);
    const change = sheet("Change unit");
    expect((change.getByLabelText("Also written as") as HTMLInputElement).value).toBe("C");
    fireEvent.click(change.getByLabelText(/Show the abbreviation/));
    fireEvent.click(change.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.sent("PUT")).toHaveLength(1));
    expect(api.sent("PUT")[0]?.body).toEqual({
      name: "cup",
      pluralName: "cups",
      abbreviation: "c",
      pluralAbbreviation: "c",
      aliases: ["C"],
      useAbbreviation: true,
      fraction: true,
      description: "",
      standardQuantity: null,
      standardUnit: null,
    });
    // In use, so it can be renamed and not deleted.
    openRow(/^cup/);
    expect(sheet("Change unit").queryByRole("button", { name: "Delete" })).toBeNull();
  });
});

describe("labels", () => {
  it("are listed in the household's order with the foods that have each, and can be moved", async () => {
    const api = fakeApi();
    await renderAt("/manage/labels");
    await waitFor(() =>
      expect(rows("Labels")).toEqual(["ProduceUsed in 1 food", "DairyNot used", "PantryNot used"]),
    );

    openRow(/^Pantry/);
    expect(sheet("Change label").getByText("Place in the list: 3 of 3")).toBeTruthy();
    // At the end of the list it cannot go down. The button says so and stays where focus can rest.
    const down = sheet("Change label").getByRole("button", { name: "Move down" });
    expect(down.getAttribute("aria-disabled")).toBe("true");
    expect((down as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sheet("Change label").getByRole("button", { name: "Move up" }));

    await waitFor(() =>
      expect(rows("Labels")).toEqual(["ProduceUsed in 1 food", "PantryNot used", "DairyNot used"]),
    );
    // Only the two labels that changed places were sent.
    expect(api.sent("PUT").map((call) => call.body)).toEqual([
      { name: "Pantry", color: null, sortOrder: 1 },
      { name: "Dairy", color: null, sortOrder: 2 },
    ]);
    expect(await sheet("Change label").findByText("Place in the list: 2 of 3")).toBeTruthy();
  });

  it("put a new label at the end, and say what a delete takes it off", async () => {
    const api = fakeApi();
    await renderAt("/manage/labels");
    await screen.findByRole("list", { name: "Labels" });

    fireEvent.change(addBox("label"), { target: { value: "Frozen" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(rows("Labels").at(-1)).toBe("FrozenNot used"));
    expect(api.sent("POST")[0]?.body).toEqual({ name: "Frozen", sortOrder: 3 });

    openRow(/^Produce/);
    fireEvent.click(sheet("Change label").getByRole("button", { name: "Delete" }));
    expect(sheet("Delete this label?").getByText(/will be taken off 1 food/)).toBeTruthy();
    expect(sheet("Delete this label?").getByText(/The foods stay\./)).toBeTruthy();
  });
});

describe("what the screen says and where focus goes", () => {
  const said = () => screen.getAllByRole("status").map((status) => status.textContent);

  it("counts a list in its own plural", async () => {
    fakeApi();
    await renderAt("/manage/categories");

    expect(await screen.findByText("2 categories")).toBeTruthy();
  });

  it("says what happened after an entry is added, saved and deleted", async () => {
    fakeApi();
    await renderAt("/manage/tags");
    await screen.findByRole("list", { name: "Tags" });

    fireEvent.change(addBox("tag"), { target: { value: "Picnic" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(said()).toContain("Picnic added."));

    openRow(/^Picnic/);
    fireEvent.change(sheet("Change tag").getByLabelText("Name"), { target: { value: "Outdoors" } });
    fireEvent.click(sheet("Change tag").getByRole("button", { name: "Save" }));
    await waitFor(() => expect(said()).toContain("Outdoors saved."));

    openRow(/^Outdoors/);
    fireEvent.click(sheet("Change tag").getByRole("button", { name: "Delete" }));
    fireEvent.click(sheet("Delete this tag?").getByRole("button", { name: "Delete tag" }));
    await waitFor(() => expect(said()).toContain("Outdoors deleted."));
    // The row that opened the sheet is gone, so focus goes to the box for adding.
    await waitFor(() => expect(document.activeElement).toBe(addBox("tag")));
  });

  it("moves focus with the sheet's buttons when it asks about deleting, and reads the question", async () => {
    fakeApi();
    await renderAt("/manage/tags");
    await screen.findByRole("list", { name: "Tags" });
    openRow(/^Weeknight/);

    fireEvent.click(sheet("Change tag").getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("dialog", { name: "Delete this tag?" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Keep it" }));
    const question = document.getElementById(dialog.getAttribute("aria-describedby") ?? "");
    expect(question?.textContent).toContain("will be taken off 3 recipes");

    fireEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));

    expect(document.activeElement).toBe(
      sheet("Change tag").getByRole("button", { name: "Delete" }),
    );
  });

  it("goes to the box whose name was refused, so the problem is read out", async () => {
    fakeApi();
    await renderAt("/manage/tags");
    await screen.findByRole("list", { name: "Tags" });

    fireEvent.change(addBox("tag"), { target: { value: "holiday" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("That is already a tag.");
    expect(document.activeElement).toBe(addBox("tag"));

    openRow(/^Weeknight/);
    const name = sheet("Change tag").getByLabelText("Name");
    fireEvent.change(name, { target: { value: "Holiday" } });
    fireEvent.click(sheet("Change tag").getByRole("button", { name: "Save" }));
    await sheet("Change tag").findByText("That is already a tag.");
    await waitFor(() => expect(document.activeElement).toBe(name));
  });

  it("says first in the sheet whether the entry is used and why it cannot be deleted", async () => {
    fakeApi();
    await renderAt("/manage/units");
    await screen.findByRole("list", { name: "Units" });
    openRow(/^cup/);

    const dialog = screen.getByRole("dialog", { name: "Change unit" });
    const reason = within(dialog).getByText(/A unit that recipes use cannot be deleted/);
    const name = within(dialog).getByLabelText("Name");
    // The reason comes before the first box, not after the last.
    expect(reason.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lets an entry be read and not changed while the device is offline, and says why in the sheet", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fakeApi();
    await renderAt("/manage/tags");
    await screen.findByRole("list", { name: "Tags" });
    expect(addBox("tag").disabled).toBe(true);

    openRow(/^Weeknight/);
    const change = sheet("Change tag");

    expect(change.getByText(/You are offline\. This can be read/)).toBeTruthy();
    expect((change.getByLabelText("Name") as HTMLInputElement).readOnly).toBe(true);
    expect((change.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("a list that cannot be shown", () => {
  it("says what a list is for when it is empty", async () => {
    const api = fakeApi();
    api.db.organizers = [];
    await renderAt("/manage/tools");

    expect(await screen.findByRole("heading", { name: "No tools yet" })).toBeTruthy();
    expect(screen.getByText(/A tool is equipment a recipe needs/)).toBeTruthy();
    // It can still be added to.
    expect(addBox("tool")).toBeTruthy();
  });

  it("says so when the list cannot be loaded, and loads it when asked to try again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "internal_error", message: "No" } }, { status: 500 }),
      ),
    );
    await renderAt("/manage/tags");
    expect(await screen.findByRole("heading", { name: "Could not load the tags" })).toBeTruthy();

    fakeApi();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(rows("Tags")).toHaveLength(2));
  });

  it("says so when a change does not go through, and changes nothing", async () => {
    const api = fakeApi();
    await renderAt("/manage/tags");
    await screen.findByRole("list", { name: "Tags" });
    openRow(/^Weeknight/);
    fireEvent.change(sheet("Change tag").getByLabelText("Name"), { target: { value: "Later" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    fireEvent.click(sheet("Change tag").getByRole("button", { name: "Save" }));

    expect(
      await sheet("Change tag").findByText("Nothing was changed: the server could not be reached."),
    ).toBeTruthy();
    expect(api.db.organizers?.some((row) => row.name === "Later")).toBe(false);
  });

  it("says so when the address names no list", async () => {
    fakeApi();
    await renderAt("/manage/cuisines");

    expect(await screen.findByRole("heading", { name: "There is no such list" })).toBeTruthy();
  });
});
