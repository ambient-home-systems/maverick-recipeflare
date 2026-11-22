---
version: 1
slug: "src-shell-appshell-tsx"
primary_target: "src/shell/AppShell.tsx"
related_targets: ["src/styles/tokens.css","src/mock/MockIndex.tsx"]
---

# App shell and design tokens

Scope: the frame every Recipeflare screen sits in (header, navigation, page area), the design tokens, the placeholder icon, and the `/mock` harness. Mode: Operate.

Audience and job: the household's two adults and whoever cooks. They open the app to find a recipe and cook from it, on a phone propped on the counter or a tablet in landscape, at arm's length, with messy hands. Success, in the owner's words: readable while cooking, feels like ours, fast to find a recipe, looks finished. It must not read as a generic business app or as a food magazine or blog.

Constraints: 390 px first, two columns from 768 px; light and dark; WCAG AA contrast; touch targets at least 44 px; works offline, so fonts and icons are self-hosted; no food photography exists, so recipes without photos get a lettered tile.

## Direction contract

THESIS: The app is the family's recipe tin: an index you thumb through, not a gallery you browse. It refuses the category's photo-card grid, which needs food photos the household's paper recipes do not have.

OWN-WORLD: Index-card colours doing real jobs. Ink navy for the shell and all text; card white for the working surface on a pale blue-tinted ground; ruling blue for every hairline; one rule red for the primary action and the rule a title sits on; five divider-stock colours (buff, salmon, sky, mint, lilac), one per category. One face throughout, Atkinson Hyperlegible Next, chosen for reading at a distance. No paper texture, no handwriting, no serif display.

STORY: The cook sees their recipes at once, recognises the category by its colour, and reaches the recipe in two taps.

FIRST VIEWPORT: Ink-navy header with the wordmark and a full-width search field. Below it, a row of divider tabs, the selected one joined to the card stack. The stack's heading sits on the red rule; recipe rows follow, ruled in blue, six or more to a phone screen, each with a lettered tile in its category colour, a bold title, and one line of time, category and "From". Bottom navigation: Recipes, Add in rule red, Manage. From 768 px the navigation becomes a left rail.

SIGNATURE: Divider tabs. Categories are index dividers standing over the stack, and a category's colour is the same wherever it appears.

RAISES, each from a declined challenger:
- Ink discipline (from the black-and-white data field): one ink for all text; hierarchy by weight and size, never by grey.
- Density courage (from the high-density web): hairline-ruled rows with no card shadows.
- Colour as wayfinding (from the transit diagram): a category owns one colour everywhere.
- State on the item (from the event catalogue): a checked step is marked on the step itself.
- A dark theme made for the dark (from the star atlas): the dim-kitchen theme is designed, not inverted.
- One index (from the record catalogue): the recipe list is the single home; there is no dashboard.

FORM: the index-card recipe tin, position 4 of 7 on the ordered list; seed:f0b15d1ef541303b.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Amendments

- The header's full-width search field arrives with the recipe-list screen (task T0.7). Until then the phone header carries the wordmark only.
- Rule red has exactly two jobs: the rule a title sits on, and adding a recipe. Save, cook and confirm use the ink primary button. Delete is a quiet ink-outline button with an icon. Problems are shown in the notice band with an icon.
- Colours repeat after five categories: a sixth category shares the first one's stock.
- The search field was built with the recipe list (T0.7) and belongs to that screen: other screens' headers carry the wordmark only. From tablet width it sits on the ground above the dividers.
- Inside the mock harness the navigation's Recipes and Add lead to the mock list and the mock Add screen, so a review on a phone stays among the mock screens.

## Unresolved

- The final icon and wordmark. The icon in this build is a placeholder.
- How a signed-out visitor sees the shell if the library is made public.
