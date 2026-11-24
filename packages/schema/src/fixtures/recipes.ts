import type { Asset, AssetRole, FoodRef, OrganizerKind, OrganizerRef, UnitRef } from "../lists";
import type { Ingredient, Recipe } from "../recipe";
import { namedIngredients, statedStepTime } from "../step-details";
import {
  FIXTURE_TIME,
  fixtureFoods,
  fixtureId,
  fixtureMember,
  fixtureOrganizers,
  fixtureUnits,
} from "./lists";

/**
 * Invented recipes that between them cover what the screens must handle:
 * sections, free-text lines beside parsed ones, a long recipe, a title-only
 * recipe, an imported recipe, photos of a paper card, notes and nutrition.
 *
 * The last three come from sample cards the owner supplied. Their ingredient
 * lines are kept exactly as written on the card, abbreviations and all, because
 * that is what the parser and the screens must cope with. Their steps are
 * reworded. The card photos themselves are not in the repository.
 */

function unit(name: string): UnitRef {
  const found = fixtureUnits.find((u) => u.name === name);
  if (!found) {
    throw new Error(`No fixture unit named "${name}"`);
  }
  const { id, pluralName, abbreviation, pluralAbbreviation, useAbbreviation, fraction } = found;
  return { id, name, pluralName, abbreviation, pluralAbbreviation, useAbbreviation, fraction };
}

function food(name: string): FoodRef {
  const found = fixtureFoods.find((f) => f.name === name);
  if (!found) {
    throw new Error(`No fixture food named "${name}"`);
  }
  return { id: found.id, name: found.name, pluralName: found.pluralName };
}

function organizers(kind: OrganizerKind, names: string[]): OrganizerRef[] {
  return names.map((name) => {
    const found = fixtureOrganizers.find((o) => o.kind === kind && o.name === name);
    if (!found) {
      throw new Error(`No fixture ${kind} named "${name}"`);
    }
    return { id: found.id, name: found.name, slug: found.slug };
  });
}

type LineSpec =
  /** A free-text line: shown as written, not scaled. */
  | string
  /** A parsed line: the text as written, then quantity, unit, food and note. */
  | [text: string, quantity: number | null, unit: string | null, food: string, note?: string];

type RecipeSpec = {
  title: string;
  slug: string;
  description?: string;
  servings?: number;
  yieldQuantity?: number;
  yieldUnit?: string;
  prepMinutes?: number;
  cookMinutes?: number;
  totalMinutes?: number;
  nutrition?: Recipe["nutrition"];
  sourceName?: string;
  sourceUrl?: string;
  ingredients?: { title: string | null; lines: LineSpec[] }[];
  steps?: { title: string | null; steps: string[] }[];
  notes?: { title: string; text: string }[];
  categories?: string[];
  tags?: string[];
  tools?: string[];
  assets?: AssetRole[];
  updatedAt?: string;
};

