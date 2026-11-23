import { type Asset, type ImportJob, newId } from "@recipeflare/schema";
import { importRunning } from "@recipeflare/schema/fixtures";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-utils";
import { stopText } from "./CapturePage";

/**
 * Photographing cards in the app itself: the pile lives on the page, and
 * Import sends each card's photos and then the card. The API is a stand-in.
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

type Call = { method: string; path: string; body: unknown };

/** The API as the capture page uses it. `dropAt` makes the nth request for a card or a photo fail to arrive. */
function fakeApi(options: { dropAt?: { path: string; nth: number } } = {}) {
  const calls: Call[] = [];
  const jobs: ImportJob[] = [];
  const seen = new Map<string, number>();
  let dropped = false;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string"
        ? JSON.parse(init.body)
        : init?.body instanceof Blob
          ? (init.body as File).name
          : null;
    calls.push({ method, path: path + url.search, body });
    if (method === "POST") {
      const count = (seen.get(path) ?? 0) + 1;
      seen.set(path, count);
      if (!dropped && options.dropAt?.path === path && options.dropAt.nth === count) {
        dropped = true;
        throw new TypeError("Failed to fetch");
      }
    }
    if (method === "POST" && path === "/assets") {
      const asset: Asset = {
        id: newId(),
        role: "original",
        position: 0,
        contentType: "image/jpeg",
        sizeBytes: 1000,
        width: null,
        height: null,
        hasVariants: false,
        originalFilename: String(body),
        createdAt: new Date().toISOString(),
      };
      return Response.json(asset, { status: 201 });
    }
    if (method === "POST" && path === "/imports") {
      const job: ImportJob = {
        ...importRunning,
        id: newId(),
        kind: "photo",
        status: "queued",
        stage: null,
        sourceUrl: null,
        card: (body as { card?: number }).card,
      };
      jobs.unshift(job);
      return Response.json(job, { status: 202 });
    }
    if (path === "/imports") {
      return Response.json({ items: jobs });
    }
    if (path === "/recipes") {
      return Response.json({ items: [], page: 1, perPage: 30, total: 0, libraryTotal: 0 });
    }
    return Response.json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  const sent = (path: string) =>
    calls.filter((call) => call.method === "POST" && call.path.split("?")[0] === path);
  return { calls, sent, jobs };
}

const photo = (name: string) => new File([name], name, { type: "image/jpeg" });
const input = (which: "camera" | "chooser") =>
  document.querySelector(`input[data-capture="${which}"]`) as HTMLInputElement;
function shoot(button: HTMLElement, which: "camera" | "chooser", ...photos: File[]) {
  fireEvent.click(button);
  fireEvent.change(input(which), { target: { files: photos } });
}
const button = (name: string | RegExp) => screen.getByRole("button", { name });

/** A sitting of two cards: the first with a front and a back, the second with a front only. */
async function twoCards() {
  const rendered = await renderAt("/add/photos");
  shoot(
    await screen.findByRole("button", { name: "Photograph a card" }),
    "camera",
    photo("1-front"),
  );
  shoot(button("Add the back"), "camera", photo("1-back"));
  shoot(button("Next card"), "camera", photo("2-front"));
  expect(screen.getByText("2 cards")).toBeTruthy();
  return rendered;
}

describe("sending a sitting of cards", () => {
  it("sends each card's photos, then the card with its photos front first, and goes to the list", async () => {
    const api = fakeApi();
    const { router } = await twoCards();

    fireEvent.click(button("Import 2 cards"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    // Nothing was sent before Import, and then each photo once, as a card's side.
    expect(api.sent("/assets").map((call) => [call.path, call.body])).toEqual([
      ["/assets?role=original&filename=1-front", "1-front"],
      ["/assets?role=original&filename=1-back", "1-back"],
      ["/assets?role=original&filename=2-front", "2-front"],
    ]);
    const cards = api
      .sent("/imports")
      .map((call) => call.body as { kind: string; photos: string[]; card: number });
    // Each says which card of the sitting it is, so the list can name it as the pile did.
    expect(cards.map((card) => [card.kind, card.photos.length, card.card])).toEqual([
      ["photo", 2, 1],
      ["photo", 1, 2],
    ]);
    // The cards are on the list, on their way in.
    const imports = await screen.findByRole("list", { name: "Imports" });
    expect(within(imports).getByText("Card 1")).toBeTruthy();
    expect(within(imports).getByText("Card 2")).toBeTruthy();
  });

  it("sends nothing until Import is pressed", async () => {
    const api = fakeApi();
    await twoCards();

    expect(api.sent("/assets")).toEqual([]);
    expect(api.sent("/imports")).toEqual([]);
  });

  it("keeps what was not sent when the connection drops, and says how far it got", async () => {
    const api = fakeApi({ dropAt: { path: "/imports", nth: 2 } });
    const { router } = await twoCards();

    fireEvent.click(button("Import 2 cards"));

    const problem = await screen.findByRole("alert");
    expect(problem.textContent).toBe(
      "1 card was sent and 1 is still here: the connection dropped. Press Import to try again.",
    );
    expect(router.state.location.pathname).toBe("/add/photos");
    // The card that went has left the pile; the one that did not is still here, and is still card 2.
    expect(screen.getByText("1 card")).toBeTruthy();
    expect(button(/^Change Card 2\b/).textContent).toContain("Front only");

    fireEvent.click(button("Import 1 card"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    // Its photo had already arrived, and is not sent a second time.
    expect(api.sent("/assets")).toHaveLength(3);
    expect(api.sent("/imports")).toHaveLength(3);
    // It goes as card 2, the number it had in the pile.
    expect(api.sent("/imports").at(-1)?.body).toMatchObject({ card: 2 });
  });

  it("says so when nothing at all could be sent", async () => {
    fakeApi({ dropAt: { path: "/assets", nth: 1 } });
    await twoCards();

    fireEvent.click(button("Import 2 cards"));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Nothing was sent: the connection dropped. Press Import to try again. All 2 cards are still here.",
    );
    expect(screen.getByText("2 cards")).toBeTruthy();
  });

  it("words a stop for one card and for many", () => {
    const gone = new TypeError("Failed to fetch");
    expect(stopText(0, 1, gone)).toContain("The card is still here.");
    expect(stopText(3, 9, gone)).toMatch(/^3 cards were sent and 9 are still here: /);
  });
});

describe("leaving a pile", () => {
  it("asks when the cook goes elsewhere by the navigation, and stays unless told to go", async () => {
    fakeApi();
    const { router } = await twoCards();

    fireEvent.click(screen.getByRole("link", { name: "Recipes" }));
    const asked = within(await screen.findByRole("dialog", { name: "Leave these cards?" }));
    fireEvent.click(asked.getByRole("button", { name: "Keep going" }));
    expect(router.state.location.pathname).toBe("/add/photos");
    expect(screen.getByText("2 cards")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Recipes" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Leave these cards?" })).getByRole(
        "button",
        {
          name: "Leave",
        },
      ),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("goes back to Add without a question when there is no pile", async () => {
    fakeApi();
    const { router } = await renderAt("/add/photos");

    fireEvent.click(await screen.findByRole("button", { name: "Add a recipe" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/add"));
  });
});
