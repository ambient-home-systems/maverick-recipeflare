import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_LIST_STATE } from "../pages/recipes/listState";
import { renderAt } from "../test-utils";
import { queryLibrary, searchWords } from "./mockLibrary";

afterEach(cleanup);

const titles = () =>
  within(screen.getByRole("list", { name: "Recipes" }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("span.block")?.textContent);

const search = (text: string) =>
  queryLibrary({ ...EMPTY_LIST_STATE, q: text }).map((recipe) => recipe.title);

const type = (text: string) =>
  fireEvent.change(screen.getByRole("searchbox", { name: "Search recipes" }), {
    target: { value: text },
  });

const openFilters = () => fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
const sheet = () => within(screen.getByRole("dialog", { name: "Filter recipes" }));

describe("the mock library's search", () => {
  it("needs every word to match", () => {
    expect(search("bean chili")).toEqual(["Sunday Beef and Bean Chili"]);
    expect(search("bean cookies")).toEqual([]);
  });

  it("matches the last word as a prefix, and only the last", () => {
    expect(search("choc")).toEqual(["Chocolate Chip Pan Cookies"]);
    expect(search("choc pan")).toEqual([]);
  });

  it("ignores plurals and accents", () => {
    expect(searchWords("Jalapeños")).toEqual(searchWords("jalapeno"));
    expect(searchWords("cookies")).toEqual(searchWords("cookie"));
    expect(searchWords("berries")).toEqual(searchWords("berry"));
  });

  it("looks in ingredients, tags, tools and who a recipe is from", () => {
    expect(search("lentils")).toEqual(["Lemony Red Lentil Soup"]);
    expect(search("aunt june")).toEqual(["Cardamom Sugar Cookies"]);
    expect(search("griddle")).toEqual(["Buttermilk Pancakes"]);
    expect(search("vegetarian")).toEqual(["Lemony Red Lentil Soup"]);
  });

  it("puts a match in the title ahead of a match elsewhere", () => {
    const found = search("pancakes");
    expect(found.slice(0, 2).sort()).toEqual(["Buttermilk Pancakes", "Pancakes"]);
  });
});

describe("the recipe list", () => {
  it("lists every recipe, most recently changed first", async () => {
    await renderAt("/mock/list");

    expect(titles()).toHaveLength(9);
    expect(titles().slice(0, 3)).toEqual(["Chocolate Chip Pan Cookies", "Meat Loaf", "Pancakes"]);
    expect(screen.getByRole("heading", { level: 1, name: "All recipes" })).toBeTruthy();
    expect(screen.getByText("9 recipes")).toBeTruthy();
  });

  it("shows a row's time and tags, and a photo where the recipe has one", async () => {
    await renderAt("/mock/list");

    const row = screen.getByText("Roast Chicken with Lemon and Thyme").closest("li");
    expect(row?.querySelector("[data-testid=recipe-meta]")?.textContent).toBe(
      "1 hr 55 min · Dinner · Family favorite, Holiday",
    );
    expect(row?.querySelector("img")).toBeTruthy();
    // A photo row keeps its category's colour as a band, the way a selected divider does.
    expect(row?.querySelector("img + span")?.className).toContain("bg-stock-salmon");
    // Most recipes come from paper and have no photo: they get a letter tile.
    expect(screen.getByText("Meat Loaf").closest("li")?.querySelector("img")).toBeNull();
  });

  it("keeps a phone's line short by leaving the category to the colour, and still reads it out", async () => {
    await renderAt("/mock/list");

    const row = screen.getByText("Cardamom Sugar Cookies").closest("li");
    const phone = row?.querySelector("[data-testid=recipe-meta-phone]");
    expect(phone?.textContent).toBe("30 min · From Aunt June · Holiday, Family favorite");
    expect(phone?.className).toContain("truncate");
    expect(row?.querySelector(".sr-only")?.textContent).toBe("Dessert");

    // A row with little to say keeps its category in words at every width.
    const plain = screen.getByText("Meat Loaf").closest("li");
    expect(plain?.querySelector("[data-testid=recipe-meta]")?.textContent).toBe("25 min · Dinner");
    expect(plain?.querySelector("[data-testid=recipe-meta-phone]")).toBeNull();
  });

  it("follows the search box after a short pause and keeps the search in the address", async () => {
    const { router } = await renderAt("/mock/list");

    type("choc");
    expect(titles()).toHaveLength(9);

    await waitFor(() => expect(titles()).toEqual(["Chocolate Chip Pan Cookies"]));
    expect(router.state.location.search).toEqual({ q: "choc" });
    expect(screen.getByText("1 of 9")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement).value).toBe(
      "match",
    );
  });

  it("restores a search from the address", async () => {
    await renderAt("/mock/list?q=lentil");
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("lentil");
    expect(titles()).toEqual(["Lemony Red Lentil Soup"]);
  });

  it("clears the search from the button in the box", async () => {
    await renderAt("/mock/list?q=lentil");
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    await waitFor(() => expect(titles()).toHaveLength(9));
  });

  it("shows a category behind its divider and does not repeat its name on each row", async () => {
    const { router } = await renderAt("/mock/list");

    fireEvent.click(screen.getByRole("tab", { name: "Dessert" }));

    await waitFor(() =>
      expect(titles()).toEqual(["Chocolate Chip Pan Cookies", "Cardamom Sugar Cookies"]),
    );
    expect(router.state.location.search).toEqual({ category: "dessert" });
    expect(screen.getByRole("heading", { level: 1, name: "Dessert" })).toBeTruthy();
    const meta = screen.getAllByTestId("recipe-meta").map((line) => line.textContent);
    expect(meta).toEqual(["20 min", "30 min · From Aunt June · Holiday, Family favorite"]);
  });

  it("narrows with every filter chosen, and says how many recipes are left", async () => {
    const { router } = await renderAt("/mock/list");

    openFilters();
    expect(sheet().getByText(/must match everything you choose/)).toBeTruthy();
    fireEvent.click(sheet().getByRole("button", { name: "Weeknight" }));
    // The list behind a modal is not read out, so the sheet announces the count itself.
    await waitFor(() => expect(sheet().getByRole("status").textContent).toBe("2 recipes match"));
    await waitFor(() =>
      expect(sheet().getByRole("button", { name: "Show 2 recipes" })).toBeTruthy(),
    );
    expect(sheet().getByRole("button", { name: "Weeknight" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    fireEvent.click(sheet().getByRole("button", { name: "Dutch oven" }));
    await waitFor(() =>
      expect(sheet().getByRole("button", { name: "Show 1 recipe" })).toBeTruthy(),
    );
    fireEvent.click(sheet().getByRole("button", { name: "Show 1 recipe" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(titles()).toEqual(["Sunday Beef and Bean Chili"]);
    expect(router.state.location.search).toEqual({ tags: "weeknight", tools: "dutch-oven" });
    expect(screen.getByRole("button", { name: "Filters: 2" })).toBeTruthy();
  });

  it("shows the filters in use and takes one off when it is pressed", async () => {
    await renderAt("/mock/list?tags=weeknight&tools=dutch-oven");

    const inUse = within(screen.getByRole("list", { name: "Filters in use" }));
    expect(inUse.getAllByRole("button").map((chip) => chip.textContent)).toEqual([
      "Weeknight",
      "Dutch oven",
    ]);

    fireEvent.click(inUse.getByRole("button", { name: "Remove filter: Dutch oven" }));
    await waitFor(() =>
      expect(titles()).toEqual(["Lemony Red Lentil Soup", "Sunday Beef and Bean Chili"]),
    );
  });

  it("filters by a food, found by typing when it is not among the most used", async () => {
    await renderAt("/mock/list");

    openFilters();
    expect(sheet().queryByRole("button", { name: "red lentils" })).toBeNull();
    fireEvent.change(sheet().getByLabelText("Find a food"), { target: { value: "lentil" } });
    fireEvent.click(sheet().getByRole("button", { name: "red lentils" }));

    await waitFor(() =>
      expect(sheet().getByRole("button", { name: "Show 1 recipe" })).toBeTruthy(),
    );
    fireEvent.click(sheet().getByRole("button", { name: "Close" }));
    expect(titles()).toEqual(["Lemony Red Lentil Soup"]);
  });

  it("sorts by title and by newest", async () => {
    await renderAt("/mock/list");
    const sort = screen.getByRole("combobox", { name: "Sort by" });
    expect(within(sort).queryByRole("option", { name: "Best match" })).toBeNull();

    fireEvent.change(sort, { target: { value: "title" } });
    await waitFor(() => expect(titles()[0]).toBe("Buttermilk Pancakes"));
    expect(titles().at(-1)).toBe("Sunday Beef and Bean Chili");

    fireEvent.change(sort, { target: { value: "newest" } });
    await waitFor(() => expect(titles()[0]).toBe("Chocolate Chip Pan Cookies"));
    expect(titles().at(-1)).toBe("Buttermilk Pancakes");
  });

  it("says what was asked for when nothing matches, and clears it all with one button", async () => {
    const { router } = await renderAt("/mock/list?q=zucchini&tags=holiday");

    expect(screen.getByRole("heading", { name: "No recipes match" })).toBeTruthy();
    expect(screen.getByText("Nothing matches “zucchini” with that filter.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
    await waitFor(() => expect(titles()).toHaveLength(9));
    expect(router.state.location.search).toEqual({});
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });
});

describe("the list's other states", () => {
  it("shows rows in outline while recipes load", async () => {
    await renderAt("/mock/list?scene=loading");
    expect(screen.getAllByTestId("recipe-row-skeleton")).toHaveLength(6);
    expect(screen.getByText("Loading recipes")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Recipes" })).toBeNull();
  });

  it("offers both ways to start on the first run, and no search or filters", async () => {
    await renderAt("/mock/list?scene=first-run");

    expect(screen.getByRole("heading", { name: "No recipes yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Type a recipe" }).getAttribute("href")).toBe(
      "/mock/add",
    );
    expect(screen.getByRole("link", { name: "Import from a link" }).getAttribute("href")).toBe(
      "/mock/add",
    );
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Filter/ })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("says so when offline, and still lists the recipes", async () => {
    await renderAt("/mock/list?scene=offline");
    expect(screen.getByText(/You are offline/)).toBeTruthy();
    expect(titles()).toHaveLength(9);
  });

  it("shows imports above the recipes: one being read, one to review, one that failed", async () => {
    await renderAt("/mock/list?scene=imports");

    const imports = within(screen.getByRole("list", { name: "Imports" }));
    const rows = imports.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows[0]).toContain("baking.example.com");
    expect(rows[0]).toContain("Reading the page…");
    expect(rows[1]).toContain("Skillet Cornbread");
    expect(rows[1]).toContain("Ready to review · recipes.example.com");
    expect(rows[1]).not.toContain("blocked");
    expect(rows[2]).toContain(
      "Could not import. The site blocked the request. Trying again sometimes works.",
    );

    expect(imports.getByRole("button", { name: "Review" })).toBeTruthy();
    expect(imports.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(imports.getByRole("button", { name: "Remove" })).toBeTruthy();
    expect(titles()).toHaveLength(9);
  });

  it("puts imports aside while the list is narrowed", async () => {
    await renderAt("/mock/list?scene=imports&q=soup");
    expect(screen.queryByRole("list", { name: "Imports" })).toBeNull();
  });

  it("keeps the navigation among the mock screens", async () => {
    await renderAt("/mock/list");
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getByRole("link", { name: "Recipes" }).getAttribute("aria-current")).toBe("page");
    expect(nav.getByRole("link", { name: "Add" }).getAttribute("href")).toBe("/mock/add");
  });
});

describe("adding a recipe", () => {
  it("asks for a link before importing", async () => {
    await renderAt("/mock/add");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Paste the address of a recipe page first.");
    // A problem is never words alone: the band carries a warning icon.
    expect(alert.querySelector("svg")).toBeTruthy();
  });

  it("refuses text that is not a web address", async () => {
    await renderAt("/mock/add");
    const box = screen.getByLabelText("Recipe page address");
    fireEvent.change(box, { target: { value: "pancakes" } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByRole("alert").textContent).toContain("does not look like a web address");
    expect(box.getAttribute("aria-invalid")).toBe("true");
  });

  it("takes a link and shows the import as a row at the top of the list", async () => {
    const { router } = await renderAt("/mock/add");
    fireEvent.change(screen.getByLabelText("Recipe page address"), {
      target: { value: "https://recipes.example.com/skillet-cornbread" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/mock/list"));
    expect(await screen.findByRole("list", { name: "Imports" })).toBeTruthy();
  });

  it("turns both ways off when offline, and says why", async () => {
    await renderAt("/mock/add?scene=offline");
    expect(screen.getByText(/Adding and importing need a connection/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Type a recipe" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Import" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