function buildRecipe(number: number, spec: RecipeSpec): Recipe {
  // Each recipe gets its own ID group so that child IDs never collide.
  const group = 0x10 + number;
  let counter = 1;
  const nextId = () => fixtureId(group, counter++);
  const id = nextId();
  // One a day from the first of the month, so that "newest" has an order to show.
  const createdAt = `2026-11-${String(number).padStart(2, "0")}T12:00:00.000Z`;

  const toIngredient = (line: LineSpec): Ingredient => {
    if (typeof line === "string") {
      return { id: nextId(), originalText: line, quantity: null, unit: null, food: null, note: "" };
    }
    const [text, quantity, unitName, foodName, note] = line;
    return {
      id: nextId(),
      originalText: text,
      quantity,
      unit: unitName ? unit(unitName) : null,
      food: food(foodName),
      note: note ?? "",
    };
  };

  const assets: Asset[] = (spec.assets ?? []).map((role, position) =>
    role === "attachment"
      ? {
          id: nextId(),
          role,
          position,
          contentType: "application/pdf",
          sizeBytes: 348_160,
          width: null,
          height: null,
          hasVariants: false,
          originalFilename: `${spec.slug}.pdf`,
          createdAt: FIXTURE_TIME,
        }
      : {
          id: nextId(),
          role,
          position,
          contentType: "image/jpeg",
          sizeBytes: 900_000,
          width: 2560,
          height: 1920,
          hasVariants: true,
          originalFilename: null,
          createdAt: FIXTURE_TIME,
        },
  );

  const minutes = (value: number | undefined) => (value === undefined ? null : value * 60);

  const ingredientSections = (spec.ingredients ?? []).map((section) => ({
    title: section.title,
    items: section.lines.map(toIngredient),
  }));
  // Each step's time and ingredients are what the app's own rules read from
  // its words, as they would be for a recipe typed into the editor.
  const named = ingredientSections
    .flatMap((section) => section.items)
    .map((item) => {
      const known = fixtureFoods.find((entry) => entry.id === item.food?.id);
      return {
        id: item.id,
        names: known ? [known.name, known.pluralName, ...known.aliases] : [],
      };
    });

  return {
    id,
    slug: spec.slug,
    version: 1,
    title: spec.title,
    description: spec.description ?? "",
    servings: spec.servings ?? null,
    yieldQuantity: spec.yieldQuantity ?? null,
    yieldUnit: spec.yieldUnit ?? null,
    prepTimeSeconds: minutes(spec.prepMinutes),
    cookTimeSeconds: minutes(spec.cookMinutes),
    totalTimeSeconds: minutes(spec.totalMinutes),
    nutrition: spec.nutrition ?? null,
    sourceName: spec.sourceName ?? null,
    sourceUrl: spec.sourceUrl ?? null,
    ingredientSections,
    stepSections: (spec.steps ?? []).map((section) => ({
      title: section.title,
      steps: section.steps.map((text) => ({
        id: nextId(),
        text,
        durationSeconds: statedStepTime(text),
        ingredientIds: namedIngredients(text, named),
      })),
    })),
    notes: (spec.notes ?? []).map((note) => ({ id: nextId(), ...note })),
    categories: organizers("category", spec.categories ?? []),
    tags: organizers("tag", spec.tags ?? []),
    tools: organizers("tool", spec.tools ?? []),
    assets,
    createdBy: fixtureMember.id,
    createdAt,
    updatedAt: spec.updatedAt ?? createdAt,
  };
}

/** A plain recipe: no sections, every line parsed. */
export const pancakes = buildRecipe(1, {
  title: "Buttermilk Pancakes",
  slug: "buttermilk-pancakes",
  description: "Thick, tender pancakes for a slow morning. The batter should stay lumpy.",
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 15,
  totalMinutes: 25,
  ingredients: [
    {
      title: null,
      lines: [
        ["2 cups all-purpose flour", 2, "cup", "all-purpose flour"],
        ["2 tbsp sugar", 2, "tablespoon", "sugar"],
        ["2 tsp baking powder", 2, "teaspoon", "baking powder"],
        ["1/2 tsp baking soda", 0.5, "teaspoon", "baking soda"],
        ["1/2 tsp salt", 0.5, "teaspoon", "salt"],
        ["2 cups buttermilk", 2, "cup", "buttermilk"],
        ["2 eggs", 2, null, "egg"],
        [
          "3 tbsp butter, melted, plus more for the griddle",
          3,
          "tablespoon",
          "butter",
          "melted, plus more for the griddle",
        ],
      ],
    },
  ],
  steps: [
    {
      title: null,
      steps: [
        "Whisk the flour, sugar, baking powder, baking soda and salt in a large bowl.",
        "In a second bowl, whisk the buttermilk, eggs and melted butter.",
        "Pour the wet ingredients into the dry and stir just until no dry flour shows. Leave the lumps.",
        "Heat a griddle over medium heat and butter it lightly.",
        "Pour a quarter cup of batter for each pancake. Cook until bubbles break on top, about 2 minutes, then flip and cook 1 to 2 minutes more.",
      ],
    },
  ],
  notes: [{ title: "Make ahead", text: "Mix the dry ingredients the night before." }],
  categories: ["Breakfast"],
  tags: ["Family favorite"],
  tools: ["Griddle"],
  assets: ["cover"],
  updatedAt: "2026-11-20T08:30:00.000Z",
});

