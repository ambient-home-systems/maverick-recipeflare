import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { emptyLibrary, makeRecipe } from "./helpers";

/**
 * An automated accessibility check of the screens a cook uses. It catches
 * what a machine can: contrast, names, roles, labels. It does not replace
 * using the app with a screen reader.
 */

// A page taller than any screen here, so nothing is judged while it happens to sit half
// under the navigation bar or the action bar. An import's review is the longest: 2600 was
// not enough for it, and a row under the Save bar was reported as too small to press.
test.use({ viewport: { width: 412, height: 6000 } });

let slug = "";

test.beforeAll(async ({ request }) => {
  await emptyLibrary(request);
  slug = (await makeRecipe(request, "Tomato Stew", { attachment: "tomato-stew-card.pdf" })).slug;
});

/** Findings that would stop someone using the screen. */
async function blocking(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      rule: violation.id,
      help: violation.help,
      where: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
    }));
}

const screens: { name: string; open: (page: Page) => Promise<void> }[] = [
  {
    name: "the recipe list",
    open: async (page) => {
      await page.goto("/");
      await expect(page.getByRole("link", { name: /Tomato Stew/ })).toBeVisible();
    },
  },
  {
    name: "a recipe",
    open: async (page) => {
      await page.goto(`/recipes/${slug}`);
      await expect(page.getByRole("heading", { level: 1, name: "Tomato Stew" })).toBeVisible();
    },
  },
  {
    name: "the editor",
    open: async (page) => {
      await page.goto(`/recipes/${slug}/edit`);
      await expect(page.getByLabel("Title")).toHaveValue("Tomato Stew");
    },
  },
  {
    name: "the editor, with a step open",
    open: async (page) => {
      await page.goto(`/recipes/${slug}/edit`);
      await page.getByRole("button", { name: /^Edit step 1:/ }).click();
      await expect(page.getByLabel("Time", { exact: true })).toHaveValue("10 min");
      await expect(page.getByRole("button", { name: "Choose ingredients" })).toBeVisible();
    },
  },
  {
    name: "cook mode",
    open: async (page) => {
      await page.goto(`/recipes/${slug}/cook`);
      // The first step shows its time and the line it uses under its words.
      await expect(page.getByText("Soften the onions for 10 minutes.")).toBeVisible();
      await expect(page.locator("[data-step-details]").first()).toContainText("2 onions, sliced");
    },
  },
  {
    name: "the Add page",
    open: async (page) => {
      await page.goto("/add");
      await expect(page.getByRole("heading", { level: 1, name: "Add a recipe" })).toBeVisible();
    },
  },
  {
    name: "photographing cards, before the first card",
    open: async (page) => {
      await page.goto("/add/photos");
      await expect(page.getByRole("button", { name: "Photograph a card" })).toBeVisible();
    },
  },
  {
    // Mid-sitting with a card open, as the mock draws it: the same screen, with photos to show.
    name: "photographing cards",
    open: async (page) => {
      await page.goto("/mock/capture");
      await page.getByRole("button", { name: /^Change Card 2\b/ }).click();
      await expect(page.getByRole("button", { name: "Swap sides" })).toBeVisible();
    },
  },
  {
    name: "the manage screens",
    open: async (page) => {
      await page.goto("/manage/units");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    },
  },
  {
    name: "the manage index",
    open: async (page) => {
      await page.goto("/manage");
      await expect(page.getByRole("link", { name: /Import report/ })).toBeVisible();
    },
  },
  // What importing with AI added or changed is checked as the mock draws it:
  // the same screens, in states a library of one typed recipe does not have.
  {
    name: "the list, with photographed cards coming in",
    open: async (page) => {
      await page.goto("/mock/list?scene=cards");
      await expect(page.getByRole("list", { name: "Imports" })).toBeVisible();
    },
  },
  {
    name: "reviewing an import a model wrote up",
    open: async (page) => {
      await page.goto("/mock/review?scene=pasted");
      await expect(page.getByText(/Written up by AI/)).toBeVisible();
    },
  },
  {
    name: "reviewing an import in another language",
    open: async (page) => {
      await page.goto("/mock/review?scene=foreign");
      await expect(page.getByRole("button", { name: "Translate into English" })).toBeVisible();
    },
  },
  {
    name: "reviewing a photographed card",
    open: async (page) => {
      await page.goto("/mock/review?scene=card");
      await expect(page.getByLabel("Title")).toBeVisible();
    },
  },
  {
    name: "the editor, with a line the rules could not read",
    open: async (page) => {
      await page.goto("/recipes/new");
      await page.getByLabel("Add an ingredient").fill("Juice of 2 lemons");
      await page.getByLabel("Add an ingredient").press("Enter");
      await page.getByRole("button", { name: /^Edit Juice of 2 lemons/ }).click();
      await expect(page.getByRole("button", { name: "Read with AI" })).toBeVisible();
    },
  },
  {
    name: "the import report",
    open: async (page) => {
      await page.goto("/mock/report");
      await expect(page.getByRole("button", { name: "Run again with gemma" })).toBeVisible();
      await expect(page.getByText("Reading it again")).toBeVisible();
    },
  },
];

for (const theme of ["light", "dark"] as const) {
  for (const screen of screens) {
    test(`${screen.name} has no blocking accessibility findings, ${theme}`, async ({ page }) => {
      await page.addInitScript((chosen) => {
        localStorage.setItem("recipeflare:theme", chosen);
      }, theme);
      await screen.open(page);

      expect(await blocking(page)).toEqual([]);
    });
  }
}
