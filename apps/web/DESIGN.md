---
name: Recipeflare
description: The household's index-card recipe tin, an index you thumb through and cook from at arm's length.
colors:
  ink: "#14263f"
  shell: "#17304f"
  shell-raised: "#2c4a70"
  on-shell: "#f4f8fc"
  primary: "#17304f"
  primary-press: "#0f2238"
  on-primary: "#f4f8fc"
  ground: "#e9eff6"
  surface: "#ffffff"
  surface-sunk: "#f1f5fa"
  rule: "#a9c1dc"
  rule-strong: "#5b7ba2"
  red-fill: "#c8372d"
  red-fill-press: "#a82c24"
  on-red: "#ffffff"
  red-line: "#c8372d"
  stock-buff: "#edc96b"
  stock-salmon: "#f3a892"
  stock-sky: "#9fc8ea"
  stock-mint: "#a9dcbd"
  stock-lilac: "#cbb9e6"
  stock-plain: "#d6e2ef"
  on-stock: "#14263f"
  focus: "#1552c7"
  focus-on-shell: "#ffffff"
  notice: "#fbefc9"
  on-notice: "#14263f"
  skeleton: "#dfe8f2"
typography:
  headline:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.333
  title-lg:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.4375rem"
    fontWeight: 700
    lineHeight: 1.4
  title:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  body-sm:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.429
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.429
  label-control:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.5
  label-nav:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.333
rounded:
  sm: "0.375rem"
  md: "0.625rem"
  pill: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
  "10": "2.5rem"
  "12": "3rem"
  touch: "2.75rem"
  touch-nav: "3.25rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-control}"
    rounded: "{rounded.md}"
    padding: "0 1.25rem"
    height: "{spacing.touch}"
  button-primary-hover:
    backgroundColor: "{colors.primary-press}"
  button-add:
    backgroundColor: "{colors.red-fill}"
    textColor: "{colors.on-red}"
    typography: "{typography.label-control}"
    rounded: "{rounded.md}"
    padding: "0 1.25rem"
    height: "{spacing.touch}"
  button-add-hover:
    backgroundColor: "{colors.red-fill-press}"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label-control}"
    rounded: "{rounded.md}"
    padding: "0 1.25rem"
    height: "{spacing.touch}"
  button-quiet-hover:
    backgroundColor: "{colors.surface-sunk}"
  divider-tab:
    backgroundColor: "{colors.stock-buff}"
    textColor: "{colors.on-stock}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "{spacing.touch}"
  divider-tab-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "{spacing.touch-nav}"
  recipe-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "0.625rem 1rem"
    height: "4.25rem"
  recipe-row-hover:
    backgroundColor: "{colors.surface-sunk}"
  letter-tile:
    backgroundColor: "{colors.stock-salmon}"
    textColor: "{colors.on-stock}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    size: "3rem"
  page-stack:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title-lg}"
    padding: "1rem 1rem 0.5rem"
  notice:
    backgroundColor: "{colors.notice}"
    textColor: "{colors.on-notice}"
    typography: "{typography.label}"
    padding: "0.625rem 1rem"
  nav-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label-nav}"
    rounded: "{rounded.md}"
    height: "{spacing.touch-nav}"
  nav-item-current:
    backgroundColor: "{colors.surface-sunk}"
  nav-rail-item:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.on-shell}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "{spacing.touch-nav}"
  nav-rail-item-current:
    backgroundColor: "{colors.shell-raised}"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label-control}"
    rounded: "{rounded.md}"
    height: "3rem"
  text-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "{spacing.touch}"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 1rem"
    height: "{spacing.touch}"
  chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  chip-in-use:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title-lg}"
    rounded: "{rounded.md}"
  section-head:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "0.5rem 1rem"
  fact:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "0.5rem 1rem"
  action-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "0.625rem 1rem"
  photo-viewer:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.on-shell}"
    typography: "{typography.title}"
  field-problem:
    backgroundColor: "{colors.notice}"
    textColor: "{colors.on-notice}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  mark:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.125rem 0.375rem"
  editor-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "0.5rem 1rem 0.5rem 0.25rem"
  editor-row-dragging:
    backgroundColor: "{colors.surface-sunk}"
  small-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "{spacing.touch}"
  import-row:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "0.625rem 1rem"
---

# Design System: Recipeflare

## Overview

**Creative North Star: "The Recipe Tin"**

