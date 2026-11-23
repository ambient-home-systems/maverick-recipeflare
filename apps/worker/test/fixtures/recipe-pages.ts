/**
 * Recipe pages for the link importer's tests. Every page is invented: the
 * markup copies the shapes real sites publish, and none of the words.
 */

const page = (head: string, body = "<h1>A page</h1>") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A page</title>${head}</head><body>${body}</body></html>`;

const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

/** A recipe alone at the top of one block, with everything a page can state. */
export const plainPage = page(
  `<meta property="og:site_name" content="The Invented Kitchen">${ld({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Skillet Corn Cakes",
    description: "Crisp-edged corn cakes for a weeknight.",
    author: { "@type": "Person", name: "Odalys Brandt" },
    image: ["/pictures/corn-cakes-wide.jpg", "/pictures/corn-cakes-square.jpg"],
    recipeYield: ["4", "4 servings"],
    prepTime: "PT10M",
    cookTime: "PT20M",
    totalTime: "PT30M",
    recipeCategory: "Side dishes",
    recipeCuisine: "Invented",
    keywords: "corn, skillet, quick",
    recipeIngredient: [
      "1 cup cornmeal",
      "1/2 cup flour",
      "1 egg",
      "3/4 cup buttermilk",
      "2 Tbsp butter, melted",
    ],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Whisk the cornmeal and flour together." },
      { "@type": "HowToStep", text: "Stir in the egg, buttermilk and butter." },
      { "@type": "HowToStep", text: "Fry spoonfuls in a hot skillet until golden on both sides." },
    ],
    nutrition: { "@type": "NutritionInformation", calories: "210 kcal", proteinContent: "6 g" },
  })}`,
);

/** The shape a common publishing plugin writes: one `@graph` holding the page, the site and the recipe. */
export const graphPage = page(
  ld({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: "Graph Kitchen", url: "https://graph.example.com/" },
      { "@type": "WebPage", name: "Plum Slump - Graph Kitchen" },
      { "@type": "Person", "@id": "#author", name: "Site Owner" },
      {
        "@type": "Recipe",
        name: "Plum Slump",
        author: { "@id": "#author" },
        publisher: { "@type": "Organization", name: "Graph Kitchen" },
        image: { "@type": "ImageObject", url: "https://graph.example.com/plum.jpg" },
        recipeYield: "Makes 1 dish",
        recipeIngredient: ["2 lb plums, halved", "1 cup flour"],
        recipeInstructions: [
          {
            "@type": "HowToSection",
            name: "Fruit",
            itemListElement: [
              { "@type": "HowToStep", text: "Simmer the plums until soft." },
              { "@type": "HowToStep", name: "Sweeten", text: "Sweeten to taste." },
            ],
          },
          {
            "@type": "HowToSection",
            name: "Topping",
            itemListElement: [{ "@type": "HowToStep", text: "Drop the dough on top and cover." }],
          },
        ],
      },
    ],
  }),
);

/** Several things in a list at the top, the recipe typed as two things at once, the method as one string. */
export const listPage = page(
  ld([
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1 }] },
    {
      "@type": ["Recipe", "NewsArticle"],
      name: "Pan Toast &amp; Jam",
      recipeYield: 2,
      totalTime: "PT1H15M",
      recipeIngredient: ["4 slices bread", "&frac12; cup jam", "<b>butter</b> for the pan"],
      recipeInstructions: "Butter the pan.<br>Toast the bread on both sides.\nSpread with jam.",
      keywords: ["breakfast", "toast"],
    },
  ]),
);

/** A block that is not valid JSON, then one with a line break typed inside a string, which is. */
export const brokenBlockPage = page(
  `<script type="application/ld+json">{ "@type": "Recipe", "name": </script>
   <script type="application/ld+json">{ "@type": "Recipe", "name": "Mended
Soup", "recipeIngredient": ["1 onion"], "recipeInstructions": ["Simmer."] }</script>`,
);

/** The recipe is the page's main entity, not at the top. */
export const mainEntityPage = page(
  ld({
    "@type": "WebPage",
    mainEntity: {
      "@type": "Recipe",
      name: "Nested Noodles",
      recipeYield: "Makes 24 dumplings",
      recipeIngredient: ["200 g noodles"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Boil the noodles." }],
    },
  }),
);

/** A page about food with no recipe described on it. */
export const articlePage = page(
  ld({ "@type": "Article", headline: "Ten Things To Do With Plums" }),
  "<h1>Ten Things To Do With Plums</h1><p>1 cup flour. Mix. Bake.</p>",
);

/** A page with no structured data at all. */
export const barePage = page("", "<h1>Grandmother's Biscuits</h1><p>2 cups flour</p>");
