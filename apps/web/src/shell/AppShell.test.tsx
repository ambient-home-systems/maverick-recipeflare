import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAt } from "../test-utils";

afterEach(cleanup);

describe("the app shell", () => {
  it("offers the three destinations in the main navigation", async () => {
    await renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    const names = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(names).toEqual(["Recipeflare", "Recipes", "Add", "Manage"]);
  });

  it("marks the page the visitor is on", async () => {
    await renderAt("/manage");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Manage" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Recipes" }).hasAttribute("aria-current")).toBe(
      false,
    );
  });

  it("keeps Recipes current only on the list itself", async () => {
    await renderAt("/mock/tokens");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).queryByRole("link", { current: "page" })).toBeNull();
  });

  it("has one main region that a skip link leads to", async () => {
    await renderAt("/");
    expect(screen.getByRole("main").id).toBe("page");
    expect(screen.getByRole("link", { name: "Skip to the page" }).getAttribute("href")).toBe(
      "#page",
    );
  });

  it("shows the first-run state when there are no recipes", async () => {
    await renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: "Recipes" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No recipes yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add a recipe" }).getAttribute("href")).toBe("/add");
  });

  it("says so when an address leads nowhere", async () => {
    await renderAt("/no/such/page");
    expect(screen.getByRole("heading", { name: "There is no page here" })).toBeTruthy();
  });
});
