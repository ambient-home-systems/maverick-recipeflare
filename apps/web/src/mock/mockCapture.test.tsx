import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-utils";

/**
 * Photographing a sitting of cards, as the mock draws it. The camera is a file
 * input, so a test hands it a file as a phone's camera would.
 */

let taken = 0;
beforeEach(() => {
  taken = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:photo-${++taken}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
});

const photo = (name = "card.jpg") => new File(["x"], name, { type: "image/jpeg" });
const pile = () => within(screen.getByRole("list", { name: "Cards" }));
const rows = () =>
  pile()
    .getAllByRole("listitem")
    .filter((item) => item.parentElement?.getAttribute("aria-label") === "Cards");
const summaries = () => rows().map((row) => row.textContent?.replace(/^Change /, "") ?? "");
const input = (which: "camera" | "chooser") => {
  const found = document.querySelector<HTMLInputElement>(`input[data-capture="${which}"]`);
  if (!found) {
    throw new Error(`there is no ${which} input`);
  }
  return found;
};
/** Presses a button that opens the camera, then hands back the photos the cook took. */
function shoot(button: HTMLElement, which: "camera" | "chooser", ...photos: File[]) {
  fireEvent.click(button);
  fireEvent.change(input(which), { target: { files: photos } });
}
const open = (card: number) =>
  fireEvent.click(pile().getByRole("button", { name: new RegExp(`^Change Card ${card}\\b`) }));
const sides = (row: HTMLElement) =>
  [...row.querySelectorAll("img")].map((image) => image.getAttribute("src") ?? "");

