import { expect, test } from "@playwright/test";
import { appInstalled, emptyLibrary, gradientPng, onDevice, samplePdf } from "./helpers";

/**
 * The main path, as one cook would walk it: type a recipe in, find it, cook
 * from it, lose the connection, carry on, then change it and delete it.
 */
test("a recipe is typed in, found, cooked from offline, edited and deleted", async ({
  page,
  context,
  request,
}) => {
  await emptyLibrary(request);

  // An empty library says so and offers a way in.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "No recipes yet" })).toBeVisible();
  await page.getByRole("link", { name: "Type a recipe" }).click();

  // Type a recipe, with a photo and a file that is not one.
  await expect(page.getByRole("heading", { level: 1, name: "New recipe" })).toBeVisible();
  await page.getByLabel("Title").fill("Plum Cake");
  await page.getByLabel("Description").fill("For the end of summer.");
  const ingredient = page.getByLabel("Add an ingredient");
  for (const line of ["2 cups flour", "1 cup sugar", "8 plums, halved"]) {
    await ingredient.fill(line);
    await ingredient.press("Enter");
  }
  const step = page.getByLabel("Add a step");
  for (const text of ["Mix the flour and sugar.", "Press in the plums.", "Bake until golden."]) {
    await step.fill(text);
    await step.press("Enter");
  }
  await page.getByLabel("Add photos").setInputFiles({
    name: "plum-cake.png",
    mimeType: "image/png",
    buffer: gradientPng(1200, 900),
  });
  await page.getByLabel("Add files").setInputFiles({
    name: "plum-cake-card.pdf",
    mimeType: "application/pdf",
    buffer: samplePdf(),
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // Foods the household does not have yet are confirmed once.
  const foods = page.getByRole("dialog", { name: /Add \d+ foods?\?/ });
  await expect(foods).toBeVisible();
  await foods.getByRole("button", { name: /^Add/ }).click();

  // Saved: the recipe is shown at its own address, as it was typed.
  await expect(page).toHaveURL(/\/recipes\/plum-cake$/);
  await expect(page.getByRole("heading", { level: 1, name: "Plum Cake" })).toBeVisible();
  await expect(page.getByText("8 plums, halved")).toBeVisible();
  await expect(page.getByText("Bake until golden.")).toBeVisible();
  await expect(page.locator("main img").first()).toHaveJSProperty("complete", true);

  // The file that is not a picture is listed by name, and comes back as it went.
  const attachment = page.getByRole("link", { name: /plum-cake-card\.pdf/ });
  await expect(attachment).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), attachment.click()]);
  expect(download.suggestedFilename()).toBe("plum-cake-card.pdf");

  // Find it from the list, by a word in an ingredient.
  await page.getByRole("link", { name: "All recipes" }).first().click();
  await page.getByRole("searchbox").fill("plums");
  await expect(page).toHaveURL(/q=plums/);
  const row = page.getByRole("link", { name: /Plum Cake/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("heading", { level: 1, name: "Plum Cake" })).toBeVisible();

  // The app is on the device, and so is the recipe.
  await appInstalled(page);
  await onDevice(page, "plum-cake");

  // Cook from it, and tick a step.
  await page.getByRole("button", { name: "Cook" }).click();
  await expect(page).toHaveURL(/\/recipes\/plum-cake\/cook$/);
  await page.getByText("Mix the flour and sugar.").click();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(1);

  // The connection goes. A reload still opens cook mode, with the tick kept.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Press in the plums.")).toBeVisible();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(1);

  // The list still has the recipe, and says where it is from.
  await page.goto("/");
  await expect(page.getByText(/These are the recipes saved on this device/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Plum Cake/ })).toBeVisible();

  // Back online: change the title, and the recipe moves to its new address.
  await context.setOffline(false);
  await page.goto("/recipes/plum-cake");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Title").fill("Late Summer Plum Cake");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/late-summer-plum-cake$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Late Summer Plum Cake" }),
  ).toBeVisible();

  // Delete it. It asks first, and the library is empty again.
  await page.getByRole("button", { name: "Delete recipe" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("Late Summer Plum Cake");
  await confirm.getByRole("button", { name: /Delete/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "No recipes yet" })).toBeVisible();
});
