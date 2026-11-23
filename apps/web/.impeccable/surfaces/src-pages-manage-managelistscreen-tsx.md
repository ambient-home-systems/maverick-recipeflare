---
version: 1
slug: "src-pages-manage-managelistscreen-tsx"
primary_target: "src/pages/manage/ManageListScreen.tsx"
related_targets: ["src/pages/manage/ManageIndexScreen.tsx","src/pages/ManagePage.tsx"]
---

# Manage screens

Scope: the household's six lists (categories, tags, tools, foods, units, labels), each listed, added to, renamed and deleted (task T1.9), at `/manage` and `/manage/<list>`. Mode: Operate.

Audience and job: one of the two adults tidying up, a few times a year: a tag spelled two ways, a food that needs the card's shorthand as an alias, a category nobody uses. They come with one fix in mind and want to see at a glance what is used and what is not.

Constraints: everything in the shell brief (`src-shell-appshell-tsx.md`). A list may be empty or hold a few hundred foods. A food or unit a recipe uses cannot be deleted; a category, tag, tool or label can, and comes off whatever had it. Read-only offline.

## Direction contract

These screens extend the shell's contract; they do not open a new one. THESIS, OWN-WORLD, SIGNATURE and RAISES apply unchanged.

STORY: the back of the recipe tin: the index cards that say what the dividers and the shorthand mean.

FIRST VIEWPORT, on a phone: navy header; "Manage" as the way back; the list's name on the red rule with its count; one box to add an entry; then ruled rows, each a name with how much it is used under it.

DECISIONS:
- `/manage` is a plain ruled index of the six lists with a count each, not a dashboard. Each row is a link across its width.
- One screen serves all six lists. What differs is which boxes an entry has.
- A row says how much the entry is used, in words: "Used in 3 recipes", "Not used". That line is what makes deleting safe to judge.
- A category row carries a small tile of its own stock colour, so the colour a category owns can be seen where categories are managed. The colour cannot be changed here.
- Pressing a row opens a sheet with the entry's boxes, Save, and Delete. Delete asks in the same sheet, saying what it will be taken off. Where delete is not allowed, the sheet says why in a line, and offers no button.
- A name that is taken is a problem under the name box, naming the kind: "That is already a tag."
- Adding is a box and a button at the top of the list. Rule red is not used: it is for adding a recipe.
- Labels are put in order with Move up and Move down in the label's sheet, and the list shows them in that order.
- Any list gets a box to find an entry once it holds more than a dozen. In practice that is foods, and units from the start.
- The sheet says first whether the entry is used and whether it can be deleted, above its boxes, so the reason is never below the fold.
- A change is announced: "Holiday deleted." After a delete, focus goes to the add box, because the row that opened the sheet is gone.

FINISH: reviewed by the finish reviewer on 23 Nov 2026, verdict "ship after fixes", eight fixes, seven made: the plural of "category"; a spoken result for every change; focus that follows the sheet's buttons as they swap, with the delete question tied to the dialog; a refused name read out by going to its box; boxes that cannot be typed in offline or signed out, with the reason in the sheet; the use line and the reason an entry cannot be deleted moved to the top of the sheet; the Close icon kept its size at 200% text. The eighth, the "Open the mock screens" link under Manage, was left for the owner, who decided on 23 Nov 2026 to remove it: the mock screens stay, reached by typing `/mock`.

## Unresolved

- Merging two entries (two spellings of one tag) is not built; rename one, then delete the other by hand.
- A label's colour is stored but has no use until Phase 4, and is not shown.