Recipeflare is the household's index-card recipe tin. It is an index you thumb through, not a gallery you browse. Most of the family's recipes come from paper and have no photograph, so the system does not use the photo-card grid; a recipe is a ruled row with a lettered tile in its category's colour. The colours are the colours of index cards, and each has a job: ink navy for the tin and all text, card white for the working surface, ruling blue for every hairline, one rule red, and five divider-stock colours for categories.

It is built for a phone propped on a kitchen counter, read at arm's length and touched with messy hands. That sets the density and the sizes: body text is 17 px, a recipe title 19 px, every control at least 44 px, and six or more recipes fit on a phone screen because rows are ruled and not boxed. One typeface, Atkinson Hyperlegible Next, is used throughout because it was drawn to be read at a distance.

The tin is evoked by colour and structure only. There is no paper texture, no handwriting font and no serif display type. The owner does not want it to read as a generic business app or as a food magazine or blog.

The source of truth is `src/styles/tokens.css`. Components use Tailwind classes generated from those tokens (`bg-surface`, `text-ink`); the default Tailwind palette is cleared, so a colour the theme does not define produces no CSS, and a test fails on any such class. No component contains a hex colour or a `dark:` variant.

**Key Characteristics:**
- One ink for all text; hierarchy by size and weight.
- Ruled rows on card white, hairlines in ruling blue, no shadows.
- Divider tabs over the card stack; a category owns one stock colour everywhere.
- Rule red in two places only: the line under a page title, and adding a recipe.
- Every target at least 44 by 44 CSS px.
- A dark theme designed for a dim kitchen, with its own values.
- Self-hosted type and icons, because the kitchen may have no network.

## Colors

Index-card colours on a blue-tinted ground: navy ink, white card, blue ruling, one red, five pastel card stocks. The frontmatter holds the light theme. The dark theme's values are in the table at the end of this section.

### Primary
- **Ink Navy** (`ink`): all text on working surfaces, in every size and weight. Also the text on the five stocks and on the notice band in light.
- **Tin Navy** (`shell`, `on-shell`): the header on a phone and the navigation rail from 768 px. `shell-raised` is the current or hovered item on the rail.
- **Primary** (`primary`, `primary-press`, `on-primary`): the filled button for save, cook and confirm. It is ink on a light kitchen and reverses to pale blue with dark text in the dark theme.

### Secondary
- **Rule Red** (`red-fill`, `red-fill-press`, `on-red`, `red-line`): the 2 px line a page title sits on (`red-line`), and the fill of the control that adds a recipe (`red-fill`). The text caret also takes `red-line`.

### Tertiary
- **Divider Stock** (`stock-buff`, `stock-salmon`, `stock-sky`, `stock-mint`, `stock-lilac`): one per category, assigned by the category's position in the household's list, in that order. Used on the category's divider tab and on the letter tile of each recipe filed under it. Text on a stock is `on-stock`, dark ink in both themes.
- **Plain Stock** (`stock-plain`): the "All" tab and the tile of a recipe with no category. Its text is `ink`, which follows the theme.

### Neutral
- **Ground** (`ground`): the page behind the card stacks, tinted from the ruling blue.
- **Card White** (`surface`): the working surface: stacks, rows, the phone navigation bar, quiet buttons.
- **Sunk** (`surface-sunk`): hover and pressed rows, hovered quiet buttons, the current item on the phone navigation bar.
- **Ruling Blue** (`rule`): 1 px hairlines between rows and around a stack.
- **Strong Rule** (`rule-strong`): the 1 px outline of a control (quiet button, segmented switch), which must reach 3 to 1 on card white. Also the scrollbar.
- **Focus** (`focus`, `focus-on-shell`): the one focus ring. White on the navy shell.
- **Notice** (`notice`, `on-notice`): the band for a standing condition or a problem.
- **Skeleton** (`skeleton`): loading placeholders, swept with `surface-sunk`.
- **Scrim** (`--rf-scrim`: light `rgb(13 22 38 / 0.5)`, dark `rgb(0 0 0 / 0.62)`): what dims the page behind a sheet. It is the only translucent colour.

### Named Rules

**The One Ink Rule.** All text is `ink` (or the matching `on-` colour on a fill). Hierarchy comes from size and weight. There is no grey, muted or "soft" text token, and `tokens.test.ts` fails if a token named `soft`, `muted` or ending `-text` is added. Do not lower opacity to get a second tone either; the only opacity in the system is 0.55 on a disabled button.

