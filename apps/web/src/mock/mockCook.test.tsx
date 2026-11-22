import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-utils";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const CHICKEN = "/mock/cook/roast-chicken-with-lemon-and-thyme";
const CHILI = "/mock/cook/sunday-beef-and-bean-chili";
const LENTIL = "/mock/cook/lemony-red-lentil-soup";

const progress = () => screen.getAllByRole("status")[0]?.textContent;
const step = (name: RegExp) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const column = () => within(screen.getByRole("complementary", { name: "Ingredients" }));
const openIngredients = () => fireEvent.click(screen.getByRole("button", { name: /^Ingredients/ }));
const sheet = () => within(screen.getByRole("dialog", { name: "Ingredients" }));

describe("cook mode", () => {
  it("fills the screen: the recipe's title, Done, and no navigation", async () => {
    await renderAt(CHICKEN);

    expect(
      screen.getByRole("heading", { level: 1, name: "Roast Chicken with Lemon and Thyme" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Skip to the page" })).toBeNull();
  });

  it("sets the steps to come in the large cooking size", async () => {
    await renderAt(CHICKEN);
    const row = step(/^Step 1\. Heat the oven/).closest("label");
    expect(row?.querySelector(".text-cook")).toBeTruthy();
  });

  it("ticks a step off, counts it overall and in its section, and steps it back without hiding it", async () => {
    await renderAt(CHICKEN);
    expect(progress()).toBe("0 of 7 steps done");

    fireEvent.click(step(/^Step 1\. Heat the oven/));

    expect(progress()).toBe("1 of 7 steps done");
    expect(screen.getByRole("heading", { level: 2, name: /Roast/ }).textContent).toBe(
      "Roast1 of 4",
    );
    const row = step(/^Step 1\. Heat the oven/).closest("label");
    // Still there and still readable: smaller, on the sunk ground, never faded.
    expect(row?.className).toContain("bg-surface-sunk");
    expect(row?.querySelector(".text-cook")).toBeNull();
    expect(row?.className).not.toMatch(/opacity/);
  });

  it("unticks a step that was ticked by mistake", async () => {
    await renderAt(CHICKEN);
    fireEvent.click(step(/^Step 1\. Heat the oven/));
    fireEvent.click(step(/^Step 1\. Heat the oven/));
    expect(progress()).toBe("0 of 7 steps done");
  });

  it("numbers each section's steps from 1", async () => {
    await renderAt(CHICKEN);
    expect(step(/^Step 1\. Pour off all but/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /Make the gravy/ }).textContent).toBe(
      "Make the gravy0 of 3",
    );
  });

  it("says so when every step is done", async () => {
    await renderAt(CHICKEN);
    for (const box of screen.getAllByRole("checkbox", { name: /^Step/ })) {
      fireEvent.click(box);
    }
    expect(progress()).toBe("7 of 7 steps done");
    expect(screen.getByText("All 7 steps done.")).toBeTruthy();
  });

  it("keeps the ticks on the device, so they are still there after leaving and coming back", async () => {
    await renderAt(CHICKEN);
    fireEvent.click(step(/^Step 1\. Heat the oven/));
    fireEvent.click(step(/^Step 2\. Stuff the cavity/));
    await waitFor(() => expect(window.localStorage.length).toBe(1));
    cleanup();

    await renderAt(CHICKEN);
    expect(progress()).toBe("2 of 7 steps done");
    expect(step(/^Step 2\. Stuff the cavity/).checked).toBe(true);
  });

  it("keeps each recipe's ticks apart", async () => {
    await renderAt(CHICKEN);
    fireEvent.click(step(/^Step 1\. Heat the oven/));
    await waitFor(() => expect(window.localStorage.length).toBe(1));
    cleanup();

    await renderAt(CHILI);
    expect(progress()).toBe("0 of 15 steps done");
  });

  it("clears the ticks and returns to the recipe on Done", async () => {
    const { router } = await renderAt(CHICKEN);
    fireEvent.click(step(/^Step 1\. Heat the oven/));
    await waitFor(() => expect(window.localStorage.length).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        "/mock/recipe/roast-chicken-with-lemon-and-thyme",
      ),
    );
    cleanup();

    await renderAt(CHICKEN);
    expect(progress()).toBe("0 of 7 steps done");
  });
});

describe("ingredients in cook mode", () => {
  it("are reached from a bar that is there whichever step is on screen", async () => {
    await renderAt(CHICKEN);
    const bar = screen.getByRole("button", { name: /^Ingredients/ });
    expect(bar.textContent).toContain("0 of 9 out");

    openIngredients();
    fireEvent.click(sheet().getByRole("checkbox", { name: /1 whole chicken/ }));
    fireEvent.click(sheet().getByRole("button", { name: "Back to the steps" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /^Ingredients/ }).textContent).toContain(
      "1 of 9 out",
    );
  });

  it("are a column beside the steps as well, for a tablet on its side", async () => {
    await renderAt(CHICKEN);
    expect(column().getAllByRole("checkbox")).toHaveLength(9);
    expect(column().getByRole("heading", { level: 3, name: "For the gravy" })).toBeTruthy();
  });

  it("doubles the amounts, keeps a line as written, and says the steps are not changed", async () => {
    await renderAt(LENTIL);
    expect(column().getByRole("checkbox", { name: "2 tbsp olive oil" })).toBeTruthy();

    fireEvent.click(column().getByRole("radio", { name: "Double" }));

    expect(column().getByRole("checkbox", { name: "4 tbsp olive oil" })).toBeTruthy();
    expect(
      column().getByRole("checkbox", { name: /6 cups water or vegetable stock.*as written/ }),
    ).toBeTruthy();
    expect(column().getByRole("status").textContent).toBe(
      "Doubled. 3 lines are shown as written and were not changed. Amounts in the steps are not changed.",
    );
    expect(screen.getByRole("button", { name: /^Ingredients/ }).textContent).toContain("at 2×");
  });

  it("scales to a number of servings when the recipe says how many it serves", async () => {
    await renderAt(CHILI);
    const serves = column().getByLabelText("Serves") as HTMLInputElement;
    expect(serves.value).toBe("8");

    fireEvent.change(serves, { target: { value: "12" } });

    expect(column().getByRole("checkbox", { name: "3 tbsp olive oil" })).toBeTruthy();
    // One and a half times is none of the four, so none is chosen and the note names it.
    expect(
      column()
        .getAllByRole("radio")
        .some((radio) => (radio as HTMLInputElement).checked),
    ).toBe(false);
    expect(column().getByRole("status").textContent).toContain("Scaled to 1½ times.");
  });

  it("follows the four-way switch in the servings box", async () => {
    await renderAt(CHILI);
    fireEvent.click(column().getByRole("radio", { name: "Half" }));
    expect((column().getByLabelText("Serves") as HTMLInputElement).value).toBe("4");
  });

  it("has no servings box for a recipe that does not say how many it serves", async () => {
    await renderAt("/mock/cook/meat-loaf");
    expect(column().queryByLabelText("Serves")).toBeNull();
  });

  it("starts at the scale chosen on the recipe, and keeps it on the device", async () => {
    await renderAt(`${LENTIL}?scale=2`);
    expect(column().getByRole("checkbox", { name: "4 tbsp olive oil" })).toBeTruthy();
    await waitFor(() => expect(window.localStorage.length).toBe(1));
    cleanup();

    await renderAt(LENTIL);
    expect(column().getByRole("checkbox", { name: "4 tbsp olive oil" })).toBeTruthy();
  });
});

describe("cook mode and the device", () => {
  it("says the screen stays on when the browser keeps it on", async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({ release }));
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { wakeLock: { request } }));

    await renderAt(CHICKEN);

    expect(await screen.findByText("Screen stays on")).toBeTruthy();
    expect(request).toHaveBeenCalledWith("screen");
    expect(screen.queryByText(/cannot keep the screen on/)).toBeNull();
  });

  it("says once when the browser cannot keep the screen on, and then only in the header", async () => {
    await renderAt(CHICKEN);
    expect(screen.getByText("Screen may turn off")).toBeTruthy();
    expect(screen.getByText(/This browser cannot keep the screen on/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText(/This browser cannot keep the screen on/)).toBeNull();
    cleanup();

    await renderAt(CHILI);
    expect(screen.queryByText(/This browser cannot keep the screen on/)).toBeNull();
    expect(screen.getByText("Screen may turn off")).toBeTruthy();
  });

  it("carries on offline, and says where the recipe is coming from", async () => {
    await renderAt(`${CHICKEN}?scene=offline`);
    expect(screen.getByText(/You are offline\. Cooking carries on/)).toBeTruthy();
    fireEvent.click(step(/^Step 1\. Heat the oven/));
    expect(progress()).toBe("1 of 7 steps done");
  });

  it("carries on when the sign-in has run out, and offers to sign in again", async () => {
    await renderAt(`${CHICKEN}?scene=signed-out`);
    expect(screen.getByText(/You are signed out\. Cooking carries on/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeTruthy();
    fireEvent.click(step(/^Step 1\. Heat the oven/));
    expect(progress()).toBe("1 of 7 steps done");
  });

  it("is opened with Cook on the recipe, at the scale the recipe was showing", async () => {
    const { router } = await renderAt("/mock/recipe/lemony-red-lentil-soup?scale=2");
    fireEvent.click(screen.getByRole("button", { name: "Cook" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/mock/cook/lemony-red-lentil-soup"),
    );
    expect(await screen.findByRole("checkbox", { name: "4 tbsp olive oil" })).toBeTruthy();
  });
});
