# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One household. Two adults are the primary users: they enter the recipes and they cook. Anyone else in the household may cook from the app.

They enter recipes mostly at a desktop for typing and on a phone for photographing cards. They cook with a phone propped on the kitchen counter, sometimes a tablet in landscape, with hands that are wet or floury and attention on the stove. The household uses both iPhone and Android.

## Product Purpose

Maverick Recipeflare (Recipeflare for short) is the household's own recipe app. Most of the family's recipes are on paper: index cards, notebook pages, clippings. The app gets them into one place, keeps a photo of the original card beside the typed recipe, and is what the household cooks from.

Success is the household cooking from it in place of the paper: a recipe found in a couple of taps and readable at arm's length while cooking.

## Positioning

It is built around paper recipes, not web recipes. Photographing a stack of cards is the main way recipes come in, the original card stays attached to the recipe, and every ingredient line keeps the words as they were written beside what the app understood. Nothing an importer produces becomes a recipe until a person has reviewed it.

Each household runs its own private copy on its own Cloudflare account. It is not a service with accounts on someone else's server.

## Operating Context

- Cooking: a phone on the counter or a tablet in landscape, in kitchen light that ranges from bright daylight to a dim evening, read at arm's length, touched with messy hands. The screen must stay on.
- Entering recipes: typing ingredient lines the way the card writes them ("2 1/4 C. flour", "1 t. soda"), or photographing the card, then reviewing the result against the original.
- The kitchen may have no network. Cook mode must not depend on it.
- Recipes arrive from paper cards first, then from web pages and, later, social-media videos.
- Later phases add a meal planner, shopping lists shared live between phones, and a Home Assistant connection.

## Capabilities and Constraints

- Phase 1, in progress: recipes with sections, structured ingredients, notes, photos and the original card; categories, tags and tools; foods, units and labels; full-text search and filters; import from a URL; cook mode that works offline.
- A recipe can record who or where it is from: a relative, a cookbook, a social-media account.
- Every Phase 1 action works on a phone. Designed at 390 px first; two columns from 768 px.
- Offline is read-only in Phase 1.
- The library is private by default, behind the household's sign-in. **The owner wants the option to make the recipe library public**, decided on 22 Nov 2026. Undecided: which phase, whether public means read-only, whether it covers the whole library or chosen recipes, and how it sits with Cloudflare Access.
- Terms the app uses: recipe, ingredient, step, section, note, category, tag, tool, food, unit, label, "From", original card, cook mode, import, review.
- One household per install. No multi-tenant features, open sign-up or user administration.

## Brand Commitments

- Name: Maverick Recipeflare, shortened to Recipeflare.
- The word Cloudflare and Cloudflare's flare shapes stay out of the name, the icon and the logo.
- It must not look or read like Mealie, the app it replaces. Features are built from a feature list, never from Mealie's components or copy.
- The owner does not want it to feel like a generic business app or like a food magazine or blog.

## Evidence on Hand

- Nine fixture recipes in `packages/schema/src/fixtures`: six invented, three transcribed from sample cards the owner supplied. Use these as demonstration content.
- No photographs of food or of the household's own cards are in the repository. Card and dish images in mock screens are placeholders and must be labelled as such.
- No logo or icon exists yet.
- Do not invent testimonials, user counts, ratings or claims about other households.

## Product Principles

1. The kitchen comes first. If a choice helps reading and touching while cooking, it wins over one that only looks good at a desk.
2. The household's words are kept. What was written on the card is never replaced by what the app made of it.
3. A person decides. Imports are proposals to review, not recipes.
4. It is the family's recipe box, not a product to browse. It should feel owned, not marketed.
5. Fast to the recipe. Opening the app to cooking should take a couple of taps.

## Accessibility & Inclusion

- WCAG 2.1 AA contrast in light and dark.
- Touch targets at least 44 by 44 CSS pixels.
- Text follows the browser's font-size setting up to 200%.
- Everything works from a keyboard, including reordering, with a visible focus ring.
- Motion is reduced when the device asks for it.
- Cook mode's step text is at least 20 px and works in portrait and landscape.
