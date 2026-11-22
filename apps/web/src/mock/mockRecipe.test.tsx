import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAt } from "../test-utils";

afterEach(cleanup);

const CHILI = "/mock/recipe/sunday-beef-and-bean-chili";
const CHICKEN = "/mock/recipe/roast-chicken-with-lemon-and-thyme";
const COOKIES = "/mock/recipe/cardamom-sugar-cookies";
const LENTIL = "/mock/recipe/lemony-red-lentil-soup";
const TOAST = "/mock/recipe/cinnamon-toast";

const ingredients = () => within(screen.getByRole("region", { name: "Ingredients" }));
const steps = () => within(screen.getByRole("region", { name: "Steps" }));
const lines = () =>
  ingredients()
    .getAllByRole("listitem")
    .map((item) => item.textContent);
const facts = () =>
  Object.fromEntries(
    within(screen.getByLabelText("At a glance"))
      .getAllByRole("term")
      // A number is tied to its unit with a non-breaking space; read it as a plain one.
      .map((term) => [
        term.textContent,
        term.nextElementSibling?.textContent?.replace(/\u00a0/g, " "),
      ]),
  );

describe("the recipe view", () => {
  it("shows a long recipe whole: 25 ingredients and 15 steps", async () => {
    await renderAt(CHILI);

    expect(
      screen.getByRole("heading", { level: 1, name: "Sunday Beef and Bean Chili" }),
    ).toBeTruthy();
    expect(lines()).toHaveLength(25);
    expect(steps().getAllByRole("listitem")).toHaveLength(15);
    expect(facts()).toEqual({
      Prep: "30 min",
      Cook: "2 hr",
      Total: "2 hr 30 min",
      Serves: "8",
      Makes: "3 quarts",
    });
  });

  it("stands the recipe behind its category's divider, which leads back to the list", async () => {
    await renderAt(CHILI);
    const dividers = within(screen.getByRole("navigation", { name: "Filed under" }));

    expect(dividers.getByRole("link", { name: "All recipes" }).getAttribute("href")).toBe(
      "/mock/list",
    );
    const dinner = dividers.getByRole("link", { name: "Dinner" });
    expect(dinner.getAttribute("href")).toBe("/mock/list?category=dinner");
    // The same stock as Dinner's divider and tiles on the list.
    expect(dinner.className).toContain("bg-stock-salmon");
  });

  it("groups ingredients and steps by section, and numbers each section's steps from 1", async () => {
    await renderAt(CHICKEN);

    expect(ingredients().getByRole("heading", { level: 3, name: "For the gravy" })).toBeTruthy();
    expect(steps().getByRole("heading", { level: 3, name: "Make the gravy" })).toBeTruthy();
    const numbers = steps()
      .getAllByRole("listitem")
      .map((item) => item.querySelector("[aria-hidden]")?.textContent);
    expect(numbers).toEqual(["1", "2", "3", "4", "1", "2", "3"]);
  });

  it("writes a parsed line from its fields and a free-text line as it was typed", async () => {
    await renderAt(LENTIL);
    expect(lines()).toContain("2 tbsp olive oil");
    expect(lines()).toContain("6 cups water or vegetable stock");
    expect(lines()).toContain("Salt, pepper and a pinch of chili flakes");
  });

  it("doubles the amounts, the servings and the yield, and keeps the scale in the address", async () => {
    const { router } = await renderAt(CHILI);
    expect(lines()[0]).toBe("2 tbsp olive oil");

    fireEvent.click(screen.getByRole("radio", { name: "Double" }));

    await waitFor(() => expect(lines()[0]).toBe("4 tbsp olive oil"));
    expect(router.state.location.search).toEqual({ scale: 2 });
    expect(facts().Serves).toBe("16");
    expect(facts().Makes).toBe("6 quarts");
    expect(facts().Cook).toBe("2 hr");
    // The chili has one line with no amount ("Lime wedges and a handful of cilantro").
    expect(ingredients().getByRole("status").textContent).toBe(
      "Doubled. 1 line is shown as written and was not changed; work that one out yourself. Amounts in the steps are not changed.",
    );
  });

  it("halves into fractions a cook would recognise", async () => {
    await renderAt(`${COOKIES}?scale=0.5`);
    expect((screen.getByRole("radio", { name: "Half" }) as HTMLInputElement).checked).toBe(true);
    // Every line of the cookies has an amount, so the note mentions no unscaled lines.
    expect(ingredients().getByRole("status").textContent).toBe(
      "Halved. Amounts in the steps are not changed.",
    );
    expect(lines()).toContain("¼ tsp baking powder");
    expect(facts().Makes).toBe("18 cookies");
  });

  it("marks a line with no amount as written when the recipe is scaled, and not otherwise", async () => {
    await renderAt(LENTIL);
    expect(ingredients().queryByText("as written")).toBeNull();
    cleanup();

    await renderAt(`${LENTIL}?scale=2`);
    expect(lines()).toContain("6 cups water or vegetable stockas written");
    expect(lines()).toContain("4 tbsp olive oil");
    expect(ingredients().getAllByText("as written")).toHaveLength(3);
    // The note counts them, and does not claim they have no amount: one says "6 cups".
    expect(ingredients().getByRole("status").textContent).toBe(
      "Doubled. 3 lines are shown as written and were not changed; work those out yourself. Amounts in the steps are not changed.",
    );
  });

  it("credits who the recipe is from and links to where it came from", async () => {
    await renderAt(LENTIL);
    expect(screen.getByText("Example Kitchen")).toBeTruthy();
    const link = screen.getByRole("link", { name: /example\.com/ });
    expect(link.getAttribute("href")).toBe("https://example.com/recipes/lemony-red-lentil-soup");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("opens the original card full screen and steps through its sides", async () => {
    await renderAt(COOKIES);
    expect(screen.getByText("Aunt June")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Original card/ }));
    const viewer = within(screen.getByRole("dialog", { name: /Original card/ }));
    expect(viewer.getByRole("heading").textContent).toBe("Original card · 1 of 2");
    expect(viewer.getByRole("img").getAttribute("alt")).toBe(
      "The original card for Cardamom Sugar Cookies, 1 of 2",
    );
    // Spent, but still focusable, so the arrow keys keep working from it.
    const previous = viewer.getByRole("button", { name: "Previous" });
    expect(previous.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(previous);
    expect(viewer.getByRole("heading").textContent).toBe("Original card · 1 of 2");

    fireEvent.click(viewer.getByRole("button", { name: "Next" }));
    expect(viewer.getByRole("heading").textContent).toBe("Original card · 2 of 2");
    fireEvent.keyDown(viewer.getByRole("button", { name: "Next" }), { key: "ArrowLeft" });
    expect(viewer.getByRole("heading").textContent).toBe("Original card · 1 of 2");
    fireEvent.keyDown(viewer.getByRole("button", { name: "Previous" }), { key: "ArrowRight" });
    expect(viewer.getByRole("heading").textContent).toBe("Original card · 2 of 2");

    fireEvent.click(viewer.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a recipe's photos the same way", async () => {
    await renderAt(CHICKEN);
    fireEvent.click(screen.getByRole("button", { name: /Photos.*2 photos/ }));
    expect(screen.getByRole("dialog", { name: /Photos/ })).toBeTruthy();
  });

  it("shows notes, and nutrition folded away until it is asked for", async () => {
    await renderAt(CHILI);

    const notes = within(screen.getByRole("region", { name: "Notes" }));
    expect(notes.getByRole("heading", { level: 3, name: "Freezing" })).toBeTruthy();

    const nutrition = screen.getByText("Nutrition").closest("details");
    expect(nutrition?.open).toBe(false);
    expect(within(nutrition as HTMLElement).getAllByRole("term")).toHaveLength(6);
  });

  it("lists tags and tools as filters that open the list narrowed to them", async () => {
    await renderAt(CHILI);
    expect(screen.getByRole("link", { name: "Freezes well" }).getAttribute("href")).toBe(
      "/mock/list?tags=freezes-well",
    );
    expect(screen.getByRole("link", { name: "Dutch oven" }).getAttribute("href")).toBe(
      "/mock/list?tools=dutch-oven",
    );
  });

  it("offers Cook as the main action, with Edit beside it", async () => {
    await renderAt(CHILI);
    expect(screen.getByRole("button", { name: "Cook" }).className).toContain("bg-primary");
    expect(screen.getByRole("button", { name: "Edit" }).className).not.toContain("bg-primary");
  });

  it("sets each line's amount heavier than the rest of the line", async () => {
    await renderAt(CHILI);
    const first = ingredients().getAllByRole("listitem")[0];
    expect(first?.querySelector(".font-semibold")?.textContent).toBe("2 tbsp");
    expect(first?.textContent).toBe("2 tbsp olive oil");
  });

  it("names the recipe and its photos before deleting, and deletes only on the second press", async () => {
    const { router } = await renderAt(COOKIES);

    fireEvent.click(screen.getByRole("button", { name: "Delete recipe" }));
    const sheet = within(screen.getByRole("dialog", { name: "Delete this recipe?" }));
    expect(sheet.getByText(/and its photos will be deleted/)).toBeTruthy();
    expect(sheet.getByText("Cardamom Sugar Cookies")).toBeTruthy();

    fireEvent.click(sheet.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(router.state.location.pathname).toBe(COOKIES);

    fireEvent.click(screen.getByRole("button", { name: "Delete recipe" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete recipe" }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/mock/list"));
  });
});

describe("the recipe view's other states", () => {
  it("shows a recipe that is only a title, with Edit and nothing to cook", async () => {
    await renderAt(TOAST);

    expect(screen.getByRole("heading", { level: 1, name: "Cinnamon Toast" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Only a title so far" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Ingredients" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cook" })).toBeNull();
    // With nothing to cook from, Edit is the screen's main action.
    expect(screen.getByRole("button", { name: "Edit" }).className).toContain("bg-primary");
    // With no category it stands behind "All recipes" alone.
    expect(
      within(screen.getByRole("navigation", { name: "Filed under" })).getAllByRole("link"),
    ).toHaveLength(1);
  });

  it("shows lines in outline while the recipe loads", async () => {
    await renderAt(`${CHILI}?scene=loading`);
    expect(screen.getByTestId("recipe-skeleton")).toBeTruthy();
    expect(screen.getByText("Loading the recipe")).toBeTruthy();
  });

  it("says so when the address leads to no recipe, and leads back to the list", async () => {
    await renderAt("/mock/recipe/no-such-recipe");
    expect(screen.getByRole("heading", { name: "This recipe is not here" })).toBeTruthy();
    expect(
      within(screen.getByRole("main"))
        .getAllByRole("link", { name: "All recipes" })
        .every((link) => link.getAttribute("href") === "/mock/list"),
    ).toBe(true);
  });

  it("says so when the recipe could not be loaded, and offers to try again", async () => {
    await renderAt(`${CHILI}?scene=error`);
    expect(screen.getByRole("alert").textContent).toBe("The recipe could not be loaded.");
    // Said once: the notice is not followed by a second, vaguer heading.
    expect(screen.queryByRole("heading", { name: "Something went wrong" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Ingredients" })).toBeTruthy();
  });

  it("stays readable and cookable offline, with editing and deleting turned off", async () => {
    await renderAt(`${CHILI}?scene=offline`);

    expect(screen.getByText(/You are offline/)).toBeTruthy();
    expect(lines()).toHaveLength(25);
    expect((screen.getByRole("button", { name: "Cook" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((screen.getByRole("button", { name: "Edit" }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Delete recipe" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("is reached from its row on the list, and keeps Recipes marked in the navigation", async () => {
    const { router } = await renderAt("/mock/list");

    const row = screen.getByRole("link", { name: /Meat Loaf/ });
    expect(row.getAttribute("href")).toBe("/mock/recipe/meat-loaf");
    fireEvent.click(row);

    expect(await screen.findByRole("heading", { level: 1, name: "Meat Loaf" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/mock/recipe/meat-loaf");
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getByRole("link", { name: "Recipes" }).getAttribute("aria-current")).toBe("page");
  });
});
