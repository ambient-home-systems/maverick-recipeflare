import { type ImportReport, ImportReport as ReportSchema } from "@recipeflare/schema";
import { fixtureImportReport } from "@recipeflare/schema/fixtures";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-utils";

afterEach(() => {
  cleanup();
});

type Call = { method: string; path: string; body: unknown };

/** The API as the report page sees it. `compare` answers a press of a compare button. */
function fakeApi(
  report: ImportReport | Response,
  compare: Response = Response.json({ started: 3, waiting: 0 }, { status: 202 }),
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname.replace("/api/v1", "");
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path === "/imports/report") {
        return report instanceof Response ? report.clone() : Response.json(report);
      }
      if (path === "/imports/compare" && method === "POST") {
        return compare.clone();
      }
      // The lists the Manage index counts, when a test starts there.
      return Response.json({ items: [] });
    }),
  );
  return calls;
}

const plain: ImportReport = { ...fixtureImportReport, compareWith: [] };
/** An import's row, once the report has arrived. */
const row = async (title: string) => {
  const item = (await screen.findByText(title)).closest("li");
  if (!item) {
    throw new Error(`no row for ${title}`);
  }
  return within(item);
};

describe("the import report", () => {
  it("is reached from Manage", async () => {
    fakeApi(plain);
    await renderAt("/manage");

    const link = await screen.findByRole("link", { name: /Import report/ });

    expect(link.getAttribute("href")).toBe("/manage/import-report");
  });

  it("holds sample data the schema accepts", () => {
    expect(ReportSchema.safeParse(fixtureImportReport).success).toBe(true);
  });

  it("says, for each saved import, what review changed", async () => {
    fakeApi(plain);
    await renderAt("/manage/import-report");

    await screen.findByRole("heading", { name: "Import report" });
    const cookies = await row("Cardamom Sugar Cookies");
    // Its title leads to the recipe, and the card keeps its number.
    expect(cookies.getByRole("link").getAttribute("href")).toBe("/recipes/cardamom-sugar-cookies");
    expect(cookies.getByText(/Photographed card 4/)).toBeTruthy();
    expect(cookies.getByText("As you saved it, from the standard draft: 1 change.")).toBeTruthy();
    expect(
      cookies.getByText("1 amount was corrected that the import had not doubted."),
    ).toBeTruthy();

    // A link no model read says so by naming none.
    expect(
      (await row("Buttermilk Pancakes")).getByText("As you saved it: No changes."),
    ).toBeTruthy();
    // One saved before the record was kept, whose recipe is gone, has no link and says both.
    const toast = await row("Cinnamon Toast");
    expect(toast.queryByRole("link")).toBeNull();
    expect(toast.getByText("This recipe has since been deleted.")).toBeTruthy();
    expect(toast.getByText("Saved before changes were recorded.")).toBeTruthy();
  });

  it("shows each run with another profile under its import: done, under way, or failed", async () => {
    fakeApi(plain);
    await renderAt("/manage/import-report");

    await screen.findByRole("heading", { name: "Import report" });
    expect(
      (await row("Cardamom Sugar Cookies")).getByText("Run again with gemma: 4 changes."),
    ).toBeTruthy();
    expect((await row("Lemony Red Lentil Soup")).getByText("Reading it again")).toBeTruthy();
    expect(
      (await row("Sunday Beef and Bean Chili")).getByText(
        "Could not be compared. The model took too long to answer.",
      ),
    ).toBeTruthy();
  });

  it("adds the report up: the cook's reviews, then each profile", async () => {
    fakeApi(plain);
    await renderAt("/manage/import-report");

    const sums = within(await screen.findByRole("list", { name: "Added up" }));
    expect(sums.getAllByRole("listitem").map((item) => item.firstChild?.textContent)).toEqual([
      "As you saved them",
      "Run again with gemma",
      "Run again with qwen",
    ]);
    // Four imports have a record: 1 + 0 + 5 + 0 changes.
    expect(sums.getByText(/^4 imports\. 6 changes, 1\.5 each\./)).toBeTruthy();
  });

  it("offers nothing to compare with unless the report names profiles", async () => {
    fakeApi(plain);
    await renderAt("/manage/import-report");

    await row("Cardamom Sugar Cookies");
    expect(screen.queryByRole("heading", { name: "Compare models" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Run again with/ })).toBeNull();
  });

  it("starts runs with the profile pressed, and says how many", async () => {
    const calls = fakeApi(fixtureImportReport);
    await renderAt("/manage/import-report");

    fireEvent.click(await screen.findByRole("button", { name: "Run again with gemma" }));

    expect(await screen.findByText(/^Started 3 runs with gemma\./)).toBeTruthy();
    expect(calls.find((call) => call.method === "POST")).toMatchObject({
      path: "/imports/compare",
      body: { profile: "gemma" },
    });
    // The report is asked for again, to show the runs.
    await waitFor(() =>
      expect(calls.filter((call) => call.path === "/imports/report").length).toBeGreaterThan(1),
    );
  });

  it("says so when every card already has a run with that profile", async () => {
    fakeApi(fixtureImportReport, Response.json({ started: 0, waiting: 0 }, { status: 202 }));
    await renderAt("/manage/import-report");

    fireEvent.click(await screen.findByRole("button", { name: "Run again with qwen" }));

    expect(
      await screen.findByText("Nothing to start: every saved card already has a run with qwen."),
    ).toBeTruthy();
  });

  it("says why when the runs are refused", async () => {
    fakeApi(
      fixtureImportReport,
      Response.json(
        { error: { code: "compare_off", message: "Comparing models is not switched on here" } },
        { status: 403 },
      ),
    );
    await renderAt("/manage/import-report");

    fireEvent.click(await screen.findByRole("button", { name: "Run again with gemma" }));

    expect(
      await screen.findByText(
        "The runs could not be started. Comparing models is not switched on here.",
      ),
    ).toBeTruthy();
  });

  it("says there is nothing yet when no import has been saved", async () => {
    fakeApi({ cards: [], compareWith: ["standard"] });
    await renderAt("/manage/import-report");

    expect(await screen.findByRole("heading", { name: "No imports saved yet" })).toBeTruthy();
    // With nothing saved there is nothing to run again.
    expect(screen.queryByRole("button", { name: /Run again with/ })).toBeNull();
  });

  it("says when the report could not be loaded, and offers to try again", async () => {
    fakeApi(Response.json({ error: { code: "server", message: "Broken" } }, { status: 500 }));
    await renderAt("/manage/import-report");

    expect(await screen.findByRole("heading", { name: "Could not load the report" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
