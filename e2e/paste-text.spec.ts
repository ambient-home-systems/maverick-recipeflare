import { expect, test } from "@playwright/test";
import { emptyLibrary } from "./helpers";

/** A recipe as a cook might paste it from a message. Invented. */
const PASTED = `Plum Crumble

Ingredients:
6 plums, halved
1 cup flour
1/2 cup butter, cold
1/3 cup sugar

Method:
Lay the plums in a dish.
Rub the butter into the flour and sugar and scatter over the plums.
Bake at 375 until golden.`;

test("pasted text is written up, checked against the text and saved", async ({ page, request }) => {
  await emptyLibrary(request);

  await page.goto("/add");
  await page.getByLabel("Recipe text").fill(PASTED);
  await page.getByRole("button", { name: "Import text" }).click();

  // It shows on the list as an import, and the queue writes it up. The model
  // here is the scripted stand-in: what a real one makes of text is seen on staging.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("list", { name: "Imports" })).toContainText("Pasted text");
  await page.getByRole("button", { name: "Review" }).click({ timeout: 30_000 });

  // Review says a model wrote it, and shows the text beside the draft.
  await expect(page.getByLabel("Title")).toHaveValue("Plum Crumble");
  await expect(page.getByText(/Written up by AI from/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Edit 6 plums, halved/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Edit step 3: Bake at 375 until golden\./ }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Original" }).check({ force: true });
  await expect(page.getByRole("complementary", { name: "Original" })).toContainText(
    "Rub the butter into the flour and sugar and scatter over the plums.",
  );
  await page.getByRole("radio", { name: "Recipe" }).check({ force: true });

  await page.getByRole("button", { name: "Save recipe" }).click();
  const foods = page.getByRole("dialog", { name: /Add \d+ foods?\?/ });
  if (await foods.isVisible().catch(() => false)) {
    await foods.getByRole("button", { name: /^Add/ }).click();
  }

  // Saved: a recipe like any other, and the import is gone from the list.
  await expect(page).toHaveURL(/\/recipes\/plum-crumble$/);
  await expect(page.getByText("Lay the plums in a dish.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Plum Crumble/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Imports" })).toHaveCount(0);
});

test("pasted text with no recipe in it fails, saying so, and can be removed", async ({
  page,
  request,
}) => {
  await emptyLibrary(request);

  await page.goto("/add");
  await page.getByLabel("Recipe text").fill("Running late, back by six. Can you feed the cat?");
  await page.getByRole("button", { name: "Import text" }).click();

  const imports = page.getByRole("list", { name: "Imports" });
  await expect(imports).toContainText("There was not enough there to make a recipe from.", {
    timeout: 30_000,
  });
  await imports.getByRole("button", { name: "Remove" }).click();
  await expect(imports).toHaveCount(0);
});
