---
version: 1
slug: "src-pages-capture-capturescreen-tsx"
primary_target: "src/pages/capture/CaptureScreen.tsx"
related_targets: ["src/mock/MockCapture.tsx","src/pages/recipes/ImportRow.tsx"]
---

# Photographing cards

Scope: capturing a sitting of paper recipe cards with a phone's camera, before any of them is sent (task T2.5 of `docs/phase-2-plan.md`). Reached from Add, "From photos". Built as a real component in `src/pages/capture/` and drawn at `/mock/capture`, where a phone's own camera can be used and nothing is sent. It also covers the words an import row uses for a card. Mode: Operate.

Audience and job: someone standing at a table with the recipe tin and a phone, one hand on the phone and the other turning cards. The job is a rhythm, repeated twenty or forty times: front, back if there is one, next card. Then one look down the list, and send. Success is a tin of cards in without the cook reading the screen between shots.

Constraints: everything in the shell brief (`src-shell-appshell-tsx.md`). The camera is the phone's own, opened by a file input, so each shot leaves the page and comes back; the screen must make sense on every return. Nothing is sent until the cook says so. A card has up to four sides. No photograph of a household card is in the repository: the mock's standing pictures are placeholder drawings, and a photo taken in the mock stays on the device.

## Direction contract

This screen extends the shell's contract; it does not open a new one. THESIS, OWN-WORLD, SIGNATURE and RAISES apply unchanged.

THESIS: the pile on the table is the list on the screen. One ruled row a card, in the order they were taken, and two buttons under the thumb that never move: the back of this card, or the next one. It refuses the camera-app habit of a photo grid, where a card and its back are two unrelated pictures.

OWN-WORLD: the tin's, unchanged: ruled rows on card white, hairlines in ruling blue, ink text, the title on the red rule, state said in words. A card's sides are square thumbnails with 6 px corners and a hairline, as a recipe's pictures are.

STORY: the cook shoots, glances down to see the card join the pile with the right number of sides, and shoots again; at the end they read down the pile, mend a wrong one, and send them all.

FIRST VIEWPORT, on a phone, mid-sitting: navy header; a divider-shaped back button, "Add a recipe"; "Photograph cards" on the red rule with the count ("7 cards") at its right; the pile as ruled rows, each with its sides' thumbnails, "Card 7" and "Front only" or "Front and back", the newest last and scrolled into view; and the action bar above the navigation with "Add the back" (quiet) and "Next card" (primary, a camera icon), each opening the camera.

FORM: one ruled list with a two-button action bar; seed: none (pinned). The plan pins it: "Each card is a short row: its front, then 'Add the back' or 'Next card'. The sitting can be reviewed before sending: a card can be removed or its sides swapped. 'Import 12 cards' sends them."

DECISIONS:
- The two capture buttons are the action bar, because they are pressed for every card and must sit where the thumb already is. "Import 12 cards" is pressed once, after the look down the pile, so it sits at the pile's end with a line saying nothing has been sent yet.
- When the newest card has its back, the bar is "Next card" alone. With no cards the page is an empty state with "Photograph a card" and "Choose photos".
- "Choose photos" takes pictures already on the device, several at once, each as a card of its own. It is the way in on a computer, which has no camera to open.
- A row is closed until pressed and one is open at a time, as in the editor. Open, it shows each side larger with its name, "Retake" and "Remove" for that side, then "Swap sides" for a card with two, "Add the back" for a card with one, "Add a side" up to four, and "Remove card". A picture pressed opens full screen.
- A photo chosen from the device that is really the back of the card above can be joined to it: "It is the back of card 6".
- Rows are numbered in the order taken and are not reordered: each card becomes its own import, so the order means nothing after sending.
- Sending says how far it has got ("Sending card 3 of 12"). A card that has been sent leaves the pile. If the connection drops, what was not sent stays, and the page says how many went and how many are left.
- Leaving with cards in the pile asks first, because they are only on this device.
- Offline, photographing still works and Import waits: the notice says so.
- On the list, a card's import is a row like a link's, with a camera on its tile: "Reading the card", "Writing it up", "Ready to review". A card that could not be read says so and what to try.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved

- The owner has not been through it on an iPhone and an Android phone: one-sided cards, two-sided cards, a wrong photo removed, sides swapped, twelve cards in a sitting. That is this task's acceptance check.
- Whether a browser gives the page back with its pile intact after the camera on a phone short of memory. If it does not, the pile has to be kept on the device between shots (T2.6).
- Whether the import row should show the card's own photo on its tile. The list does not carry an import's pictures yet.
- How many cards one sitting may hold. The mock stops at 30.
- Turning a photo that was taken sideways.
