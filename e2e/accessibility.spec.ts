import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { emptyLibrary, makeRecipe } from "./helpers";

/**
 * An automated accessibility check of the screens a cook uses. It catches
 * what a machine can: contrast, names, roles, labels. It does not replace
 * using the app with a screen reader.
 */

// A tall page, so nothing is judged while it happens to sit half under the navigation bar.
test.use({ viewport: { width: 412, height: 2600 } });

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
    name: "cook mode",
    open: async (page) => {
      await page.goto(`/recipes/${slug}/cook`);
      await expect(page.getByText("Soften the onions.")).toBeVisible();
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