**The Two Jobs Rule.** Rule red does two things: it is the line a title sits on, and it marks adding a recipe. Save, cook and confirm use the primary button. Delete is a quiet ink-outline button with a bin icon. Errors and warnings go in the notice band with an icon, never in red text or a red border.

**The One Stock Rule.** A category keeps one stock colour wherever it appears: tab, tile, and any later chip. Get it from `assignStocks()` in `src/ui/stock.ts`; never pick a colour per screen. There are five stocks. A sixth category shares the first one's stock.

**The Tested Pairs Rule.** Every text pairing is checked at 4.5 to 1 and every meaningful line or ring at 3 to 1, in both themes, by `tokens.test.ts`. A new colour token arrives with its pairings added to that test.

### Dark theme

The dark theme is the dim evening kitchen. It was designed for low glare; it is not the light theme inverted. A test asserts that ink, surface, ground, rule and shell all differ between themes and that each stock stays close to its light value so a category is still recognised. It is selected by `data-theme="dark"` on the root element, set before first paint from the device setting.

| Token | Dark value | Note |
| --- | --- | --- |
| `ink` | `#e8eef6` | |
| `shell` / `shell-raised` / `on-shell` | `#10233d` / `#23406a` / `#f4f8fc` | |
| `primary` / `primary-press` / `on-primary` | `#dce7f4` / `#c3d3e6` / `#14263f` | The button reverses: pale fill, dark text |
| `ground` / `surface` / `surface-sunk` | `#0b1422` / `#152236` / `#0f1a2b` | Navy, not black |
| `rule` / `rule-strong` | `#2d4363` / `#6f8fb6` | |
| `red-fill` / `red-fill-press` / `on-red` | `#c8372d` / `#a82c24` / `#ffffff` | Unchanged |
| `red-line` | `#e8766b` | Lightened so the title rule stays visible |
| `stock-buff` / `salmon` / `sky` / `mint` / `lilac` | `#dcbb62` / `#e39b86` / `#93b9da` / `#9bcbae` / `#bcabd6` | Slightly dimmed; still take dark `on-stock` `#14263f` |
| `stock-plain` | `#2a3d59` | Text is light `ink` |
| `focus` / `focus-on-shell` | `#9dc1ff` / `#ffffff` | |
| `notice` / `on-notice` | `#4a3d14` / `#fbefc9` | |
| `skeleton` | `#22334d` | |

## Typography

**Display Font:** none. There is no separate display face.
**Body Font:** Atkinson Hyperlegible Next, variable, weights 200 to 800 (with `system-ui, sans-serif`)

**Character:** One humanist sans drawn for legibility, with clearly different letterforms and a slashed zero, used for everything from the wordmark to the meta line. It reads as plain and practical, like a typed index card.

The face is self-hosted through `@fontsource-variable/atkinson-hyperlegible-next`; nothing is fetched from a font service. Sizes are fixed rem steps, so text follows the browser's font-size setting. Figures are tabular everywhere (`font-variant-numeric: tabular-nums` on the body). Headings balance their line breaks.

### Hierarchy
- **Headline** (700, 1.75rem, line-height 1.333): the page title from 768 px.
- **Title large** (700, 1.4375rem, line-height 1.4): the page title on a phone, and the "Recipeflare" wordmark in the header and on the rail.
- **Title** (600, 1.1875rem, line-height 1.25): a recipe's title in a row, a list item's name. At 700 it is the letter on a tile and an empty state's heading.
- **Body** (400, 1.0625rem, line-height 1.4): running text. An empty state's paragraph is capped at 38ch. At 600 it is a secondary list name and a text link.
- **Body small** (400, 0.9375rem, line-height 1.429): the one meta line under a recipe title, a list item's detail, the note beside a page title.
- **Label** (600, 0.9375rem, line-height 1.429): divider tabs, chips, the notice band, status lines, and the tags in a meta line.
- **Control label** (600, 1.0625rem): button text.
- **Nav label** (600, 0.8125rem, line-height 1.333): the label under an icon on the phone navigation bar; 700 for the current destination. This is the smallest text in the system.

A further size, `--rf-text-cook` (1.375rem), is defined for cook mode's step text. No shipped screen uses it yet.

### Named Rules

**The Weight, Not Grey Rule.** Three weights do the work: 400 for reading, 600 for names and controls, 700 for titles and the current place. Within the recipe meta line the tags are 600 and the rest 400; that is how one line carries two levels in one ink. The same holds in a text box: a placeholder is ink at 400 and what the cook types is 600 in the search field. There is no grey placeholder.

