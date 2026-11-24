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

## Step details (T2.9)

Scope: a step's time and the ingredient lines it uses, shown on the step and corrected there. Drawn at `/mock/new`, `/mock/edit/<slug>` and `/mock/review`.

Job: the cook types a step as the card has it. The app reads the time it states and the ingredients it names, as it reads an ingredient line, and the cook glances at what it made of the step and corrects only what is wrong.

DECISIONS:
- A closed step says what was read under its words, in the small weight a line's reading has: "30 min · butter, flour". A step with nothing read shows nothing more.
- The open step has the two things under its text, under a legend that says where they are seen: "What cook mode shows with this step". The cook is not asked to file a step; they are shown what the stove will show.
- Time is one short box that takes a time as it is said ("20 min", "1 hr 30 min") or a bare number of minutes. Not two boxes: a step's time is short and typed once.
- Ingredients are chips named by their food, each taken off with its own cross, and "Choose ingredients" opens the same full-height sheet the units and foods use, staying open while several are chosen. Two lines of the same food are told apart there by the line as written.
- What the cook sets is theirs: changing the step's words reads it again only where they had not corrected it.
- With no ingredients typed yet the step says to add them first. It does not show a button that opens an empty sheet.

FINISH (step details): reviewed by the finish reviewer on 24 Nov 2026, verdict "fix", five fixes, all made: a closed step names three ingredients and counts the rest, and a line with no food is called by its words up to the first comma, so the note stays shorter than the step; the legend became a sentence ("Cook mode shows these with the step.") where it had read as a third label over two labelled fields; the Time box is short inside a field of the row's width, so its problem does not wrap in a column, and the problem is said when the box is left, not while it is typed; the picker's title is "Used in this step", which fits one line on a phone. The fixes were looked at in a browser afterwards; the reviewer has not seen them.

## Unresolved

- The owner has not been through it on a phone: adding and removing a link, and correcting a time. That is T2.9's acceptance check.
- A step and an ingredient are linked by the food's name. A step that says "the dry ingredients" is linked by hand.

- Attachments are not drawn; no fixture has one.
- Uploading: the mock shows a chosen photo from the device and sends it nowhere. Progress and failure of a real upload are drawn with T1.10.
- The browser's own back button and a reload are not guarded in the mock; the real editor (T1.8) must guard them.
- Whether the open row should scroll itself into view on a small phone.
