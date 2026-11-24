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

FINISH: reviewed by the finish reviewer on 23 Nov 2026, verdict "ship after fixes", eight fixes, all made: the notice bands scroll away with the first step; Done is a quiet outline and asks before leaving mid-recipe; a ticked box is an outline with a tick, and the step the cook is on is set heavier; a ticked step goes to the top and the ending comes into view; an unscaled line says "not doubled"; the ingredients bar is taller and survives large text; a phone on its side gets two columns and a one-line header; the header and its empty track are outlined. From the ceiling notes, the recipe's category colour runs along the foot of the header. DESIGN.md is updated for cook mode (header, check row, step sizes, ingredients bar and column).

## Step details (T2.9)

Scope: under a step, the ingredients it uses and the time it states. Drawn at `/mock/cook/<slug>` from the fixtures, whose steps are read by the app's own rules.

Job: the cook reaches "Rub the butter into the flour" and needs the amounts without opening the ingredients, with floury hands. The step tells them what to do; the lines under it tell them how much.

DECISIONS:
- The details belong to the step and sit inside its row, under its words, in the text column. The row is still one target: nothing under a step is pressed.
- One size down from the step: the step is in the cook size and what it uses is in the large body size, regular weight, with each amount set heavier, exactly as the ingredient list writes a line. The eye reads the instruction first.
- A line is the list's own line, at the scale being cooked at, and wears the list's own "not doubled" mark. A step's amounts and the list's can never disagree.
- The time is a word in an outline above the ingredients ("15 min"), the system's mark for a fact about a row. It is not a timer and is not pressed.
- A done step puts its details away: it has stepped back, and its amounts are no longer wanted. Its words stay.
- A step that names no ingredient and states no time shows nothing more. There is no empty state and no "no ingredients".

## Unresolved

- Timers. A step's time is shown and nothing counts it down; the feature spec keeps timers out.
- Whether a done step should keep its details for a cook who looks back. They are put away for now.
- The owner has not been through it at the stove on a phone and on a tablet on its side: that is T2.9's acceptance check.
