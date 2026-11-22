---
version: 1
slug: "src-pages-recipe-recipeviewscreen-tsx"
primary_target: "src/pages/recipe/RecipeViewScreen.tsx"
related_targets: ["src/pages/recipe/PhotoViewer.tsx","src/mock/MockRecipe.tsx"]
---

# Recipe view

Scope: one recipe shown for reading (task T0.8), built as real components in `src/pages/recipe/` and drawn at `/mock/recipe/<slug>` from the fixture recipes. Mode: Operate.

Audience and job: someone deciding whether to cook this, checking what it needs, or reading it at the counter before cook mode. They want the ingredients quickly, the amounts for the number they are feeding, and the original card when the typed version is in doubt.

Constraints: everything in the shell brief (`src-shell-appshell-tsx.md`). Most recipes have a photographed card and no photograph of the dish. A recipe may be nothing but a title, or 25 ingredients and 15 steps. Read-only offline.

## Direction contract

This screen extends the shell's contract; it does not open a new one. THESIS, OWN-WORLD, SIGNATURE and RAISES apply unchanged.

STORY: the cook pulls one card out from behind its divider, reads it, and can always see the card it was typed from.

FIRST VIEWPORT, on a phone: navy header; the divider links "All recipes" and the recipe's category in its stock; the title on the red rule; description and "From"; small pictures for photos and the original card; the facts row; the Ingredients band with the scale switch; and the action bar with Cook and Edit above the navigation.

DECISIONS:
- The signature carries over as wayfinding: the recipe stands behind its category's divider, and the divider is the way back. No divider is drawn selected.
- No large photo. Pictures are thumbnails that open full screen, and the original card has equal standing with the dish photo, because for most of this household's recipes the card is the picture.
- Only what is stated is drawn. No empty sections.
- Scaling lives on the Ingredients band as a four-way switch and is kept in the address. Lines with no amount are marked "as written" only while scaled.
- Cook and Edit are a bar that sticks above the navigation, so the main action is under the thumb however long the recipe is. Delete is at the end of the page and asks first.
- The viewer is tin navy, full screen, with the browser's own zoom.

FINISH: reviewed by the finish reviewer on 22 Nov 2026, verdict "ship after fixes", eight fixes, all made: a scaling note that is true and counts the lines left as written; an action bar that sticks only on a tall screen; times that break between hours and minutes; ingredients beside steps on a wide card; Edit as the main action on a title-only recipe; one statement of a loading failure; viewer buttons that dim without looking hovered and keep the arrow keys; a skeleton in the page's shape. The amount on each ingredient line was set heavier, from the review's ceiling note. DESIGN.md is updated for the components this screen adds (divider links, section head and facts, photo thumbnails and viewer, action bar).

## Unresolved

- Attachments such as a PDF: listed by file name per the spec, not drawn because no fixture has one.
- Dates ("added", "last changed") are not shown.
