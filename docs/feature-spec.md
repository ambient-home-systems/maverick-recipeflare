# Maverick Recipeflare — Feature Spec (Phase 1)

22 Nov 2026. Decides how the Phase 1 screens behave. The [build plan](build-plan.md) sets scope and the [implementation plan](implementation-plan.md) sets the data model and tasks; this document sits between them and is what the four mock screens (T0.7–T0.10) are built from.

Each section ends with its decisions. A decision marked **proposed** is my default and stands unless you change it. Phase 2 appears only where it alters a Phase 1 screen.

## 1. People and devices

Confirmed by the owner on 22 Nov 2026:

| Question | Answer |
| --- | --- |
| Who enters recipes | Two adults, the primary users, mostly at a desktop for typing and on a phone for photos |
| Who cooks from the app | Anyone in the household |
| Phones | Both iPhone (Safari) and Android (Chrome). The build plan's share-sheet section covers both |
| In the kitchen | A phone propped on the counter, sometimes a tablet in landscape |
| Network in the kitchen | Usually Wi-Fi, but cook mode must not depend on it |

**Decisions**

- Designed at 390 px wide first. Nothing breaks down to 360 px. From 768 px the recipe view, editor and cook mode use two columns.
- Supported browsers: the current and previous major versions of Safari on iOS, Chrome on Android, and Chrome, Firefox and Safari on desktop.
- Every Phase 1 action works on a phone. The desktop is a convenience, not a requirement.

## 2. Recipe content

### 2.1 Fields

Only the title is required. Everything else can be left empty and added later.

