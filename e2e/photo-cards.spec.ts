import { expect, test } from "@playwright/test";
import { emptyLibrary, gradientPng } from "./helpers";

/** A picture that stands for a photo of a card. Made here: no photograph is kept in the repository. */
const side = (name: string, width = 640) => ({
  name,
  mimeType: "image/png",
  buffer: gradientPng(width, 480),
});

test("a sitting of two cards is photographed, sent, reviewed one after the other and saved", async ({
  page,
  request,
}) => {
  await emptyLibrary(request);

  await page.goto("/add");
  await page.getByRole("button", { name: "Photograph cards" }).click();
  await expect(page).toHaveURL(/\/add\/photos$/);

  // The camera is a file input: the test hands it a picture as a phone's camera would.
  const camera = page.locator('input[data-capture="camera"]');
  const shoot = async (button: string, picture: ReturnType<typeof side>) => {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: button }).click(),
    ]);
    await chooser.setFiles(picture);
  };
  await expect(camera).toHaveAttribute("capture", "environment");
  await shoot("Photograph a card", side("card-1-front.png"));
  await shoot("Add the back", side("card-1-back.png", 600));
  await shoot("Next card", side("card-2-front.png", 620));
  const pile = page.getByRole("list", { name: "Cards" });
  await expect(pile.getByRole("button", { name: /^Change Card 1\b/ })).toContainText(
    "Front and back",
  );
  await expect(pile.getByRole("button", { name: /^Change Card 2\b/ })).toContainText("Front only");

  // Nothing has left the phone yet. Import sends each card, and the list shows them coming in.
  await page.getByRole("button", { name: "Import 2 cards" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  const reviews = page.getByRole("button", { name: "Review" });
  await expect(reviews).toHaveCount(2, { timeout: 30_000 });

  // The first card photographed is reviewed first, with its two photos beside the draft.
  // The model here is the scripted stand-in, which reads the same words from any card.
  await reviews.last().click();
  await expect(page.getByLabel("Title")).toHaveValue("Stand-in Shortbread");
  await expect(page.getByText(/Written up by AI from/)).toContainText("a photo of card 1");
  await expect(
    page.getByRole("button", { name: /1\/2 cup sugar: The amount is written over\./ }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Original" }).check({ force: true });
  const original = page.getByRole("complementary", { name: "Original" });
  await expect(original.getByRole("button")).toHaveCount(2);
  await page.getByRole("radio", { name: "Recipe" }).check({ force: true });

  // Saving it goes straight on to the second card.
  await page.getByLabel("Title").fill("Card One Shortbread");
  const firstReview = page.url();
  await page.getByRole("button", { name: "Save and next card" }).click();
  // Foods the household does not have yet are confirmed once; an earlier spec may have added them.
  const foods = page.getByRole("dialog", { name: /Add \d+ foods?\?/ });
  if (await foods.isVisible().catch(() => false)) {
    await foods.getByRole("button", { name: /^Add/ }).click();
  }
  await expect(page).toHaveURL(/\/imports\/[^/]+\/review$/);
  await expect(page).not.toHaveURL(firstReview);
  await expect(page.getByLabel("Title")).toHaveValue("Stand-in Shortbread");
  await page.getByRole("radio", { name: "Original" }).check({ force: true });
  await expect(
    page.getByRole("complementary", { name: "Original" }).getByRole("button"),
  ).toHaveCount(1);
  await page.getByRole("radio", { name: "Recipe" }).check({ force: true });
  await page.getByLabel("Title").fill("Card Two Shortbread");
  await page.getByRole("button", { name: "Save recipe" }).click();
  if (await foods.isVisible().catch(() => false)) {
    await foods.getByRole("button", { name: /^Add/ }).click();
  }

  // Both are recipes, and the first keeps both sides of its card as its original.
  await expect(page).toHaveURL(/\/recipes\/card-two-shortbread$/);
  await page.goto("/recipes/card-one-shortbread");
  await expect(page.getByRole("heading", { level: 1, name: "Card One Shortbread" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Original card/ })).toContainText("2");
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Imports" })).toHaveCount(0);

  // The report says what review changed in each: here the titles and nothing else.
  await page.goto("/manage");
  await page.getByRole("link", { name: /Import report/ }).click();
  await expect(page).toHaveURL(/\/manage\/import-report$/);
  const each = page.getByRole("list", { name: "Each import" });
  const cardOne = each.getByRole("listitem").filter({ hasText: "Card One Shortbread" });
  const cardTwo = each.getByRole("listitem").filter({ hasText: "Card Two Shortbread" });
  await expect(cardOne).toContainText("Photographed card 1");
  await expect(cardOne).toContainText("As you saved it, from the standard draft: No changes.");
  await expect(cardOne).toContainText("Title changed.");
  await expect(cardTwo).toContainText("Photographed card 2");

  // The owner runs both cards again with another set of models. The stand-in
  // reads the same words whoever it is said to be, so the runs agree.
  await page.getByRole("button", { name: "Run again with gemma" }).click();
  await expect(page.getByText(/^Started 2 runs with gemma\./)).toBeVisible();
  for (const card of [cardOne, cardTwo]) {
    await expect(card).toContainText("Run again with gemma: No changes.", { timeout: 60_000 });
  }
  // A run that is compared is nobody's to review: the list shows no import.
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Imports" })).toHaveCount(0);
});
