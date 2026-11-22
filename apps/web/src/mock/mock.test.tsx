import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-utils";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const rowTitles = () =>
  within(screen.getByRole("tabpanel"))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("span.block")?.textContent);

describe("the mock index", () => {
  it("links to the screens that are drawn and lists the ones that are not", async () => {
    stubFetch(Response.json({ status: "ok" }));
    await renderAt("/mock");

    expect(screen.getByRole("link", { name: /Tokens/ }).getAttribute("href")).toBe("/mock/tokens");
    expect(screen.getByRole("link", { name: /Fixture recipes/ }).getAttribute("href")).toBe(
      "/mock/fixtures",
    );
    expect(screen.getByRole("link", { name: /Recipe list and search/ }).getAttribute("href")).toBe(
      "/mock/list",
    );
    expect(screen.getByRole("link", { name: /Recipe view/ }).getAttribute("href")).toBe(
      "/mock/recipe/sunday-beef-and-bean-chili",
    );
    expect(screen.getByRole("link", { name: /Reviewing an import/ }).getAttribute("href")).toBe(
      "/mock/review",
    );
    expect(screen.getByRole("link", { name: /Cook mode/ }).getAttribute("href")).toBe(
      "/mock/cook/roast-chicken-with-lemon-and-thyme",
    );
    // All four core screens are drawn.
    expect(screen.queryByText("Not drawn yet.")).toBeNull();
  });

  it("reports that the API is reachable", async () => {
    const fetchMock = stubFetch(Response.json({ status: "ok" }));
    await renderAt("/mock");

    expect(await screen.findByText("The API is reachable.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/health", expect.anything());
  });

  it("reports that the API is not reachable when the request fails", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    await renderAt("/mock");
    expect(await screen.findByText("The API is not reachable.")).toBeTruthy();
  });

  it("reports that the API is not reachable when the body has the wrong shape", async () => {
    stubFetch(Response.json({ status: "degraded" }));
    await renderAt("/mock");
    expect(await screen.findByText("The API is not reachable.")).toBeTruthy();
  });

  it("switches the theme and remembers the choice", async () => {
    stubFetch(Response.json({ status: "ok" }));
    await renderAt("/mock");

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("recipeflare:theme")).toBe("dark");

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");

    fireEvent.click(screen.getByRole("radio", { name: "Device" }));
    expect(window.localStorage.getItem("recipeflare:theme")).toBeNull();
  });
});

describe("the fixture recipes screen", () => {
  it("lists all nine fixture recipes, most recently changed first", async () => {
    await renderAt("/mock/fixtures");

    const titles = rowTitles();
    expect(titles).toHaveLength(9);
    expect(titles.slice(0, 3)).toEqual(["Chocolate Chip Pan Cookies", "Meat Loaf", "Pancakes"]);
    expect(screen.getByText("9 sample recipes")).toBeTruthy();
  });

  it("sets a recipe's tag in a heavier weight, and nothing else on the line", async () => {
    await renderAt("/mock/fixtures");
    const line = screen
      .getAllByTestId("recipe-meta")
      .find((meta) => meta.textContent === "25 min · Breakfast · Family favorite");
    const strong = [...(line?.querySelectorAll(".font-semibold") ?? [])].map((s) => s.textContent);
    expect(strong).toEqual([" · Family favorite"]);
  });

  it("has a divider for All and for each category", async () => {
    await renderAt("/mock/fixtures");
    const tabs = within(screen.getByRole("tablist", { name: "Categories" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "All",
      "Breakfast",
      "Dinner",
      "Dessert",
      "Soup",
    ]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("shows only a category's recipes behind its divider", async () => {
    await renderAt("/mock/fixtures");

    fireEvent.click(screen.getByRole("tab", { name: "Dessert" }));

    expect(rowTitles()).toEqual(["Chocolate Chip Pan Cookies", "Cardamom Sugar Cookies"]);
    expect(screen.getByRole("heading", { level: 1, name: "Dessert" })).toBeTruthy();
    expect(screen.getByText("2 sample recipes")).toBeTruthy();
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      screen.getByRole("tab", { name: "Dessert" }).id,
    );
  });

  it("moves between dividers with the arrow keys", async () => {
    await renderAt("/mock/fixtures");

    fireEvent.keyDown(screen.getByRole("tab", { name: "All" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Breakfast" }).getAttribute("aria-selected")).toBe(
      "true",
    );

    fireEvent.keyDown(screen.getByRole("tab", { name: "Breakfast" }), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("tab", { name: "All" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Soup" }).getAttribute("aria-selected")).toBe("true");
  });

  it("credits a recipe's source on its row", async () => {
    await renderAt("/mock/fixtures");
    const metaLines = screen.getAllByTestId("recipe-meta").map((line) => line.textContent);
    expect(metaLines).toContain("30 min · Dessert · From Aunt June · Holiday, Family favorite");
    expect(metaLines).toContain("40 min · Soup · From Example Kitchen · Vegetarian, Weeknight");
  });
});

describe("the specimen screens", () => {
  it("draws the tokens in named groups", async () => {
    await renderAt("/mock/tokens");
    for (const name of ["Ink and surfaces", "Rules", "Divider stock", "States", "Type"]) {
      expect(screen.getByRole("heading", { level: 1, name })).toBeTruthy();
    }
  });

  it("shows each button in its working and unavailable states", async () => {
    await renderAt("/mock/components");

    expect(screen.getByRole("button", { name: "Add a recipe" })).toBeTruthy();
    const busy = screen.getByRole("button", { name: "Working…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("could not be saved");
    expect(screen.getByRole("status").textContent).toContain("You are offline");
    // Delete is a quiet button told apart by its words, not by a red outline.
    expect(screen.getByRole("button", { name: "Delete" }).className).not.toContain("red");
    expect(screen.getAllByTestId("recipe-row-skeleton")).toHaveLength(2);
  });
});