/** Sections in both ingredients and steps, and free-text lines beside parsed ones. */
export const roastChicken = buildRecipe(2, {
  title: "Roast Chicken with Lemon and Thyme",
  slug: "roast-chicken-with-lemon-and-thyme",
  description: "One chicken, one pan, and a quick gravy from the drippings.",
  servings: 6,
  prepMinutes: 20,
  cookMinutes: 80,
  totalMinutes: 115,
  ingredients: [
    {
      title: "For the chicken",
      lines: [
        ["1 whole chicken, about 4 pounds", 1, null, "whole chicken", "about 4 pounds"],
        ["1 lemon, halved", 1, null, "lemon", "halved"],
        ["6 cloves garlic, smashed", 6, "clove", "garlic", "smashed"],
        ["4 sprigs thyme", 4, "sprig", "thyme"],
        ["2 tbsp olive oil", 2, "tablespoon", "olive oil"],
        "Salt and pepper, to taste",
      ],
    },
    {
      title: "For the gravy",
      lines: [
        ["2 tbsp all-purpose flour", 2, "tablespoon", "all-purpose flour"],
        ["1 1/2 cups chicken stock", 1.5, "cup", "chicken stock"],
        "A squeeze of lemon",
      ],
    },
  ],
  steps: [
    {
      title: "Roast",
      steps: [
        "Heat the oven to 425°F. Pat the chicken dry and set it in a roasting pan.",
        "Stuff the cavity with the lemon, garlic and thyme. Rub the skin with olive oil and season well with salt and pepper.",
        "Roast until the thickest part of the thigh reads 165°F, about 1 hour 20 minutes.",
        "Move the chicken to a board and rest it for 15 minutes.",
      ],
    },
    {
      title: "Make the gravy",
      steps: [
        "Pour off all but 2 tablespoons of fat from the pan. Set the pan over medium heat and stir in the flour for 1 minute.",
        "Whisk in the stock, scraping up the browned bits, and simmer until it coats a spoon, about 5 minutes.",
        "Finish with a squeeze of lemon and strain into a jug.",
      ],
    },
  ],
  categories: ["Dinner"],
  tags: ["Family favorite", "Holiday"],
  tools: ["Roasting pan"],
  assets: ["cover", "photo"],
  updatedAt: "2026-11-18T19:00:00.000Z",
});

