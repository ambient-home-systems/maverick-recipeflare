import { expect, test } from "@playwright/test";
import { emptyLibrary } from "./helpers";

/** A recipe page on a site that answers a browser and nobody else. Invented, and served from here. */
const RECIPE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Refused Plum Cake</title>
<meta property="og:site_name" content="The Refusing Kitchen">
<script type="application/ld+json">${JSON.stringify({ "@type": "WebSite", name: "The Refusing Kitchen" })}</script>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Refused Plum Cake",
  author: { "@type": "Person", name: "Imogen Vale" },
  recipeYield: "8 servings",
  recipeIngredient: ["2 cups flour", "8 plums, halved"],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Mix the batter." },
    { "@type": "HowToStep", text: "Press in the plums and bake." },
  ],
})}</script></head><body><h1>Refused Plum Cake</h1></body></html>`;

test("a recipe is sent from the browser with the bookmark, checked and saved", async ({
  page,
  context,
  request,
}) => {
  await emptyLibrary(request);

  // The bookmark as the Add page makes it. On a phone-sized screen it is not shown, but it is there.
  await page.goto("/add");
  const bookmark = page.locator("a", { hasText: "Send to Recipeflare" });
  await expect(bookmark).toHaveAttribute("href", /^javascript:/);
  const script = decodeURIComponent(
    ((await bookmark.getAttribute("href")) ?? "").replace(/^javascript:/, ""),
  );

  // The cook opens the recipe in the browser, and presses the bookmark there.
  const site = await context.newPage();
  await site.route("https://refusing.example.com/**", (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: RECIPE_PAGE }),
  );
  await site.goto("https://refusing.example.com/recipes/plum-cake");
  const [app] = await Promise.all([context.waitForEvent("page"), site.evaluate(script)]);

  // The app opens with what the page says, and asks before doing anything.
  const sent = app.getByRole("region", { name: "Sent from your browser" });
  await expect(sent).toContainText("Refused Plum Cake");
  await expect(sent).toContainText("refusing.example.com");
  await sent.getByRole("button", { name: "Import this recipe" }).click();

  // It shows on the list like any import, and is reviewed like one.
  await expect(app).toHaveURL(/\/$/);
  await app.getByRole("button", { name: "Review" }).click({ timeout: 30_000 });
  await expect(app.getByLabel("Title")).toHaveValue("Refused Plum Cake");
  await expect(app.getByRole("button", { name: /^Edit 8 plums, halved/ })).toBeVisible();
  await app.getByRole("button", { name: "Save recipe" }).click();
  const foods = app.getByRole("dialog", { name: /Add \d+ foods?\?/ });
  if (await foods.isVisible().catch(() => false)) {
    await foods.getByRole("button", { name: /^Add/ }).click();
  }

  // Saved: a recipe, from the page's author, with its link back to the page.
  await expect(app).toHaveURL(/\/recipes\/refused-plum-cake$/);
  await expect(app.getByText("Imogen Vale")).toBeVisible();
  await expect(app.getByText("Press in the plums and bake.")).toBeVisible();
});
