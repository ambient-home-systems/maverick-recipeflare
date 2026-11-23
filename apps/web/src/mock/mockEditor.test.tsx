import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAt } from "../test-utils";

afterEach(cleanup);

const COOKIES = "/mock/edit/chocolate-chip-pan-cookies";
const CHICKEN = "/mock/edit/roast-chicken-with-lemon-and-thyme";

const ingredientRows = () =>
  within(screen.getByRole("list", { name: "Ingredient lines" })).getAllByRole("listitem");
const stepRows = () => within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
// What the app read in a line: its parts, and any mark such as "new" or "as written".
const read = (row: HTMLElement) =>
  [...(row.querySelector("[data-testid=line-read]")?.querySelectorAll(".font-semibold") ?? [])]
    .map((part) => part.textContent)
    .join(" · ");
/** A row's button is named by what it does and then everything the row shows. */
const startsWith = (text: string) => (name: string) => name.startsWith(text);
const rowOf = (text: string) =>
  screen.getByRole("button", { name: startsWith(`Edit ${text}`) }).closest("li");
const typeLine = (text: string) => {
  const entry = screen.getByLabelText("Add an ingredient");
  fireEvent.change(entry, { target: { value: text } });
  fireEvent.keyDown(entry, { key: "Enter" });
};
const sheet = (name: string | RegExp) => within(screen.getByRole("dialog", { name }));