/** A long recipe: 25 ingredient lines and 15 steps, with nutrition. */
export const beefChili = buildRecipe(3, {
  title: "Sunday Beef and Bean Chili",
  slug: "sunday-beef-and-bean-chili",
  description:
    "A big pot for a cold day. It is better the next day, and it freezes for three months.",
  servings: 8,
  yieldQuantity: 3,
  yieldUnit: "quarts",
  prepMinutes: 30,
  cookMinutes: 120,
  totalMinutes: 150,
  nutrition: {
    calories: "410",
    proteinContent: "31 g",
    fatContent: "17 g",
    carbohydrateContent: "34 g",
    fiberContent: "11 g",
    sodiumContent: "820 mg",
  },
  ingredients: [
    {
      title: "Chili",
      lines: [
        ["2 tbsp olive oil", 2, "tablespoon", "olive oil"],
        ["2 lb ground beef", 2, "pound", "ground beef"],
        ["2 yellow onions, diced", 2, null, "yellow onion", "diced"],
        ["2 red bell peppers, diced", 2, null, "red bell pepper", "diced"],
        ["1 jalapeño, seeded and minced", 1, null, "jalapeño", "seeded and minced"],
        ["6 cloves garlic, minced", 6, "clove", "garlic", "minced"],
        ["3 tbsp chili powder", 3, "tablespoon", "chili powder"],
        ["1 tbsp ground cumin", 1, "tablespoon", "ground cumin"],
        ["2 tsp smoked paprika", 2, "teaspoon", "smoked paprika"],
        ["2 tsp dried oregano", 2, "teaspoon", "dried oregano"],
        ["1 tbsp cocoa powder", 1, "tablespoon", "cocoa powder"],
        ["3 tbsp tomato paste", 3, "tablespoon", "tomato paste"],
        ["2 cans crushed tomatoes, 28 ounces each", 2, "can", "crushed tomatoes", "28 ounces each"],
        ["2 cups beef stock", 2, "cup", "beef stock"],
        ["2 cans kidney beans, drained and rinsed", 2, "can", "kidney beans", "drained and rinsed"],
        ["1 can black beans, drained and rinsed", 1, "can", "black beans", "drained and rinsed"],
        ["2 bay leaves", 2, null, "bay leaf"],
        ["1 tbsp brown sugar", 1, "tablespoon", "brown sugar"],
        ["2 tsp salt, plus more to taste", 2, "teaspoon", "salt", "plus more to taste"],
        ["1 tsp black pepper", 1, "teaspoon", "black pepper"],
        ["1 tbsp cider vinegar", 1, "tablespoon", "cider vinegar"],
      ],
    },
    {
      title: "To serve",
      lines: [
        ["1 cup sour cream", 1, "cup", "sour cream"],
        ["2 cups cheddar cheese, grated", 2, "cup", "cheddar cheese", "grated"],
        ["4 scallions, sliced", 4, null, "scallion", "sliced"],
        "Lime wedges and a handful of cilantro",
      ],
    },
  ],
  steps: [
    {
      title: null,
      steps: [
        "Heat the oil in a Dutch oven over medium-high heat.",
        "Add half the beef in one layer and brown it without stirring for 4 minutes. Break it up, cook 2 minutes more, and move it to a bowl.",
        "Brown the rest of the beef the same way and add it to the bowl.",
        "Lower the heat to medium. Add the onions and peppers with a pinch of salt and cook until soft, about 8 minutes.",
        "Stir in the jalapeño and garlic and cook 1 minute.",
        "Add the chili powder, cumin, paprika, oregano and cocoa. Stir for 1 minute until the spices smell toasted.",
        "Stir in the tomato paste and cook until it darkens, about 2 minutes.",
        "Return the beef and its juices to the pot.",
        "Add the crushed tomatoes and stock, scraping the bottom of the pot.",
        "Add the bay leaves, brown sugar, salt and pepper and bring to a simmer.",
        "Partly cover and simmer gently for 1 hour, stirring now and then.",
        "Stir in the kidney beans and black beans.",
        "Simmer uncovered for 30 minutes more, until thick.",
        "Take out the bay leaves. Stir in the vinegar and taste for salt.",
        "Serve with sour cream, cheddar, scallions, lime and cilantro.",
      ],
    },
  ],
  notes: [
    { title: "Heat", text: "Leave the jalapeño seeds in for a hotter pot." },
    { title: "Freezing", text: "Cool completely and freeze flat in bags for up to 3 months." },
  ],
  categories: ["Dinner"],
  tags: ["Freezes well", "Weeknight"],
  tools: ["Dutch oven"],
  assets: ["cover"],
  updatedAt: "2026-11-15T17:45:00.000Z",
});

/** A baking recipe entered from a paper card: a yield, and the card's front and back. */
export const cardamomCookies = buildRecipe(4, {
  title: "Cardamom Sugar Cookies",
  slug: "cardamom-sugar-cookies",
  description: "Crisp at the edge and soft in the middle.",
  sourceName: "Aunt June",
  yieldQuantity: 36,
  yieldUnit: "cookies",
  prepMinutes: 20,
  cookMinutes: 10,
  ingredients: [
    {
      title: null,
      lines: [
        ["2 3/4 cups all-purpose flour", 2.75, "cup", "all-purpose flour"],
        ["1 tsp baking soda", 1, "teaspoon", "baking soda"],
        ["1/2 tsp baking powder", 0.5, "teaspoon", "baking powder"],
        ["1 1/2 tsp ground cardamom", 1.5, "teaspoon", "ground cardamom"],
        ["2 sticks butter, softened", 2, "stick", "butter", "softened"],
        ["1 1/2 cups sugar, plus more for rolling", 1.5, "cup", "sugar", "plus more for rolling"],
        ["1 egg", 1, null, "egg"],
        ["1 tsp vanilla extract", 1, "teaspoon", "vanilla extract"],
      ],
    },
  ],
  steps: [
    {
      title: null,
      steps: [
        "Heat the oven to 375°F. Stir together the flour, baking soda, baking powder and cardamom.",
        "Beat the butter and sugar until pale and fluffy, about 3 minutes. Beat in the egg and vanilla.",
        "Mix in the dry ingredients on low speed until a dough forms.",
        "Roll level tablespoons of dough into balls, roll them in sugar, and set them 2 inches apart on ungreased sheets.",
        "Bake 8 to 10 minutes, until the edges are just golden. Cool on the sheet for 2 minutes, then on a rack.",
      ],
    },
  ],
  notes: [{ title: "Written on the back", text: "Double it at Christmas." }],
  categories: ["Dessert"],
  tags: ["Holiday", "Family favorite"],
  tools: ["Stand mixer"],
  assets: ["cover", "original", "original", "attachment"],
  updatedAt: "2026-11-10T14:00:00.000Z",
});

