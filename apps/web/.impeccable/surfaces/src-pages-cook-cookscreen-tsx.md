---
version: 1
slug: "src-pages-cook-cookscreen-tsx"
primary_target: "src/pages/cook/CookScreen.tsx"
related_targets: ["src/pages/cook/IngredientChecklist.tsx","src/mock/MockCook.tsx"]
---

# Cook mode

Scope: the recipe for the counter (task T0.10). Built as real components in `src/pages/cook/` and drawn at `/mock/cook/<slug>` from the fixtures. Mode: Operate.

Audience and job: someone cooking, with a phone propped up or a tablet on its side, hands wet or floury, eyes mostly on the stove. They glance over, find their place, read the next step, and tick it with a knuckle. They need the amounts for the number they are feeding and nothing else.

Constraints: everything in the shell brief (`src-shell-appshell-tsx.md`), and PRODUCT.md's first principle: the kitchen comes first. Step text at least 20 px. Works with no network and with an expired sign-in. The screen must stay on. Phone portrait and tablet landscape.

## Direction contract

This screen extends the shell's contract; it does not open a new one. THESIS, OWN-WORLD and RAISES apply, and one RAISE is this screen's centre: "State on the item: a checked step is marked on the step itself."

STORY: the cook works down the card, ticking as they go, and can always tell at a glance where they are.

FIRST VIEWPORT, on a phone: a navy header with the title, Done, "3 of 7 steps done", "Screen stays on" and a progress bar; then steps in large type, each one a full-width row with a box to tick; and a bar at the bottom that opens the ingredients. No shell header and no navigation.

DECISIONS:
- The whole row is the target. Nothing in cook mode asks for a precise tap.
- Done is shown by ground, size and a tick, never by fading: a ticked step drops to the ordinary text size on the sunk ground and stays readable. The feature spec's "dimmed" is carried out this way, because the system has one ink and no faded text.
- The steps to come stay large; the list reads as "small behind me, large ahead".
- Ingredients are a sheet on a phone, opened from a bar that is always there, and a column on a tablet on its side. The same list serves both.
- Scale lives with the ingredients: the four-way switch and a "Serves" box.
- Progress is said three times: in the header, on each section title, and when all is done.
- Signed out, offline and "cannot keep the screen on" are bands under the header. None of them stops the cook.
- The navy header keeps the tin in view on a screen that has no shell.

FINISH: to be reviewed by the finish reviewer; DESIGN.md is updated for cook mode (header, check row, step sizes, ingredients bar and column).

## Unresolved

- Timers and each step's own ingredients arrive with Phase 2's step details.
- A phone held sideways gets the phone layout, with little room for steps between the header and the bar.
- Whether Done should ask first when steps are still unticked.