**The One Face Rule.** No second family, no serif display, no handwriting or script face, no monospace. Labels are sentence case; nothing is set in capitals or letter-spaced.

## Layout

Mobile first at 390 px, with one breakpoint at 48rem (768 px).

- **Phone:** a column. The navy header carries the wordmark. On the recipe list the header continues into a navy band holding the full-width search field. The page follows. Navigation is a card-white bar fixed to the bottom, with a ruling-blue top hairline, three equal items, and bottom padding of at least 0.5rem or the device's safe-area inset.
- **From 768 px:** navigation becomes a navy rail down the left, 14rem wide and full height, with the wordmark at its top; the phone header is removed, and the recipe list's search field sits on the ground above the dividers. The bar and the rail are built to take five destinations.
- **Page area:** content is capped at 54rem. A page is one or more card stacks. A stack has side margins of 0.75rem on a phone and 1.5rem from 768 px, the same top margin, and 1.5rem below.
- **Inside a stack:** horizontal padding is 1rem throughout. The heading bar is padded 1rem top and 0.5rem bottom, with the title on the left and an optional short note on the right, baseline-aligned. Rows are at least 4.25rem tall with 0.625rem vertical padding and a 0.75rem gap between tile and text. Plain list items use 0.75rem or 1rem vertical padding. An empty state is padded 2.5rem top and bottom.
- **Rhythm:** a 4 px step (`--rf-space-1` to `--rf-space-12`). Groups of buttons are separated by 0.75rem.
- **Recipe list:** search band, divider tabs, then the stack: title and count on the red rule, one toolbar row (Filter, then Sort, 0.5rem apart, padded 0.625rem by 1rem, with a hairline below), a row of chips for the filters in use when there are any, imports, then recipe rows. The toolbar wraps when text is enlarged.
- **Recipe view:** divider links, then the stack: the title on the red rule; description, "From" and the pictures; a row of facts; then Ingredients, Steps and Notes, each opened by a sunk heading band; Nutrition folded away; tags and tools; delete. Reading text is capped near 62 characters a line. Only what the recipe states takes any room.
- **Action bar:** a screen's main actions sit in a card-white bar with a `rule-strong` top hairline that sticks to the bottom of the screen: directly above the navigation bar on a phone, at the bottom edge from 768 px. Its offset is `--rf-nav-height`, the same token the navigation bar takes its height from (4.25rem plus the bottom inset), so the two cannot overlap. On a phone the first action fills the width left by the others. It sticks only when the screen is at least 36rem tall; on a phone held sideways, or with very large text, it rests at the end of the page so that it and the navigation do not take the screen.
- **Two columns on a wide card:** when the recipe's card is at least 44rem wide (a tablet on its side), Ingredients takes a 23rem column with a hairline at its right and Steps takes the rest, so the amounts stay in view beside the method. This follows the card's width, not the screen's.
- **Density:** six or more recipe rows on a phone screen. Do not add space between rows; the hairline is the separator.

**The 44 Rule.** Every link, button and tab is at least 44 by 44 CSS px (`--rf-touch`, 2.75rem). Navigation items are 52 px (`--rf-touch-nav`, 3.25rem). A row that is a link is the whole row.

**The One Index Rule.** The recipe list is the home screen. There is no dashboard.

## Elevation & Depth

Flat. Nothing on a working surface casts a shadow. Depth is shown three ways: tone (ground, card white, sunk), hairlines in ruling blue, and overlap, where the selected divider tab sits one pixel over the stack's top rule and has no bottom edge, so it joins the stack.

Hover and press never lift an element; they change its ground to `surface-sunk` (or to the `-press` fill on a filled button).

### Shadow Vocabulary
- **Stock band** (`box-shadow: inset 0 5px 0 <stock colour>`): the 5 px band of its own stock along the top of a selected divider tab. It is a band of colour, not elevation.
- **Overlay** (`--rf-overlay-shadow`: light `0 10px 28px rgb(13 22 38 / 0.2), 0 2px 6px rgb(13 22 38 / 0.12)`; dark `0 10px 28px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.35)`): for surfaces that float over the page. The sheet uses it, over the scrim.

### Named Rules

**The Ruled, Not Carded Rule.** Rows are separated by 1 px hairlines in ruling blue. A row, a stack, a tile and a button have no shadow. The overlay shadow is for things that float over the page and for nothing else.

## Shapes

Mostly square, like cards in a tin. A card stack has square corners and a 1 px ruling-blue border. Rows are full-width with a bottom hairline; the last row has none.