describe("photographing cards, mid-sitting", () => {
  it("shows the pile in the order taken, with how many sides each card has", async () => {
    await renderAt("/mock/capture");

    expect(screen.getByRole("heading", { level: 1, name: "Photograph cards" })).toBeTruthy();
    expect(screen.getByText("7 cards")).toBeTruthy();
    expect(summaries()).toEqual([
      "Card 1Front and back",
      "Card 2Front and back",
      "Card 3Front only",
      "Card 4Front and back",
      "Card 5Front and back",
      "Card 6Front only",
      "Card 7Front only",
    ]);
  });

  it("keeps the two buttons for the next photo together: the back of this card, or the next card", async () => {
    await renderAt("/mock/capture");

    expect(screen.getByRole("button", { name: "Add the back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next card" })).toBeTruthy();
    // Both open the device's camera, facing the card.
    expect(input("camera").getAttribute("capture")).toBe("environment");
    expect(input("camera").multiple).toBe(false);
  });

  it("adds the back to the newest card, and then offers only the next card", async () => {
    await renderAt("/mock/capture");

    shoot(screen.getByRole("button", { name: "Add the back" }), "camera", photo());

    expect(summaries()[6]).toBe("Card 7Front and back");
    expect(screen.getByText("7 cards")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add the back" })).toBeNull();
    expect(screen.getByRole("button", { name: "Next card" })).toBeTruthy();
  });

  it("starts the next card with its front, and offers its back", async () => {
    await renderAt("/mock/capture");

    shoot(screen.getByRole("button", { name: "Next card" }), "camera", photo());

    expect(screen.getByText("8 cards")).toBeTruthy();
    expect(summaries()[7]).toBe("Card 8Front only");
    expect(sides(rows()[7] as HTMLElement)).toEqual(["blob:photo-1"]);
    expect(screen.getByRole("button", { name: "Add the back" })).toBeTruthy();
  });

  it("takes several photos chosen from the device, each as a card of its own", async () => {
    await renderAt("/mock/capture");

    shoot(screen.getByRole("button", { name: "Choose photos" }), "chooser", photo("a"), photo("b"));

    expect(screen.getByText("9 cards")).toBeTruthy();
    expect(input("chooser").multiple).toBe(true);
    expect(input("chooser").hasAttribute("capture")).toBe(false);
  });

  it("does nothing when the camera is closed without a photo", async () => {
    await renderAt("/mock/capture");

    shoot(screen.getByRole("button", { name: "Next card" }), "camera");

    expect(screen.getByText("7 cards")).toBeTruthy();
  });

  it("says how many cards Import will send, and that nothing has been sent yet", async () => {
    const { router } = await renderAt("/mock/capture?scene=twelve");

    // The line at the pile's end also says that a card can be opened and mended.
    expect(screen.getByText(/Nothing has been sent yet/).textContent).toContain(
      "Press a card to retake, swap or remove a photo.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Import 12 cards" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/mock/list"));
  });
});

describe("mending a card before it is sent", () => {
  it("opens one card at a time, with each side named and what can be done to it", async () => {
    await renderAt("/mock/capture");

    open(2);
    const row = within(rows()[1] as HTMLElement);
    expect(row.getByRole("heading", { name: "Card 2" })).toBeTruthy();
    expect(row.getByText("Front")).toBeTruthy();
    expect(row.getByText("Back")).toBeTruthy();
    expect(row.getByRole("button", { name: "Retake the front" })).toBeTruthy();
    expect(row.getByRole("button", { name: "Remove the back" })).toBeTruthy();
    expect(row.getByRole("button", { name: "Swap sides" })).toBeTruthy();

    open(4);
    expect(screen.getAllByRole("button", { name: "Done" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Card 4" })).toBeTruthy();
  });

  it("swaps a card's sides", async () => {
    await renderAt("/mock/capture");
    const before = sides(rows()[1] as HTMLElement);

    open(2);
    fireEvent.click(screen.getByRole("button", { name: "Swap sides" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(sides(rows()[1] as HTMLElement)).toEqual([...before].reverse());
  });

  it("removes a wrong photo: the card keeps its other side", async () => {
    await renderAt("/mock/capture");
    const [, back] = sides(rows()[1] as HTMLElement);

    open(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove the front" }));
    // A photo taken off cannot be put back, so the row asks first.
    expect(screen.getByRole("alert").textContent).toContain("Remove the front of card 2?");
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));

    expect(screen.getByText("7 cards")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(summaries()[1]).toBe("Card 2Front only");
    expect(sides(rows()[1] as HTMLElement)).toEqual([back]);
  });

  it("retakes one side in place", async () => {
    await renderAt("/mock/capture");
    const [front] = sides(rows()[1] as HTMLElement);

    open(2);
    shoot(screen.getByRole("button", { name: "Retake the back" }), "camera", photo());
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(sides(rows()[1] as HTMLElement)).toEqual([front, "blob:photo-1"]);
  });

  it("removes a card, and numbers the rest again", async () => {
    await renderAt("/mock/capture");

    open(3);
    fireEvent.click(screen.getByRole("button", { name: "Remove card" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Remove card 3? The photo is only on this device, so it cannot be put back.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));

    expect(screen.getByText("6 cards")).toBeTruthy();
    expect(summaries()[2]).toBe("Card 3Front and back");
  });

  it("speaks of a two-sided card's photos, and puts “Keep it” first, under the finger", async () => {
    await renderAt("/mock/capture");

    open(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove card" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Remove card 2? Its photos are only on this device, so they cannot be put back.",
    );
    const choices = within(rows()[1] as HTMLElement)
      .getAllByRole("button")
      .map((button) => button.textContent)
      .filter((name) => name === "Keep it" || name === "Remove it");
    expect(choices).toEqual(["Keep it", "Remove it"]);
  });

  it("closes a card being mended when the next card is taken, so its back is offered again", async () => {
    await renderAt("/mock/capture");

    open(2);
    expect(screen.queryByRole("heading", { name: "Card 2" })).toBeTruthy();
    shoot(screen.getByRole("button", { name: "Next card" }), "camera", photo());

    expect(screen.queryByRole("heading", { name: "Card 2" })).toBeNull();
    expect(summaries()[7]).toBe("Card 8Front only");
    expect(screen.getByRole("button", { name: "Add the back" })).toBeTruthy();
  });

  it("keeps a card when the cook thinks better of removing it", async () => {
    await renderAt("/mock/capture");

    open(3);
    fireEvent.click(screen.getByRole("button", { name: "Remove card" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(screen.getByText("7 cards")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove card" })).toBeTruthy();
  });

  it("removes the card when its only photo is taken off", async () => {
    await renderAt("/mock/capture");

    open(3);
    fireEvent.click(screen.getByRole("button", { name: "Remove the front" }));
    expect(screen.getByRole("alert").textContent).toContain("Remove card 3?");
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));

    expect(screen.getByText("6 cards")).toBeTruthy();
  });

  it("offers one “Add the back” at a time: the open card's, not the newest card's", async () => {
    await renderAt("/mock/capture");
    expect(screen.getAllByRole("button", { name: "Add the back" })).toHaveLength(1);

    open(3);
    const offered = screen.getAllByRole("button", { name: "Add the back" });
    expect(offered).toHaveLength(1);
    shoot(offered[0] as HTMLElement, "camera", photo());
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    // The photo went to the card that was open, and the newest card still wants its back.
    expect(summaries()[2]).toBe("Card 3Front and back");
    expect(summaries()[6]).toBe("Card 7Front only");
    expect(screen.getAllByRole("button", { name: "Add the back" })).toHaveLength(1);
  });

  it("joins a one-sided card to the card before it, as its back", async () => {
    await renderAt("/mock/capture");

    // Card 6 has only a front, and so does card 7 after it.
    open(7);
    fireEvent.click(screen.getByRole("button", { name: "It is the back of card 6" }));

    expect(screen.getByText("6 cards")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(summaries()[5]).toBe("Card 6Front and back");
  });

  it("offers the back and no swap on a card with one side", async () => {
    await renderAt("/mock/capture");

    open(3);
    const row = within(rows()[2] as HTMLElement);

    expect(row.getByRole("button", { name: "Add the back" })).toBeTruthy();
    expect(row.queryByRole("button", { name: "Swap sides" })).toBeNull();
    // The card before it has two sides and room for more, so it could be that card's next side.
    expect(row.getByRole("button", { name: "It is the back of card 2" })).toBeTruthy();
  });

  it("opens a side full screen to look at it closely", async () => {
    await renderAt("/mock/capture");

    open(2);
    fireEvent.click(screen.getByRole("button", { name: "Back of card 2. Open it full screen" }));

    expect(screen.getByRole("dialog", { name: /Card 2/ })).toBeTruthy();
  });
});

describe("the edges of a sitting", () => {
  it("starts with nothing but the two ways to bring a photo in", async () => {
    await renderAt("/mock/capture?scene=empty");

    expect(screen.getByRole("heading", { name: "No cards yet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Photograph a card" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose photos" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Import/ })).toBeNull();

    shoot(screen.getByRole("button", { name: "Photograph a card" }), "camera", photo());
    expect(summaries()).toEqual(["Card 1Front only"]);
    expect(screen.getByRole("button", { name: "Import 1 card" })).toBeTruthy();
  });

  it("leaves at once when there is nothing to lose", async () => {
    const { router } = await renderAt("/mock/capture?scene=empty");

    fireEvent.click(screen.getByRole("button", { name: "Add a recipe" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/mock/add"));
  });

  it("asks before leaving a pile behind, and stays unless told to go", async () => {
    const { router } = await renderAt("/mock/capture");

    fireEvent.click(screen.getByRole("button", { name: "Add a recipe" }));
    const asked = within(screen.getByRole("dialog", { name: "Leave these cards?" }));
    expect(asked.getByText(/The 7 cards you photographed are only on this device/)).toBeTruthy();
    fireEvent.click(asked.getByRole("button", { name: "Keep going" }));
    expect(router.state.location.pathname).toBe("/mock/capture");

    fireEvent.click(screen.getByRole("button", { name: "Add a recipe" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Leave these cards?" })).getByRole("button", {
        name: "Leave",
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/mock/add"));
  });

  it("says how far sending has got, and holds the pile still meanwhile", async () => {
    await renderAt("/mock/capture?scene=sending");

    // Two have gone and have left the pile. The count is said beside the button that was pressed.
    expect(screen.getByText(/2 of 12 sent/)).toBeTruthy();
    expect(screen.getByText("10 cards")).toBeTruthy();
    expect(screen.getByText("Each card leaves this list as it is sent.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /^Change Card 1\b/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Next card" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("says what was sent and what is still here when sending stops", async () => {
    await renderAt("/mock/capture?scene=stopped");

    const problem = screen.getByRole("alert");
    expect(problem.textContent).toContain("5 cards were sent and 7 are still here");
    expect(screen.getByRole("button", { name: "Import 7 cards" })).toBeTruthy();
  });

  it("goes on photographing offline, and holds Import until there is a connection", async () => {
    await renderAt("/mock/capture?scene=offline");

    expect(screen.getByText(/You can go on photographing/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Import 4 cards" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Next card" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe("cards on their way in, on the list", () => {
  it("says where each card has got to, in a card's own words", async () => {
    await renderAt("/mock/list?scene=cards");

    const imports = within(await screen.findByRole("list", { name: "Imports" }))
      .getAllByRole("listitem")
      .map((row) => row.textContent ?? "");
    // A card with no title yet is called by its place in the sitting, as the pile called it.
    expect(imports[0]).toContain("Card 4");
    expect(imports[0]).toContain("Reading the card");
    expect(imports[1]).toContain("Card 3");
    expect(imports[1]).toContain("Writing it up");
    expect(imports[2]).toContain("Lemon Bars");
    expect(imports[2]).toContain("Ready to review");
    // So a card that could not be read says which paper card to photograph again.
    expect(imports[3]).toContain("Card 1");
    expect(imports[3]).toContain("Nothing could be read from the photo");
  });
});

describe("the way in from Add", () => {
  it("is offered in the mock, and leads to the capture screen", async () => {
    const { router } = await renderAt("/mock/add");

    expect(screen.getByRole("heading", { name: "From photos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Photograph cards" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/mock/capture"));
  });

  it("is offered in the app, and leads to the page that holds the pile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [] })),
    );
    const { router } = await renderAt("/add");

    fireEvent.click(await screen.findByRole("button", { name: "Photograph cards" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/add/photos"));
    expect(await screen.findByRole("heading", { name: "No cards yet" })).toBeTruthy();
  });
});