/** The smallest valid recipe: a title and nothing else. */
export const cinnamonToast = buildRecipe(5, {
  title: "Cinnamon Toast",
  slug: "cinnamon-toast",
  updatedAt: "2026-11-21T07:10:00.000Z",
});

/** An imported recipe: it has a source link, and some lines were left as written. */
export const lentilSoup = buildRecipe(6, {
  title: "Lemony Red Lentil Soup",
  slug: "lemony-red-lentil-soup",
  description: "A quick soup from the pantry, bright with lemon at the end.",
  servings: 4,
  totalMinutes: 40,
  sourceName: "Example Kitchen",
  sourceUrl: "https://example.com/recipes/lemony-red-lentil-soup",
  ingredients: [
    {
      title: null,
      lines: [
        ["2 tbsp olive oil", 2, "tablespoon", "olive oil"],
        ["1 yellow onion, chopped", 1, null, "yellow onion", "chopped"],
        ["2 carrots, chopped", 2, null, "carrot", "chopped"],
        "2 ribs celery, chopped",
        ["3 cloves garlic, minced", 3, "clove", "garlic", "minced"],
        ["1 tsp ground cumin", 1, "teaspoon", "ground cumin"],
        ["1 1/2 cups red lentils, rinsed", 1.5, "cup", "red lentils", "rinsed"],
        "6 cups water or vegetable stock",
        ["1 lemon, juiced", 1, null, "lemon", "juiced"],
        "Salt, pepper and a pinch of chili flakes",
      ],
    },
  ],
  steps: [
    {
      title: null,
      steps: [
        "Warm the oil in a large pot over medium heat. Cook the onion, carrots and celery until soft, about 8 minutes.",
        "Stir in the garlic and cumin for 1 minute.",
        "Add the lentils and water. Bring to a boil, then simmer until the lentils fall apart, about 20 minutes.",
        "Blend half the soup, stir it back in, and season with the lemon juice, salt, pepper and chili flakes.",
      ],
    },
  ],
  categories: ["Soup", "Dinner"],
  tags: ["Vegetarian", "Weeknight"],
  updatedAt: "2026-11-19T12:15:00.000Z",
});

/**
 * Sample card 1: a neat page with a bulleted ingredient list and five numbered
 * steps. It states no yield, time or source.
 */
export const cardPancakes = buildRecipe(7, {
  title: "Pancakes",
  slug: "pancakes",
  ingredients: [
    {
      title: null,
      lines: [
        ["1 egg", 1, null, "egg"],
        ["1 1/2 cups all purpose flour", 1.5, "cup", "all-purpose flour"],
        ["3/4 tsp salt", 0.75, "teaspoon", "salt"],
        ["2 tbsp sugar", 2, "tablespoon", "sugar"],
        ["4 tbsp butter melted", 4, "tablespoon", "butter", "melted"],
        ["1 1/4 cups milk", 1.25, "cup", "milk"],
        ["1 tbsp baking powder", 1, "tablespoon", "baking powder"],
      ],
    },
  ],
  steps: [
    {
      title: null,
      steps: [
        "Stir the flour, salt, sugar and baking powder together in a bowl.",
        "In a second bowl, stir the egg, melted butter and milk together.",
        "Combine the two and mix to a smooth batter.",
        "Put a frying pan over medium heat.",
        "Once the pan is hot, cook the pancakes for about 1 minute per side, until golden.",
      ],
    },
  ],
  categories: ["Breakfast"],
  assets: ["original"],
  updatedAt: "2026-11-22T09:00:00.000Z",
});

/**
 * Sample card 2: an index card with ingredients in two columns and the method
 * as one paragraph. One ingredient names a brand and a can size, and the method
 * refers to "the first 5 ingredients", so the order of the lines matters.
 */