Small things are gently rounded. Letter tiles and loading placeholders use 6 px (`rounded.sm`). Buttons, navigation items and the red Add badge use 10 px (`rounded.md`). Divider tabs round only their top two corners, at 10 px, and so does a sheet on a phone. Chips are pills (999px): the one fully round shape, kept for filters so that a filter is never mistaken for a button or a divider.

Borders are 1 px, except the red title rule, which is 2 px. Controls are outlined in `rule-strong`; everything else in `rule`.

The focus ring is one shape everywhere: a 3 px solid outline in `focus`, offset 2 px. On the navy header and rail it is white.

Icons are Lucide outline icons at stroke width 2, bundled with the app: 22 px in navigation and on an import's tile, 20 px in buttons and fields, 18 px in notices and chips. They are always paired with words; the one exception is the cross that clears the search field, which has a spoken name.

## Components

### Buttons
Plain and firm: a filled or outlined block of at least 44 px with a 600-weight label.
- **Shape:** 10 px radius, minimum height 2.75rem, horizontal padding 1.25rem, 0.5rem between icon and label.
- **Primary:** `primary` fill, `on-primary` text. Save, cook, confirm.
- **Add:** `red-fill` fill, `on-red` text, with a plus icon. Only for adding a recipe.
- **Quiet:** card white, ink text, 1 px `rule-strong` outline. Cancel, clear filters, and delete (with a bin icon and the word).
- **Hover / pressed:** the fill moves to its `-press` colour, or to `surface-sunk` for quiet. Colour changes take 180 ms on `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Busy:** the label becomes "Working…" and the button is disabled.
- **Disabled:** opacity 0.55 and a not-allowed cursor.

### Divider tabs (signature)
Categories are index dividers standing over the card stack.
- **Unselected:** filled with the category's stock, `on-stock` text, 2.75rem tall, top corners rounded 10 px, a ruling-blue bottom edge. Hover brightens the stock slightly.
- **Selected:** 3.25rem tall, so it stands above its neighbours. Card white with ink text, a ruling-blue border on three sides and no bottom edge, and a 5 px band of its own stock along the top, so its colour is never lost.
- **Row:** tabs sit 0.125rem apart and overlap the stack's top rule by 1 px. On a phone they stretch to fill the width and scroll sideways without a scrollbar when they overflow; from 768 px they keep their natural width.
- **Behaviour:** a real tab list. Left and right arrow keys move and select; only the selected tab is in the tab order. The stack below is its tab panel.
- The first tab is "All", in plain stock.

### Divider back
On a screen that may hold unsaved work, the way back is a divider-shaped button in plain stock with a chevron and the name of where it leads. Being a button, it can ask before it lets go.

### Divider links
On a recipe, the dividers it is filed behind, standing over its card as they do over the list.
- **Style:** the unselected divider tab: the category's stock, `on-stock` text, 2.75rem tall, top corners rounded. None is drawn as selected, because the page is one card and not a category.
- **First link:** "All recipes" in plain stock, with a chevron pointing back. Then one link for each of the recipe's categories.
- **Behaviour:** links, not tabs. Each opens the list at that category. This is the recipe view's way back.

### Card stack (Page)
The container for a page's content.
- **Style:** card white, 1 px ruling-blue border, square corners, no shadow.
- **Heading bar:** the title sits on a 2 px `red-line` rule, the way a title sits on the top line of an index card. An optional short note sits on the right in body small.
- **Joined:** when divider tabs sit directly above, the stack has no top margin and the selected tab breaks its top rule.

### Recipe row
One recipe in the index.
- **Style:** a row at least 4.25rem tall on card white with a ruling-blue bottom hairline. A 3rem letter tile, then the title (title, 600) and one meta line (body small).
- **Meta line:** time, first category, "From …" if the recipe has a source, then up to two tags in 600 ("and 2 more" counts the rest). Parts are joined with " · ". It is always one line: what does not fit ends in an ellipsis, and the whole line is still read out. Anything the recipe does not state is left out; a recipe with nothing to state has no meta line. Behind a category's divider the category is left out, because the divider says it.
- **On a phone** the line holds about forty characters. A recipe with a source or tags to show leaves the category word out below 768 px; its tile carries the colour and the word is still read out. A recipe with neither keeps the word.
- **Photo:** a recipe with a photo shows it in place of the letter tile, at the same 3rem size and 6 px corners, cropped to fill, with a 5 px band of its category's stock along the top, as a selected divider has. A recipe without one keeps its tile; nothing marks a photo as missing.
- **Hover / pressed:** the whole row turns `surface-sunk`. The row is the link; the title is not underlined.
- **Loading:** a skeleton row of the same height: a 3rem block and two bars, sweeping from `skeleton` through `surface-sunk` over 1.6 s, and held still under reduced motion.

### Letter tile
Stands in for a photo. The recipe's first letter, 700 weight, on its category's stock, 3rem square with 6 px corners. Plain stock when the recipe has no category. It is decorative and hidden from assistive technology.

### Notice band and empty state
- **Notice:** a full-width band in `notice` with `on-notice` text at label weight, an 18 px icon and one or two sentences, padded 0.625rem by 1rem. A problem always has a warning triangle, supplied by the component; a standing condition brings its own icon. The same band serves a standing condition (offline) and a problem (a save that failed); a problem is announced at once to assistive technology. It is not red.
- **Empty state:** a 700 title, a paragraph of at most 38ch saying what goes here, and one or two buttons, padded 2.5rem top and bottom. No illustration.

### Section head and facts
- **Section head:** a `surface-sunk` band with a hairline above and a title-size heading in 700, padded 0.5rem by 1rem. It opens Ingredients, Steps and Notes, and is the closed face of Nutrition, which adds a chevron and opens on a press. A control that belongs to the section sits at the right of the band: the scale switch on Ingredients.
- **Sub-head:** a section's own title ("For the gravy") in body size, 700, on card white with a hairline above.
- **Facts:** times, servings and yield as cells in one ruled row: a body-small label over a title-size value in 600. Cells are at least 6.5rem wide, share the row equally and wrap; a hairline separates each from its neighbour.
- **Ingredient line:** body text in a ruled row, 0.5rem above and below, with the amount ("2 tbsp") in 600 and the rest in 400, so a glance down the list finds the numbers. While the recipe is scaled, a line kept as typed carries an outlined "as written" tag (body small, 600, `rule-strong` outline, 6 px corners), and a note under the band counts those lines. The note never says such a line has no amount: "6 cups water or stock" is one.
- **Step:** a title-size numeral in 700 in a 1.5rem column, then the text at line-height 1.5. A hairline between steps.

### Photo thumbnails and viewer
- **Thumbnail:** a square picture with 6 px corners and a hairline border, 4rem on a phone with its name (600) and count beside it, 6rem from 768 px with them below. One for the recipe's photos and one for its original card. The whole thing is the button.
- **Viewer:** a full-screen modal on tin navy with `on-shell` text and no shadow. A bar at the top names what is showing ("Original card · 1 of 2") beside Close; the picture is fitted to the space between; Previous and Next sit in a bar at the bottom when there is more than one, and the arrow keys do the same. At the first or last picture the spent button is dimmed and takes no hover, but stays focusable so the arrow keys go on working. The focus ring is white, as on the shell.

### Search field
The one search box, on the recipe list only.
- **Style:** 3rem tall, card white, 10 px radius, 1 px `rule-strong` outline, a 20 px search icon, then the text. The placeholder is "Search recipes" in ink at 400; typed text is 600. When there is text, a cross at the right end clears it.
- **Place:** in a navy band under the phone header; on the ground above the dividers from 768 px.
- **Focus:** the ring goes around the whole field, white on the navy band and `focus` from 768 px.
- **Behaviour:** the list follows the text after a 250 ms pause. There is no search button; Enter puts the keyboard away.

### Text field and select
A text box or a native select on card white: at least 2.75rem tall, 10 px radius, 1 px `rule-strong` outline, 0.75rem inside. A visible label sits above a text box in body small. A select has a 20 px chevron at its right end and its value in 600. The sort select has no visible label, so it leads with a sort icon and its options are short enough to stay whole on a phone: "Last changed", "Newest", "A to Z", and "Best match" while searching. A field's problem is a notice band directly under it, tied to the field for assistive technology; the field itself does not turn red.

### Form fields
- **Label:** always visible, above the box, in label weight. No placeholder stands in for it. A line of help may sit under the box in body small.
- **Problem:** a small notice band directly under the box (`notice` ground, `on-notice` text, label weight, a warning icon, 6 px corners), tied to the box for assistive technology. The box itself does not change colour. When a save is refused, a notice band at the top of the card says how many things need fixing, and under it each is a ruled row, at least 2.75rem tall, naming the field in 600 and then the problem, with a down arrow at its right. Pressing a row goes to the field or the row it names, opening anything folded over it. Problems clear as they are fixed, without another press of Save. A review's "things to check" are listed the same way.
- **Mark:** a small outlined word (body small, 600, `rule-strong` outline, 6 px corners) beside a label or on a row: "check" for something an import wants looked at, "new" for a food that will be created at save, "as written" for a line kept as typed, "cover" on the cover photo. A mark is a word, never a colour.
- **Small button:** a quiet button at label size, 2.75rem tall with 0.75rem inside, for actions inside a row or a block: Up, Down, Delete, Add a note, Choose tags. Its icon is 18 px.
- **Duration:** two short boxes with "hr" and "min" after them under one legend.

### Editor rows
Ingredients and steps in the editor: one flat list in which a section is a titled row.
- **Closed row:** a drag handle (six dots, 2.75rem wide, the full height of the row, with the dots on the row's first line) and then the row itself as one button. An ingredient shows the words as typed and, under them in body small and 600, what the app read: amount, unit, food and note, separated by dots, with a "new" or "as written" mark where it applies. A step shows its number in the recipe view's style. A section title is in 700.
- **Open row:** pressing a row opens it in place, one at a time: its fields, then Up, Down, Delete and Done (Done is primary). An ingredient's fields are the line as written, then amount, unit, food and note.
- **Dragging:** the lifted row takes the sunk ground and strong rules above and below. It has no shadow. Dragging starts from the handle only, after a finger has held it for a fifth of a second; a swipe that begins on a handle scrolls the page as usual.
- **Entry:** under the list, a labelled box and an Add button. Enter adds the row, keeps the box ready for the next and keeps it clear of the action bar. A line of help shows only until the first row is added. The box takes text exactly as typed: the device does not correct or capitalise it.
- **Original beside the draft (review):** on a phone a two-way switch, Recipe and Original, sticks to the top of the screen under the summary and returns each pane to where it was left. On a wide card the original is a 20rem column at the left that stays in view.

### Picker
A sheet at its full height with a labelled search box at the top, so the box stays clear of the on-screen keyboard. Under it, a ruled list of rows at least 2.75rem tall; the chosen row has a tick and 600 weight. A name that is not in the list is offered as "Create the unit “handful”". A picker for one value closes when a row is pressed; a picker for several stays open, each row switching on and off, until Done.

### Chips
Filters, and nothing else. A tag or a tool on a recipe is a chip too, because pressing it opens the list filtered to it.
- **Shape:** a pill at least 2.75rem tall with 1rem inside and a label-weight name.
- **Choice chip** (in the filter sheet): card white with a `rule-strong` outline. Chosen, it is filled `primary` with `on-primary` text and gains a tick, so the state does not rest on colour.
- **Chip in use** (above the list): `surface-sunk` with a `rule-strong` outline and a cross. Pressing it anywhere removes the filter.
- **Link chip** (on a recipe): the choice chip's resting look, as a link.
- **In the editor** a chosen category, tag or tool is a chip in use, pressed to take it off. A category's chip is filled with its divider stock, the same colour as its tab and tiles.

### Sheet
A panel over the page for one short job, such as choosing filters. It is a native modal dialog.
- **Phone:** rises from the bottom edge, full width, at most 88% of the screen's height, top corners rounded 10 px.
- **From 768 px:** centred, 34rem wide, all corners rounded.
- **Parts:** a title on the red rule with a Close button beside it; a body that scrolls; a footer with the quiet action on the left of the primary one. The primary button says what closing will show, for example "Show 2 recipes".
- **Depth:** the overlay shadow over the scrim. This is the only shadow on a surface.
- Escape, Close and a tap on the scrim all close it, and focus returns to the control that opened it.
- **Motion:** it rises 1.5rem and fades in over 180 ms as it opens. This is the one authored entrance in the system, and it is held still under reduced motion.
- What changes behind a sheet is not read out, so a sheet that changes the page announces the result itself: the filter sheet has a spoken count.

### Import row
An import from a link, listed above the recipes until a person has dealt with it.
- **Style:** rows on `surface-sunk`, so they read as a tray apart from the recipes. A 3rem tile in plain stock with a link icon: an import is not a recipe yet and takes no category colour.
- **Text:** the title the page gave, or the site's name until there is one; then a status in 600. "Reading the page…" has a small turning mark that stops under reduced motion. "Ready to review" is followed by the site, on its own line on a phone. A failure leads with a warning icon and "Could not import." in 600, then what happened and what to try at 400.
- **Actions:** "Review" is a primary button at the right of the row. A failed import has "Try again" and "Remove", both quiet, on a line below its text.
- Imports are hidden while the list is searched or filtered, and when offline.

### Navigation
- **Phone bar:** card white with a top hairline. Each item is an icon in a 3.5rem by 2.25rem box over a nav label, at least 3.25rem tall. Ink on white. The current destination has a `surface-sunk` ground and 700 weight; it does not change colour.
- **Rail (from 768 px):** navy. Items are rows: icon box 2.5rem wide, then the label in body size, `on-shell`, weight 400. Current and hovered items take `shell-raised`.
- **Add:** its icon box is filled `red-fill` with a white plus, on both the bar and the rail. It is the only red in the shell.
- **Header (phone only):** navy, with the wordmark in title large, 700.
- A "Skip to the page" link appears on keyboard focus.

### Segmented switch
A group of options in one `rule-strong` outline on card white, 0.25rem inside padding. Each option is at least 2.75rem tall and wide with a 600-weight name and 6 px corners; the chosen one is filled `primary`. It is a radio group, so arrow keys move between options. Shipped twice: the scale switch on a recipe (½×, 1×, 2×, 3×, each with a spoken name such as "Double"), and the theme switch in the mock harness. It wraps when text is enlarged.

## Do's and Don'ts

### Do:
- **Do** take every colour, size, radius and touch size from `tokens.css` through the Tailwind theme classes. Add a token, with its contrast pairings in `tokens.test.ts`, before using a new colour.
- **Do** set all text in ink and build hierarchy from 400, 600 and 700 and the eight sizes.
- **Do** get a category's colour from `assignStocks()` and use it on that category's tab and tiles everywhere.
- **Do** separate rows with a 1 px ruling-blue hairline on card white, and show hover and press by changing the ground to `surface-sunk`.
- **Do** put a page's title on the 2 px red rule at the top of its card stack.
- **Do** make every link, button and tab at least 44 by 44 CSS px, and make a row that leads somewhere a link across its whole width.
- **Do** design each screen in both themes; check the dark one as a dim kitchen, not as a copy of light.
- **Do** pair every icon with words, and use bundled Lucide icons at stroke width 2.
- **Do** give every screen its loading (skeleton rows), empty (empty state), error and offline (notice band) states.
- **Do** use a chip for a filter and only for a filter, and a sheet for a short job over the page.
- **Do** say what an empty result was asked for, and offer one button that clears it.
- **Do** draw a loading state in the page's own shape (a recipe's facts row, band and ruled lines), so the content does not jump when it arrives.
- **Do** keep a label above every box, and show a problem in the notice colours under the box it belongs to.
- **Do** mark state with a word: "check", "new", "as written", "cover".
- **Do** leave out what a recipe does not state. No empty headings, and no "none".
- **Do** put a screen's main actions in the action bar, offset by `--rf-nav-height`.
- **Do** honour reduced motion: transitions and the skeleton sweep stop when the device asks.

### Don't:
- **Don't** add a grey, muted or soft text colour, or fade text with opacity.
- **Don't** use rule red for save, cook, confirm, delete, errors, links, badges or decoration. It is the title rule and adding a recipe.
- **Don't** show a problem as red text or a red border. Use the notice band with an icon.
- **Don't** grey a placeholder or a secondary line. A placeholder is ink at regular weight. The one faded thing is a control that cannot be used, at opacity 0.55.
- **Don't** add a second Add control to the recipe list. Adding starts from the red Add in the navigation; only the first-run state offers it in the page.
- **Don't** put recipes in shadowed cards or a photo grid. Don't add a shadow to a row, stack, tile or button.
- **Don't** add paper textures, torn or lined-paper effects, handwriting or script fonts, or serif display type.
- **Don't** pick a category colour per screen, or add a sixth stock; colours repeat after five.
- **Don't** write a hex colour or a `dark:` variant in a component. Don't use a default Tailwind colour such as `bg-gray-100`; it produces no CSS.
- **Don't** load a font or an icon from a network service. The app must work offline.
- **Don't** derive a dark value by inverting or dimming the light one without checking its pairings.
- **Don't** put a large photo at the top of a recipe. Pictures are thumbnails that open full screen; most recipes here have a card, not a dish photo.
- **Don't** build a dashboard or a second home screen. The recipe list is the index.
- **Don't** use the word Cloudflare or its flare shapes in the name, icon or logo, and don't borrow Mealie's look or copy.