describe("typing a new recipe", () => {
  it("starts empty, with Save and Cancel in reach", async () => {
    await renderAt("/mock/new");
    expect(screen.getByRole("heading", { level: 1, name: "New recipe" })).toBeTruthy();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("turns a typed line into a row on Enter, shows what was read, and is ready for the next", async () => {
    await renderAt("/mock/new");

    typeLine("2 1/4 C. flour");
    typeLine("1 t. soda");

    expect(ingredientRows()).toHaveLength(2);
    // The words stay as typed; under them is what the app read.
    expect(rowOf("2 1/4 C. flour")?.textContent).toContain("2 1/4 C. flour");
    expect(read(rowOf("2 1/4 C. flour") as HTMLElement)).toBe("2¼ · cup · all-purpose flour");
    expect(read(rowOf("1 t. soda") as HTMLElement)).toBe("1 · teaspoon · baking soda");
    expect((screen.getByLabelText("Add an ingredient") as HTMLInputElement).value).toBe("");
  });

  it("marks a food the household does not have as new, and a line it cannot read as written", async () => {
    await renderAt("/mock/new");
    typeLine("3 cups saffron rice");
    typeLine("a knob of something for the pan");

    expect(read(rowOf("3 cups saffron rice") as HTMLElement)).toBe("3 · cup · saffron rice · new");
    expect(read(rowOf("a knob of something for the pan") as HTMLElement)).toBe("as written");
  });

  it("shows the typing hint for the first line only", async () => {
    await renderAt("/mock/new");
    expect(screen.getByText(/Type it the way the card writes it/)).toBeTruthy();
    typeLine("2 eggs");
    expect(screen.queryByText(/Type it the way the card writes it/)).toBeNull();
  });

  it("keeps a card's abbreviations from being corrected by the device", async () => {
    await renderAt("/mock/new");
    const entry = screen.getByLabelText("Add an ingredient");
    expect(entry.getAttribute("autocorrect")).toBe("off");
    expect(entry.getAttribute("spellcheck")).toBe("false");
  });

  it("makes one ingredient for each line of a paste", async () => {
    await renderAt("/mock/new");
    fireEvent.paste(screen.getByLabelText("Add an ingredient"), {
      clipboardData: { getData: () => "2 eggs\n1 cup milk\n\n1 tsp salt" },
    });
    expect(ingredientRows()).toHaveLength(3);
  });

  it("numbers steps as they are added", async () => {
    await renderAt("/mock/new");
    const entry = screen.getByLabelText("Add a step");
    for (const text of ["Mix.", "Bake."]) {
      fireEvent.change(entry, { target: { value: text } });
      fireEvent.keyDown(entry, { key: "Enter" });
    }
    // Each row says what pressing it does, then shows its number and its text.
    expect(stepRows().map((row) => row.textContent)).toEqual([
      "Edit step 1: 1Mix.",
      "Edit step 2: 2Bake.",
    ]);
  });

  it("refuses to save without a title, says how many things are wrong, and marks the field", async () => {
    await renderAt("/mock/new");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "One thing needs fixing before this can be saved.",
    );
    const title = screen.getByLabelText("Title");
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(title.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "A recipe needs a title.",
    );

    // The problem clears as it is fixed, without another press of Save.
    fireEvent.change(title, { target: { value: "Saffron Rice" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks once before adding new foods, and saves only when they are confirmed", async () => {
    const { router } = await renderAt("/mock/new");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Saffron Rice" } });
    typeLine("3 cups saffron rice");
    typeLine("2 quinces");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const foods = sheet("Add 2 foods?");
    expect(foods.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "saffron rice",
      "quinces",
    ]);

    fireEvent.click(foods.getByRole("button", { name: "Go back" }));
    expect(router.state.location.pathname).toBe("/mock/new");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(sheet("Add 2 foods?").getByRole("button", { name: "Add them and save" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/mock/list"));
  });

  it("leaves at once when nothing was typed, and asks first when something was", async () => {
    const { router } = await renderAt("/mock/new");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Half typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    const leaving = sheet("Leave without saving?");
    fireEvent.click(leaving.getByRole("button", { name: "Keep editing" }));
    expect(router.state.location.pathname).toBe("/mock/new");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Half typed");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      sheet("Leave without saving?").getByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/mock/list"));
  });

  it("is reached from Add, and keeps Add marked in the navigation", async () => {
    await renderAt("/mock/add");
    fireEvent.click(screen.getByRole("button", { name: "Type a recipe" }));
    expect(await screen.findByRole("heading", { level: 1, name: "New recipe" })).toBeTruthy();
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getByRole("link", { name: "Add" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("editing a recipe", () => {
  it("loads the recipe, with the card's lines as they were written", async () => {
    await renderAt(COOKIES);

    expect(screen.getByRole("heading", { level: 1, name: "Edit recipe" })).toBeTruthy();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Chocolate Chip Pan Cookies",
    );
    expect((screen.getByLabelText("Makes") as HTMLInputElement).value).toBe("35");
    expect((screen.getByLabelText("Of what") as HTMLInputElement).value).toBe("squares");
    expect(ingredientRows()).toHaveLength(10);
    expect(read(rowOf("2 1/4 C. flour") as HTMLElement)).toBe("2¼ · cup · all-purpose flour");
  });

  it("opens a line to correct what was read, one line at a time", async () => {
    await renderAt(COOKIES);
    fireEvent.click(screen.getByRole("button", { name: startsWith("Edit 2 1/4 C. flour") }));

    expect((screen.getByLabelText("Line as written") as HTMLInputElement).value).toBe(
      "2 1/4 C. flour",
    );
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("2¼");

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "2 1/2" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "sifted" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(read(rowOf("2 1/4 C. flour") as HTMLElement)).toBe(
      "2½ · cup · all-purpose flour · sifted",
    );
    // The words on the card are never changed by correcting what was read.
    expect(rowOf("2 1/4 C. flour")?.textContent).toContain("2 1/4 C. flour");
  });

  it("changes the unit from a searchable list, and can create one that is missing", async () => {
    await renderAt(COOKIES);
    fireEvent.click(screen.getByRole("button", { name: startsWith("Edit 2 1/4 C. flour") }));

    fireEvent.click(screen.getByRole("button", { name: "Unit" }));
    fireEvent.change(sheet("Unit").getByLabelText("Find a unit"), { target: { value: "oun" } });
    fireEvent.click(sheet("Unit").getByRole("button", { name: /ounce/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Unit" }).textContent).toBe("ounce");

    fireEvent.click(screen.getByRole("button", { name: "Unit" }));
    fireEvent.change(sheet("Unit").getByLabelText("Find a unit"), { target: { value: "handful" } });
    fireEvent.click(sheet("Unit").getByRole("button", { name: "Create the unit “handful”" }));
    expect(screen.getByRole("button", { name: "Unit" }).textContent).toBe("handful");
  });

  it("names a food that is not in the list without creating it, and marks it new", async () => {
    await renderAt(COOKIES);
    fireEvent.click(screen.getByRole("button", { name: startsWith("Edit 2 1/4 C. flour") }));

    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    fireEvent.change(sheet("Food").getByLabelText("Find a food"), {
      target: { value: "cake flour" },
    });
    fireEvent.click(sheet("Food").getByRole("button", { name: "Create the food “cake flour”" }));

    expect(screen.getByText(/It is added when you save/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(read(rowOf("2 1/4 C. flour") as HTMLElement)).toBe("2¼ · cup · cake flour · new");
  });

  it("turns a line back into plain text with Keep as written", async () => {
    await renderAt(COOKIES);
    fireEvent.click(screen.getByRole("button", { name: startsWith("Edit 2 1/4 C. flour") }));
    fireEvent.click(screen.getByRole("button", { name: "Keep as written" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(read(rowOf("2 1/4 C. flour") as HTMLElement)).toBe("as written");
  });

  it("moves a line with Up and Down, for a keyboard or a screen reader", async () => {
    await renderAt(COOKIES);
    const order = () =>
      ingredientRows()
        .slice(0, 3)
        .map((row) => row.querySelector("[aria-label^='Move ']")?.getAttribute("aria-label"));
    expect(order()).toEqual(["Move 2 1/4 C. flour", "Move 1 t. soda", "Move 1 t. salt"]);

    fireEvent.click(screen.getByRole("button", { name: startsWith("Edit 2 1/4 C. flour") }));
    expect((screen.getByRole("button", { name: "Up" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Down" }));
    expect(order()).toEqual(["Move 1 t. soda", "Move 2 1/4 C. flour", "Move 1 t. salt"]);
  });

  it("gives every row a handle to drag, named for the row", async () => {
    await renderAt(CHICKEN);
    expect(screen.getByRole("button", { name: "Move the section For the gravy" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Move step 1" })).toHaveLength(2);
  });

  it("holds a section as a titled row: adding one opens it, removing one keeps its lines", async () => {
    await renderAt(CHICKEN);
    expect(ingredientRows()).toHaveLength(11);

    fireEvent.click(
      screen.getByRole("button", { name: startsWith("Edit the section For the gravy") }),
    );
    expect((screen.getByLabelText("Section title") as HTMLInputElement).value).toBe(
      "For the gravy",
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove title" }));
    expect(ingredientRows()).toHaveLength(10);
    expect(
      screen.getByRole("button", { name: startsWith("Edit 2 tbsp all-purpose flour") }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add a section title" })[0] as HTMLElement,
    );
    expect((screen.getByLabelText("Section title") as HTMLInputElement).value).toBe("");
    expect(ingredientRows()).toHaveLength(11);
  });

  it("restarts step numbers after a section title", async () => {
    await renderAt(CHICKEN);
    const numbers = stepRows().map(
      (row) => row.querySelector("[aria-hidden=true].font-bold")?.textContent,
    );
    expect(numbers.filter(Boolean)).toEqual(["1", "2", "3", "4", "1", "2", "3"]);
  });

  it("edits a step in place", async () => {
    await renderAt(COOKIES);
    fireEvent.click(screen.getByRole("button", { name: startsWith("Edit step 1") }));
    fireEvent.change(screen.getByLabelText("Step 1"), { target: { value: "Heat the oven." } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(stepRows()[0]?.textContent).toBe("Edit step 1: 1Heat the oven.");
  });

  it("shows the chosen category in its divider colour, and takes it off when pressed", async () => {
    await renderAt(CHICKEN);
    const categories = within(screen.getByRole("list", { name: "Categories" }));
    const dinner = categories.getByRole("button", { name: "Remove the category Dinner" });
    expect(dinner.className).toContain("bg-stock-salmon");

    fireEvent.click(dinner);
    expect(categories.queryByRole("button", { name: "Remove the category Dinner" })).toBeNull();
  });

  it("chooses tags from a list that stays open, and can create one in place", async () => {
    await renderAt(CHICKEN);
    fireEvent.click(screen.getByRole("button", { name: "Choose tags" }));

    fireEvent.click(sheet("Tags").getByRole("button", { name: "Weeknight" }));
    fireEvent.change(sheet("Tags").getByLabelText("Find a tag"), { target: { value: "Sunday" } });
    fireEvent.click(sheet("Tags").getByRole("button", { name: "Create the tag “Sunday”" }));
    fireEvent.click(sheet("Tags").getByRole("button", { name: "Done" }));

    const tags = within(screen.getByRole("list", { name: "Tags" }));
    expect(tags.getByRole("button", { name: "Remove the tag Weeknight" })).toBeTruthy();
    expect(tags.getByRole("button", { name: "Remove the tag Sunday" })).toBeTruthy();
  });

  it("marks the cover, and makes another photo the cover from its sheet", async () => {
    await renderAt(CHICKEN);
    expect(screen.getByRole("button", { name: /Photos, picture 1 of 2, the cover/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Photos, picture 2 of 2/ }));
    fireEvent.click(sheet("Photo").getByRole("button", { name: "Make it the cover" }));
    fireEvent.click(sheet("Photo").getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: /Photos, picture 2 of 2, the cover/ })).toBeTruthy();
  });

  it("has all eleven nutrition values folded away", async () => {
    await renderAt(COOKIES);
    const nutrition = screen.getByText("Nutrition").closest("details") as HTMLDetailsElement;
    expect(nutrition.open).toBe(false);
    expect(within(nutrition).getAllByRole("textbox")).toHaveLength(11);
  });

  it("lists what needs fixing, and marks each problem on its own field and row", async () => {
    await renderAt(`${CHICKEN}?scene=problems`);

    expect(screen.getByRole("alert").textContent).toContain(
      "4 things need fixing before this can be saved.",
    );
    const list = within(screen.getByRole("list", { name: "What needs fixing" }));
    // In the order the fields come down the page.
    expect(list.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Title: A recipe needs a title.",
      "Link: This does not look like a web address. It should start with https://",
      "Serves: Use a number above zero, such as 6 or 1 1/2.",
      "A section title: Give this section a title, or remove it.",
    ]);

    // Each is also said where it is, tied to its box.
    const title = screen.getByLabelText("Title");
    expect(document.getElementById(title.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "A recipe needs a title.",
    );
    expect(screen.getByText("Serves: Use a number above zero, such as 6 or 1 1/2.")).toBeTruthy();
    expect(screen.getByLabelText("Serves").getAttribute("aria-invalid")).toBe("true");
  });

  it("goes to a problem's field when the problem is pressed", async () => {
    await renderAt(`${CHICKEN}?scene=problems`);
    const list = within(screen.getByRole("list", { name: "What needs fixing" }));

    fireEvent.click(list.getByRole("button", { name: /^Link:/ }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Link")));

    // A row's problem leads to the row, ready to be opened.
    fireEvent.click(list.getByRole("button", { name: /^A section title:/ }));
    await waitFor(() =>
      expect(document.activeElement?.textContent).toBe(
        "Edit the section Section with no title yet",
      ),
    );
  });

  it("asks before leaving with unsaved changes", async () => {
    await renderAt(`${CHICKEN}?scene=leaving`);
    expect(sheet("Leave without saving?").getByText(/The recipe stays as it was/)).toBeTruthy();
  });

  it("says when the recipe was changed elsewhere, and overwrites nothing without a choice", async () => {
    await renderAt(`${CHICKEN}?scene=conflict`);
    const conflict = sheet("Changed on another device");
    expect(conflict.getByRole("button", { name: "Reload it" })).toBeTruthy();
    expect(conflict.getByRole("button", { name: "Save over it" })).toBeTruthy();
    expect(conflict.getByText(/your copy was not saved/)).toBeTruthy();
  });

  it("is reached from Edit on the recipe, and goes back to it on Cancel", async () => {
    const { router } = await renderAt("/mock/recipe/meat-loaf");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Edit recipe" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/mock/recipe/meat-loaf"));
  });
});

describe("reviewing an import", () => {
  it("says where it came from, that nothing is saved yet, and what to check", async () => {
    await renderAt("/mock/review");

    expect(screen.getByRole("heading", { level: 1, name: "Review import" })).toBeTruthy();
    expect(screen.getByText(/Nothing is saved until you press Save recipe/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "3 things to check" })).toBeTruthy();
    expect(screen.getByText("No steps were found.")).toBeTruthy();
    expect(screen.getByText(/1 ingredient line could not be read/)).toBeTruthy();
    expect(screen.getByText("1 food is not among yours yet: cornmeal.")).toBeTruthy();
  });

  it("goes to what needs checking when it is pressed", async () => {
    await renderAt("/mock/review");

    fireEvent.click(screen.getByRole("button", { name: "No steps were found." }));
    await waitFor(() => expect(document.activeElement?.id).toBe("step-entry"));

    fireEvent.click(screen.getByRole("button", { name: /1 food is not among yours yet/ }));
    await waitFor(() =>
      expect(document.activeElement?.textContent).toMatch(/^Edit 1 cup cornmeal/),
    );
  });

  it("fills the editor from the page and marks what needs a look", async () => {
    await renderAt("/mock/review");

    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Skillet Cornbread");
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("Example Kitchen");
    expect(read(rowOf("1 cup cornmeal") as HTMLElement)).toBe("1 · cup · cornmeal · new");
    expect(rowOf("1 cup cornmeal")?.textContent).toContain("check");
    expect(rowOf("a knob of butter for the pan")?.textContent).toContain("check");
    expect(rowOf("1 cup flour")?.textContent).not.toContain("check");
    expect(
      screen.getByRole("heading", { level: 2, name: "Steps" }).parentElement?.textContent,
    ).toContain("check");
  });

  it("selects only the organizers the household has, and offers the rest unselected", async () => {
    await renderAt("/mock/review");

    const categories = within(screen.getByRole("list", { name: "Categories" }));
    expect(categories.getByRole("button", { name: "Remove the category Dinner" })).toBeTruthy();
    expect(categories.queryByRole("button", { name: "Remove the category Bread" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Bread" }));
    expect(categories.getByRole("button", { name: "Remove the category Bread" })).toBeTruthy();
  });

  it("brings the page's picture in as the cover, which can be removed", async () => {
    await renderAt("/mock/review");
    fireEvent.click(screen.getByRole("button", { name: /Photos, picture 1 of 1, the cover/ }));
    fireEvent.click(sheet("Photo").getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("button", { name: /Photos, picture/ })).toBeNull();
  });

  it("can be saved with things still to check, after the new food is confirmed", async () => {
    const { router } = await renderAt("/mock/review");
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    fireEvent.click(sheet("Add 1 food?").getByRole("button", { name: "Add it and save" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/mock/list"));
  });

  it("always asks before discarding, and says nothing was saved", async () => {
    const { router } = await renderAt("/mock/review");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    const discard = sheet("Discard this import?");
    expect(discard.getByText(/Nothing has been saved as a recipe/)).toBeTruthy();
    fireEvent.click(discard.getByRole("button", { name: "Discard import" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/mock/list"));
  });

  it("shows a draft an AI model wrote from pasted text, with its doubts and the text beside it", async () => {
    await renderAt("/mock/review?scene=pasted");

    expect(screen.getByText(/Written up by AI from/).textContent).toContain("pasted text");
    expect(screen.getByRole("button", { name: /^Step 4: The text does not say/ })).toBeTruthy();
    const original = screen.getByRole("complementary", { name: "Original" });
    expect(original.textContent).toContain("1/2 tsp baking powdr");
    // No page stands behind it, so none is offered.
    expect(screen.queryByRole("link", { name: /Open the page/ })).toBeNull();
  });

  it("says when the link is already a recipe, and still allows saving", async () => {
    await renderAt("/mock/review?scene=duplicate");
    // A standing condition, in the notice band with its own icon: not a problem, so not announced as one.
    const notice = screen.getByText(/You already have a recipe from this link/).closest("[role]");
    expect(notice?.getAttribute("role")).toBe("status");
    expect(notice?.querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lemony Red Lentil Soup" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save recipe" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("puts the original beside the recipe: a switch between the two, and the original opens full screen", async () => {
    await renderAt("/mock/review?scene=card");

    const original = screen.getByRole("complementary", { name: "Original" });
    expect(original.className).toContain("hidden");
    fireEvent.click(screen.getByRole("radio", { name: "Original" }));
    expect(original.className).not.toMatch(/(^| )hidden( |$)/);

    fireEvent.click(within(original).getByRole("button", { name: /The front of the card/ }));
    expect(screen.getByRole("dialog", { name: /Original/ })).toBeTruthy();
  });

  it("is reached from Review on an import's row", async () => {
    await renderAt("/mock/list?scene=imports");
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Review import" })).toBeTruthy();
  });
});
