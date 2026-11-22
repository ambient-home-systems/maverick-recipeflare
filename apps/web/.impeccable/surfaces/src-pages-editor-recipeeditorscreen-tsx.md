---
version: 1
slug: "src-pages-editor-recipeeditorscreen-tsx"
primary_target: "src/pages/editor/RecipeEditorScreen.tsx"
related_targets: ["src/pages/editor/IngredientList.tsx","src/mock/MockEditor.tsx"]
---

# Recipe editor and review

Scope: typing a new recipe, changing a saved one, and reviewing what an import found (task T0.9). Built as real components in `src/pages/editor/` and drawn at `/mock/new`, `/mock/edit/<slug>` and `/mock/review` from the fixtures. Mode: Operate.

Audience and job: someone at a desk or with a phone, copying a paper card into the app. They type what the card says, line after line, and want to see that the app understood without being made to fill in a form. In review they check a draft against where it came from before it becomes a recipe.

Constraints: everything in the shell brief (`src-shell-appshell-tsx.md`). Every action works on a phone. Reordering works by touch. The words on the card are never replaced by what the app read. Nothing is created or saved without the cook's say.

## Direction contract

This screen extends the shell's contract; it does not open a new one. THESIS, OWN-WORLD, SIGNATURE and RAISES apply unchanged.

STORY: the cook copies the card a line at a time, glances at what the app made of each line, and corrects only the ones it got wrong.

FIRST VIEWPORT, on a phone: navy header; a divider-shaped back button naming where it leads; "Edit recipe", "New recipe" or "Review import" on the red rule; the title box; and the action bar with Save and Cancel above the navigation.

DECISIONS:
- The editor is the recipe view made changeable: one card, in the view's order, with the view's section bands.
- Typing comes first. One box under the list takes a line and Enter; the list above shows each line as typed with what was read under it. There is no four-box form per ingredient.
- A row is closed until pressed, and one row is open at a time. This keeps a 25-line recipe short on a phone and leaves the whole row as the target.
- A section is a titled row in the same list, so a line is moved into a section by dragging it there.
- Reordering is a handle at the row's left edge, with Up and Down on the open row.
- Units, foods, categories, tags and tools are chosen in a full-height sheet with its search box at the top.
- State is marked with a word in a small outline ("check", "new", "as written", "cover"), never with colour. A problem sits under its own box in the notice colours.
- Review is the same screen with a list of what to check, the word "check" where each is, and the original beside the draft: taking turns on a phone, side by side on a wide card.
- Save and Cancel are the action bar. Leaving with changes asks first; discarding an import always asks.

FINISH: reviewed by the finish reviewer on 22 Nov 2026, verdict "ship after fixes", eight fixes, all made: the problem summary and the review's checks became rows that go to what they name; the entry box stays clear of the action bar and takes text uncorrected; the Serves and Makes problems sit under their boxes; the time fields keep "min" on their line at tablet width; the handle no longer blocks scrolling and sits on the row's first line; the Recipe and Original switch sticks and remembers each pane's place; the duplicate message is a notice band; and three wording and spacing slips. From the ceiling notes, the entry hints show only for the first row and the photos band no longer repeats its first label. DESIGN.md is updated for the components this screen adds (form fields, marks, editor rows, picker, divider back).

## Unresolved

- Attachments are not drawn; no fixture has one.
- Uploading: the mock shows a chosen photo from the device and sends it nowhere. Progress and failure of a real upload are drawn with T1.10.
- The browser's own back button and a reload are not guarded in the mock; the real editor (T1.8) must guard them.
- Whether the open row should scroll itself into view on a small phone.