| Field | Entered as | Limits | Notes |
| --- | --- | --- | --- |
| Title | Text | 1–200 characters | |
| Description | Text, a few lines | 2,000 characters | Shown under the title |
| Servings | Number | Greater than 0 | "Serves 6" |
| Yield | Number and a free-text unit | Unit up to 60 characters | "24 cookies", "1 nine-inch pie". Separate from servings because a card may give either or both |
| Prep, cook and total time | Hours and minutes | Up to 99 hours | If total is empty the app shows prep plus cook |
| Ingredients | Lines, optionally grouped in titled sections | 100 lines | See [§3](#3-entering-ingredients) |
| Steps | Numbered paragraphs, optionally grouped in titled sections | 100 steps, 4,000 characters each | Numbering restarts in each section |
| Notes | A list of title and text pairs | 20 notes | For tips, variations, margin notes |
| Nutrition | Eleven optional text fields, collapsed by default | | Stored as printed, for example "12 g" |
| Categories, tags, tools | Pickers | 50 in total | See [§4](#4-organizers) |
| From | Text | 200 characters | Who or where the recipe came from: a relative, a cookbook, a social-media account. Shown with the source link, and searchable |
| Source link | URL | | Set automatically by URL import |
| Cover photo | One image | 15 MB before resizing | Shown on the list and at the top of the recipe |
| More photos | Images | 15 MB each | Shown in a strip on the recipe |
| Original card | One or more images, in order | 15 MB each | Front and back of a paper card. Opens full screen with pinch zoom |
| Attachments | Files such as a PDF | 15 MB each | Listed by file name |

### 2.2 Not entered by hand in Phase 1

- **Step durations and the ingredients each step uses.** The data model holds them, and Phase 2's step details fills them. The Phase 1 editor does not show them.
- **Rating, favourite, last made.** Phase 5.

### 2.3 Card walk-through

Three sample cards supplied by the owner on 22 Nov 2026. Every piece of writing on each card is listed with the field it goes into. The photos are not in the repository; the cards are transcribed as fixtures in `packages/schema`, with their ingredient lines exactly as written.

**Card 1: "Pancakes Recipe"**, a neat journal page with a bulleted ingredient list and five numbered steps.

| On the card | Goes into | Fits? |
| --- | --- | --- |
| "Pancakes Recipe" | Title, as "Pancakes" | Yes |
| Seven bulleted lines, such as "1 1/2 cups all purpose flour" | Ingredient lines, one each, in the card's order | Yes |
| "4 tbsp butter melted" | Quantity 4, unit tablespoon, food butter, note "melted" | Yes. There is no comma before the note, so the parser must find where the food name ends |
| Five numbered directions | Five steps | Yes |
| "for 1min on each side" | Stays in the step text | Yes. Phase 2's step details can read it as a duration |
| Drawings, the page number "56" | The original-card photo only | Yes, nothing to enter |
| No yield, times or source | Left empty | Yes, all optional |

**Card 2: "Meat Loaf"**, an index card with ingredients in two columns and the method as one paragraph.

| On the card | Goes into | Fits? |
| --- | --- | --- |
| "Meat Loaf" | Title | Yes |
| "M" in the corner | Nothing. It is the card's filing letter | Not captured; the photo keeps it |
| Five ingredients in the left column, three in the right | Eight ingredient lines, left column first | Yes. The order must be kept: the method says "mix first 5 ingredients" |
| "2 lbs. ground chuck", "1/3 c. minced onions" | Unit matched from "lbs." and "c."; "minced" becomes the note | Yes, once units match abbreviations with full stops |
| "1 - (15 1/2 oz can) Chef Boy-ar-Dee spaghetti sauce with mushrooms" | Quantity 1, unit can, food spaghetti sauce, note with the can size, brand and "with mushrooms" | Yes. Doubling the recipe gives 2 cans. The parser will find this line hard and may leave it as free text |
| The sauce is used in three amounts: 1/4 c., 1/4 c. and 1/2 c. | One ingredient line; the amounts stay in the step text | Yes |
| One paragraph of directions | Split into seven steps by the person entering it | Yes |
| "Preheat oven to 400°" | The first step's text | Yes. There is no oven-temperature field, and none is proposed |
| "Bake 25 min." | Cook time, and the last step's text | Yes |
| Six loaves, implied by "cut crosswise into 6 strips" | Servings, only if the cook chooses to enter 6 | Yes. An importer must not infer it: the card does not state a yield |

**Card 3: "Chocolate Chip Pan Cookies"**, a handwritten page with abbreviations, a yield and some uncertain pen marks.

| On the card | Goes into | Fits? |
| --- | --- | --- |
| "Chocolate Chip Pan Cookies" | Title | Yes |
| Ingredients in three loose groups with no headings | One untitled list, in reading order | Yes, but the grouping is lost. Sections need a title, and untitled neighbours would merge |
| "2 1/4 C. flour", "1 t. soda", "1 t. vanilla" | Unit cup or teaspoon; foods matched through aliases ("flour", "soda", "vanilla") | Yes, with one rule: a one-letter unit matches in its exact case only, because "t" is a teaspoon and "T" a tablespoon |
| "3/4 C B. Sugar - Firmly Packed" | Quantity 3/4, unit cup, food brown sugar, note "firmly packed" | Yes, if the household gives brown sugar the alias "B. Sugar"; otherwise it stays free text |
| A pen line through or under both "3/4 C" amounts | A note saying the marks are unclear and how they were read | Yes. Phase 2's review should flag marks like this, not pick silently |
| "1 - 12 oz Chocolate Chips" | Quantity 12, unit ounce, food chocolate chips | Yes |
| Three paragraphs of directions | Six steps | Yes |
| "15 x 10 x 1 inch pan" | Step text. Optionally a tool | Yes |
| "Bake 20 minutes at 375°" | Cook time, and step text | Yes |
| "Makes 35 squares" | Yield: 35, "squares" | Yes |

**What the cards showed**

- Every piece of recipe content has a home. No new field is needed.
- None of the three states a source, so "From" stays empty on all of them.
- Oven temperature has no field and stays in the step text. That is deliberate: it belongs to a step, not to the recipe.
- Ingredient groups without a heading cannot be kept as separate sections. The original-card photo preserves the layout.
- Unit matching needed a rule the plan did not have: full stops are ignored, and one-letter units match by exact case. It is now in the shared schema with tests.
- Six lines from these cards are good tests for the Phase 1 parser, and are listed in the implementation plan for T1.5.

**Decisions**

- Only the title is required, so a recipe can be saved half-entered and finished later.
- Photos are resized in the browser to at most 2,560 px on the long edge before upload. That keeps handwriting legible for Phase 2 and keeps uploads near 1 MB on mobile data.
- A recipe has at most one cover. If none is chosen, the first photo is used; if there are no photos, the list shows a plain tile with the title's first letter.
- Photos are sent when the recipe is saved, not when they are chosen, so a recipe that is abandoned leaves nothing behind. Until then they are shown from the device.
- A file over 15 MB is refused, and the editor names the file. A photo the browser has made smaller is never that large; the limit is met by a file the browser cannot read as a picture.
- An attachment is a file of any kind that goes with a recipe, such as a PDF. The editor lists attachments by file name and size under "Photos and files", each with Remove, and "Add files" adds more. A file over 15 MB is turned away when it is chosen, by name. Like photos, attachments are sent when the recipe is saved. (Decided by the owner, 23 Nov 2026: files that are not images are supported.)
- On the recipe, attachments are listed after the notes, by file name and size. Pressing one downloads it; it is never opened inside the app. Offline they are named but not offered, with a line saying they need a connection: the device keeps photos, not attachments.
- A recipe has an optional "From" field for where it came from. URL import fills it with the page's author or site name when the page states one, and the cook can change it. (Decided by the owner, 22 Nov 2026.)

### 2.4 The recipe view

How one recipe is shown for reading. Drawn as a mock screen in T0.8.

**Decisions**

- The recipe stands behind its category's divider tab, in that category's colour. The tab leads back to the list at that category, and "All recipes" beside it leads back to the whole list. A recipe in two categories shows both tabs.
- Order on the page: title; description; "From" and the source link; photos and the original card; times, servings and yield; ingredients; steps; notes; attachments; nutrition; tags and tools; delete.
- Only what the recipe states is shown. An empty field leaves no heading, no gap and no "none". A recipe that is only a title says so and points to Edit.
- Times, servings and yield are a row of short facts. With no total time stated, prep and cook are added.
- Photos and the original card are small pictures under the description, each with its name and count. Pressing one opens it full screen, where the browser's pinch zoom works, with Previous and Next when there is more than one. The recipe view has no large photo at the top.
- Scaling is a four-way switch on the Ingredients heading: half, as written, double, triple. Parsed amounts, servings and yield change; times do not. A line kept as typed is not changed, even when its text holds a number, and is marked "not doubled" (or "not halved", "not tripled") while the recipe is scaled. A note under the switch counts those lines and says that amounts inside the steps are not changed either. The scale is kept in the page address.
- Each ingredient line's amount is set heavier than the rest of the line.
- Steps are numbered, and the numbering restarts in each section.
- Nutrition is folded away under its heading and lists only the values that were entered.
- Tags and tools are shown as filters: pressing one opens the list narrowed to it.
- "Cook" and "Edit" stay at the bottom of the screen, above the navigation, within reach of a thumb. On a short screen, such as a phone held sideways or one set to very large text, the bar stays at the end of the page instead, so it does not crowd out the recipe. "Cook" is absent from a recipe with nothing to cook from, and Edit is then the main action.
- On a wide screen, such as a tablet on its side, the ingredients stay beside the steps.
- "Delete recipe" is at the end of the page. It asks first, naming the recipe and saying that its photos go too ([§9](#9-deleting-and-undoing)).
- Offline, the recipe is shown from the device's copy with a band saying so. Cook still works; Edit and Delete are turned off.
- An address that leads to no recipe says the recipe may have been renamed or deleted and links to the list. A recipe that could not be loaded says so once and offers "Try again".
- A delete that does not go through says so at the top of the recipe, which stays on screen unchanged.
- When the session has run out and the device has no copy of the recipe, the page says so; the way back in is the band at the top of every page.

## 3. Entering ingredients

The cook types a line the way it is written on the card. The rule-based parser ([implementation plan §5.1](implementation-plan.md#51-rule-based-ingredient-parser)) reads it and the editor shows what it understood.

**Typing**

- There is one box for typing, under the list. Typing `2 cups flour, sifted` and pressing Enter reads the line, adds it to the list and leaves the box ready for the next, so a list can be typed without touching anything else.
- Pasting several lines at once makes one ingredient per line.
- Each line in the list shows the words as typed and, under them, what the app read: amount `2`, unit `cup`, food `flour`, note `sifted`.
- Pressing a line opens it, one line at a time. Open, it shows the typed words and the four things read, each of which can be changed. Unit and food are chosen from a list that searches as you type and offers "create" for a name that does not exist. Changing the typed words reads the line again.
- A food the household does not have yet is shown with a "new" mark. Nothing is created while typing.
- "Keep as written" on an open line turns it back into free text. Free-text lines are valid, display exactly as typed, and do not scale.
- A line the parser cannot read at all stays free text, with no error.

**Saving**

- If the recipe contains new foods, saving asks once: "This adds 7 foods: flour, sugar, …". Confirming creates them and saves. This keeps the first recipes fast, when every food is new, without creating anything unseen.
- The typed text is always kept beside the parsed fields.

**Sections and order**

- "Add a section title" adds a titled row at the end of the list. Lines belong to the title above them.
- Lines and titles are reordered by dragging the handle at the left of the row, with a finger, a mouse or the keyboard. An open row also has "Up" and "Down" buttons, for a screen reader or for moving one place.
- Removing a title keeps its lines, which join the section above.
- A title with nothing under it is not saved. A title left empty must be filled in or removed before saving.
- Steps work the same way: one box under the list, Enter for the next step, a handle to reorder, and titles for sections. Steps are numbered for the cook, starting again after each title.

**Display**

- The recipe view shows a parsed line formatted from its fields, with quantities as fractions where the unit allows. A free-text line is shown as typed.
- For a range such as "2 to 3 cups" the quantity is the first number and the typed text keeps the range.

**Decisions**

- Typed lines with a parser, not a form with four boxes per ingredient.
- New foods are created at save time after one confirmation per recipe. New units are created only from the unit picker, because a wrong unit ("stick", "handful") changes how every later line is read.
- Free text is always allowed. The app never blocks a save because a line could not be parsed.

## 4. Organizers

| Kind | Meant for | Examples |
| --- | --- | --- |
| Category | A few broad groups | Dinner, Dessert, Breakfast |
| Tag | Anything | Weeknight, Grandma, Freezes well |
| Tool | Equipment a recipe needs | Slow cooker, Stand mixer |
| Food | What ingredient lines refer to | Flour, Chicken thigh |
| Unit | What quantities are measured in | Cup, Gram |
| Label | A group of foods; the store aisle in Phase 4 | Produce, Dairy |

**Decisions**

- Categories, tags and tools are picked in the editor from a searchable list, and a name that does not exist can be created in place.
- Each kind has a manage screen that lists entries with the number of recipes using each, and allows renaming. Manage opens on an index of the six lists with a count each. A list has a box to add an entry at its top, and pressing an entry opens it in a sheet with its boxes, Save and Delete.
- A food also takes a plural, a label, and other ways it is written: this is where a card's shorthand such as "B. Sugar" is given to brown sugar. A unit takes a plural, an abbreviation, other ways it is written, and whether amounts show as fractions.
- A list offers a box to find an entry once it holds more than twelve.
- Names are unique within a kind, ignoring case and extra spaces. Creating a duplicate selects the existing one.
- Deleting a category, tag, tool or label asks for confirmation, states how many recipes or foods use it, and removes it from them.
- A food or unit that any recipe uses cannot be deleted. The manage screen says how many recipes use it. Renaming is always allowed.
- Labels are assigned to foods on the food's manage screen and can be put in order, with Move up and Move down on the label. They have no other effect in Phase 1.

## 5. Finding recipes

**Decisions**

- One search box at the top of the list. Results update as you type, after a short pause.
- Search looks in the title, description, "From", ingredients and the names of the recipe's categories, tags and tools. All words must match. The last word matches as a prefix, so "choc" finds "chocolate". Plurals and accents are ignored.
- A category is chosen with the divider tabs above the list, one at a time; "All" shows every recipe.
- Tags, tools and foods are chosen in a filter sheet opened from the "Filter" button, any number of each. The sheet offers the most used foods and a box to find any other. Each choice takes effect at once, and the sheet's button says how many recipes are left.
- **Proposed:** every selected filter must match, together with the category and the search, so adding a filter always narrows the list. The sheet says so.
- Filters in use are shown above the list as chips. Pressing a chip removes that filter.
- Sort: recently changed (the default, shown as "Last changed"), newest, title A to Z. While searching, best match is the default, and it is offered only then.
- A row shows the recipe's photo, or without one its first letter on its category's colour; the title; and one line with the total time, the category, "From" and up to two tags. The line never wraps. Behind a category's divider it leaves the category out, and on a phone it also does so for a recipe that has a source or tags to show.
- Search text, filters and sort are in the page address, so the back button and a shared link restore them.
- The list loads 30 recipes at a time as you scroll. The count beside the title is of every recipe that matches, not of those loaded so far. A "Show more recipes" button at the end of the list does the same for anyone the scrolling does not work for.
- States: first run ("No recipes yet" with buttons for new recipe and import, and no search box or filters), no results (saying what was asked for, with a button that clears the search and filters), loading, offline, and could not load (saying so, with "Try again"; recipes already on screen stay, with a line saying they may be out of date).
- Adding a recipe starts from "Add" in the navigation, which is on screen with the list. The list itself has no second add button.

## 6. Import from a URL

**Decisions**

- The Add page has one box for a link, beside the button for typing a recipe in. Submitting a link returns to the list and shows the import as a row at the top with its progress.
- Imports sit above the recipes until a person has dealt with them. They step aside while the list is searched or filtered.
- When the import is ready the row says "Review". Opening it shows the editor in review mode, filled in from the page.
- Review mode lists what needs attention at the top, for example "No steps were found" or "3 ingredient lines could not be read", and marks each of those with the word "check" where it is. Pressing one in the list goes to it. None of them stops a save.
- Review shows the original beside the draft: they take turns on a phone, with a switch that stays at the top of the screen and returns each to where it was left, and sit side by side on a wide screen. For a link the original is the page's picture and a link to the page. From Phase 2 it is the photographed card.
- Nothing becomes a recipe until Save is pressed in review mode. "Discard" removes the import, and always asks first.
- Leaving review some other way (the navigation, the back button) keeps the import in the list to review later. If corrections have been made it asks first, because they are lost: the import stays as it was read from the page.
- Tags and categories from the page are preselected only if the household already has them. Others are offered as unselected suggestions.
- The page's main image becomes the cover and can be removed in review.
- If a recipe with the same link exists, review mode says so and links to it. The import can still be saved.
- Failures say what happened in plain words and what to try: the site could not be reached, the site blocked the request, or the page has no recipe data. For the last, the message says that pasting the text arrives with Phase 2.
- A failed import can be retried from its row.

## 7. Cook mode

**Decisions**

- Opened with "Cook" on the recipe view, at the scale the recipe was showing. It fills the screen and hides navigation; "Done" returns to the recipe.
- "Done" asks first when some steps are ticked and some are not, because leaving clears the ticks and a stray press would lose the cook's place. With nothing ticked, or everything, it leaves at once.
- The screen stays on while cook mode is open, and the header says so. If the browser cannot keep it on, the header says the screen may turn off, and a note says so once, with what to do about it.
- On a phone: steps in large type, one after another. The whole of a step is its checkbox. Ingredients are in a sheet pulled up from a bar at the bottom of the screen, which is there whichever step is showing and says how many are out. Each ingredient is a checkbox too.
- On a tablet in landscape: ingredients on the left, steps on the right, each scrolling on its own. A phone held on its side gets the same two columns, narrower, and a one-line header.
- Scaling: half, 1, 2 and 3 times, or a servings number when the recipe has servings. Parsed quantities change; free-text lines are shown as typed with a mark saying what was not done to them ("not doubled", "not halved"), because those are the lines the cook must work out by hand. The scale control is with the ingredients.
- Checked boxes and the scale are kept on the device for that recipe. They survive a reload, a locked phone and a closed app, and are cleared by "Done", or twelve hours after the last change.
- Progress is shown three ways: a count and a bar in the header ("3 of 7 steps done"), a count on each section title, and a line when every step is done.
- Section titles are shown. A checked step steps back and is not hidden: it takes a quieter ground and the ordinary text size, and stays readable, because a cook often looks back at the step before. The steps still to do stay large, and the step the cook is on, the first not ticked, is set heavier.
- Ticking a step moves it to the top of the screen, so the next one sits directly under it with one step to look back at. Ticking the last brings the ending into view.
- The recipe's category colour runs along the foot of the header.
- Cook mode reads from the device's copy of the recipe, so it works offline and with an expired session. Each is said in a band above the first step, which scrolls away with it; a signed-out cook is offered "Sign in again" and can carry on without it.
- No timers in Phase 1. Phase 2's step details adds each step's ingredients and stated times to this screen.

## 8. Offline

**Decisions**

- When the app opens online it copies all recipe data to the device in the background. Any recipe can then be opened offline.
- List thumbnails are stored as the list is scrolled. A recipe's full-size photos are stored the first time the recipe is opened.
- Offline is read-only in Phase 1. New recipe, edit, delete and import are disabled, with a short note saying why.
- A banner says when the app is offline, and when the data shown may be out of date.
- Offline, the list shows every recipe on the device and can be searched and filtered. The search is plainer than online: every word typed must appear in the recipe, and "Best match" orders by title.
- A new version of the app is fetched in the background. Refreshing the page, or opening the app again, moves to it: the page loads itself once more, by itself, within a few seconds. It never changes under a page that someone is using. (Decided by the owner, 23 Nov 2026: a refresh must be enough.)
- The device keeps up to 800 photos, and lets the oldest go first.
- When the sign-in session has expired the app keeps showing stored recipes and offers "Sign in again". The offer is a band across the top of every page, above the header, and signing in comes back to the page the person was on. The band goes away by itself as soon as a request gets through again.

## 9. Deleting and undoing

**Decisions**

- Deleting a recipe is permanent. The confirmation names the recipe and says its photos are deleted too.
- There is no trash and no version history in Phase 1.
- If another device saved the same recipe while it was being edited, saving shows "This recipe was changed on another device" with the choice to reload or to keep editing and save over it. Nothing is overwritten without that choice.
- Leaving the editor with unsaved changes asks first, whichever way out is taken: Cancel, the navigation, the back button, or closing the tab (where the browser asks in its own words).
- A save that does not reach the server, or that the server refuses, says so at the top of the editor. What was typed stays, and Save can be pressed again.
- A save that is refused lists what needs fixing at the top of the editor, in the order the fields come down the page. Pressing one goes to its field or row. Each problem is also shown under its own field, and clears as it is fixed.

## 10. Accessibility and sizing

**Decisions**

- Touch targets are at least 44 by 44 CSS pixels.
- Text follows the browser's font-size setting up to 200% without clipping or overlap.
- Contrast meets WCAG 2.1 AA: 4.5 to 1 for text and 3 to 1 for controls, in light and dark.
- Everything works from a keyboard, including reordering, with a visible focus ring.
- Every input has a label and every icon button has a name for screen readers.
- Motion is reduced when the device asks for it.
- On phones the main action of each screen is within reach of a thumb at the bottom.
- Cook mode's step text is at least 20 px and works in portrait and landscape.

## 11. Out of Phase 1

Listed so that gate testing does not record these as workarounds.

- Import from photos or pasted text; AI of any kind.
- Step durations, per-step ingredients and timers.
- Meal planning, shopping lists, Home Assistant.
- Favourites, ratings, comments, cookbooks, the made-it timeline.
- Unit conversion, print view, public share links.
- Editing offline.
- Trash, undo and version history.
- Passkey login, invitations and member management beyond signing in through Access.
