---
version: 1
slug: "src-pages-recipes-recipelistscreen-tsx"
primary_target: "src/pages/recipes/RecipeListScreen.tsx"
related_targets: ["src/pages/add/AddScreen.tsx","src/mock/MockList.tsx"]
---

# Recipe list and search

Scope: the app's home screen (search, category dividers, filters, sort, recipe rows, imports in progress) and the Add screen that feeds it. Built first as mock screens at `/mock/list` and `/mock/add` from fixture recipes (task T0.7); the same components become the real screens in Phase 1. Mode: Operate.

Audience and job: a cook with a phone on the counter who wants one recipe out of a few hundred. They find it by remembering a word in it, by thumbing to its category, or by what is in the cupboard. Success is the recipe on screen in a couple of taps.

Constraints: everything in the shell brief (`src-shell-appshell-tsx.md`), which this screen sits inside. Search text, category, filters and sort live in the page address. Most recipes have no photo. The list is read-only offline.

## Direction contract

This screen extends the shell's contract; it does not open a new one. The shell brief's FIRST VIEWPORT describes this screen, and its THESIS, OWN-WORLD, SIGNATURE and RAISES apply unchanged.

STORY: the cook types a word or taps a divider, and the tin shows only the cards that fit.

FIRST VIEWPORT, as built: navy header with the wordmark and a full-width search field; divider tabs, the selected one joined to the stack; the stack's title on the red rule with the count beside it; one toolbar row (Filter, Sort); then ruled recipe rows, six or more to a phone screen.

DECISIONS:
- Category is chosen with the divider tabs, one at a time. Tags, tools and foods are chosen in a filter sheet, any number, and every one must match. This keeps the signature doing real work and keeps the sheet short.
- The filter sheet applies each choice at once; its primary button says how many recipes are left. Filters in use sit above the list as chips that are pressed to remove.
- A row's one line is time, category, "From", then up to two tags in the heavier weight. Behind a category's divider the category is left out of the line.
- A recipe with a photo shows it at the letter tile's size and shape. A recipe without one keeps its letter tile; there is no "missing photo" look.
- Imports are rows on a sunk ground above the recipes, with a link tile in plain stock: they are not recipes yet and take no category colour. They step aside while the list is narrowed.
- Adding is one destination, the red Add in the navigation. Its page offers typing a recipe and importing from a link. The populated list carries no second Add control; the first-run state offers both ways directly.
- On the first run there is nothing to search or filter, so the search field, the dividers and the toolbar are absent.
- The placeholder in the search field is ink at regular weight; typed text is semibold. There is no grey placeholder.
- From tablet width the search field sits on the ground above the dividers, because the navy header is replaced by the rail.

FINISH: reviewed by the finish reviewer, and DESIGN.md updated for the components this screen adds (search field, chips, sheet, import row).

## Unresolved

- Whether the search field should stay in view while the list scrolls.
- How a search result shows why it matched when the match is in an ingredient.
- The real thumbnails: sizes and how they load are decided with images and attachments (T1.10).