export const cardMeatLoaf = buildRecipe(8, {
  title: "Meat Loaf",
  slug: "meat-loaf",
  cookMinutes: 25,
  ingredients: [
    {
      title: null,
      lines: [
        ["2 lbs. ground chuck", 2, "pound", "ground chuck"],
        ["1/3 c. minced onions", 1 / 3, "cup", "onion", "minced"],
        ["1 tsp salt", 1, "teaspoon", "salt"],
        ["1/4 tsp oregano", 0.25, "teaspoon", "dried oregano"],
        ["1 egg, slightly beaten", 1, null, "egg", "slightly beaten"],
        [
          "1 - (15 1/2 oz can) Chef Boy-ar-Dee spaghetti sauce with mushrooms",
          1,
          "can",
          "spaghetti sauce",
          "15 1/2 oz, Chef Boy-ar-Dee, with mushrooms",
        ],
        ["1 1/2 c. cooked rice", 1.5, "cup", "cooked rice"],
        ["1/3 c. minced green pepper", 1 / 3, "cup", "green bell pepper", "minced"],
      ],
    },
  ],
  steps: [
    {
      title: null,
      steps: [
        "Heat the oven to 400°F.",
        "Mix the ground chuck, onions, salt, oregano and egg. Mix in 1/4 cup of the spaghetti sauce.",
        "On waxed paper, press the meat into a 12 by 7 inch rectangle and cut it crosswise into 6 strips.",
        "Mix the rice, green pepper and another 1/4 cup of sauce. Divide it into 6 portions and set one in the middle of each strip.",
        "Fold the meat over the rice and shape each strip into a small loaf.",
        "Set the loaves on a baking sheet and spoon 1/2 cup of sauce over them.",
        "Bake for 25 minutes.",
      ],
    },
  ],
  categories: ["Dinner"],
  assets: ["original"],
  updatedAt: "2026-11-22T09:05:00.000Z",
});

/**
 * Sample card 3: a handwritten page with one-letter unit abbreviations
 * ("C.", "t."), shorthand food names ("soda", "B. Sugar"), a package size as a
 * quantity, a stated yield, and two amounts whose pen marks are hard to read.
 */
export const cardPanCookies = buildRecipe(9, {
  title: "Chocolate Chip Pan Cookies",
  slug: "chocolate-chip-pan-cookies",
  yieldQuantity: 35,
  yieldUnit: "squares",
  cookMinutes: 20,
  ingredients: [
    {
      title: null,
      lines: [
        ["2 1/4 C. flour", 2.25, "cup", "all-purpose flour"],
        ["1 t. soda", 1, "teaspoon", "baking soda"],
        ["1 t. salt", 1, "teaspoon", "salt"],
        ["1 t. vanilla", 1, "teaspoon", "vanilla extract"],
        ["2 eggs", 2, null, "egg"],
        ["1 - 12 oz Chocolate Chips", 12, "ounce", "chocolate chips"],
        ["1 cup Nuts", 1, "cup", "nuts"],
        ["1 C. Butter, Softened", 1, "cup", "butter", "softened"],
        ["3/4 C Sugar", 0.75, "cup", "sugar"],
        ["3/4 C B. Sugar - Firmly Packed", 0.75, "cup", "brown sugar", "firmly packed"],
      ],
    },
  ],
  steps: [
    {
      title: null,
      steps: [
        "In a small bowl, stir together the flour, baking soda and salt. Set it aside.",
        "In a large bowl, beat the butter, sugar, brown sugar and vanilla until creamy. Beat in the eggs.",
        "Add the flour mixture a little at a time and mix well. Stir in the chocolate chips and nuts.",
        "Spread the dough in a greased 15 by 10 by 1 inch pan.",
        "Bake at 375°F for 20 minutes.",
        "Cut into 2-inch squares.",
      ],
    },
  ],
  notes: [
    {
      title: "Reading the card",
      text: "The two sugar amounts are marked with a pen line that could be an underline or a strike-through. They are entered as 3/4 cup each.",
    },
  ],
  categories: ["Dessert"],
  assets: ["original"],
  updatedAt: "2026-11-22T09:10:00.000Z",
});

export const fixtureRecipes: Recipe[] = [
  pancakes,
  roastChicken,
  beefChili,
  cardamomCookies,
  cinnamonToast,
  lentilSoup,
  cardPancakes,
  cardMeatLoaf,
  cardPanCookies,
];
