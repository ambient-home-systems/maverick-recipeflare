# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

Maverick Recipeflare (Recipeflare for short) is a household recipe app on Cloudflare: one TypeScript Worker serving a React PWA and a JSON API, with D1, R2, Queues and, in later phases, Workers AI and Durable Objects. One household per install. Licensed AGPL-3.0-only.

**Status: Phase 0 is complete (T0.1 to T0.13); its gate passed on 23 Nov 2026. Phase 1 is built through T1.15 (the recipe repository, the recipes API with search and filters, the API for organizers, foods, units and labels, the ingredient line parser, the recipe list, the recipe view, the editor, the manage screens and cook mode on real data, photos, importing a recipe from a link through the import jobs, installing the app and using it offline, and the end-to-end run). T1.16, the gate run by the household, is not. Phase 2 has begun beside it, by the owner's decision: T2.1 (the AI binding and the model runner), T2.2 (imports in stages, with a daily limit) and T2.3 (a draft from pasted text) are built.** The workspace, a Worker with a health route, CI, the feature spec, the shared schema package, the deploy pipeline, the web app's shell, design tokens and mock harness, all four core screens (recipe list, recipe view, recipe editor, cook mode) drawn as mock screens, the database schema with its migrations, and sign-in (the auth middleware, the Access and dev providers, `/api/v1/me`) exist. The recipe list at `/`, the recipe view at `/recipes/<slug>`, the editor at `/recipes/new` and `/recipes/<slug>/edit`, cook mode at `/recipes/<slug>/cook`, the manage screens at `/manage`, importing from a link or from pasted text at `/add` and its review at `/imports/<id>/review` are connected to data, photos and attachments included. Recipes and the photos that have been shown are kept on the device, so the list, a recipe and cook mode open with no connection. When a pull request changes a command or path below, it updates this file in the same pull request.

## Read first

- `docs/build-plan.md` is the design doc: scope, architecture, roadmap, phase gates and the nine decisions. **Its decisions are made. Do not reopen them.** If something in it conflicts with a fact you can verify, stop and say so; do not work around it quietly.
- `docs/implementation-plan.md` covers Phases 0 and 1: framework, repo layout, data model, shared schema, auth, import jobs, testing and deploys, and the task list (T0.1–T0.13, T1.1–T1.16). Its "Decisions since the build plan" section records later decisions by the owner; where one amends the build plan, it wins.
- `docs/phase-2-plan.md` is the plan for Phase 2 (AI import): how a staged import runs, the rules every AI step follows, the owner's decisions and their defaults, and tasks T2.1 to T2.14. The owner approved it on 23 Nov 2026 and said to build T2.1 to T2.5 ahead of the Phase 1 gate. **Ask before starting a task past T2.5.**
- `PRODUCT.md` records who the app is for and what it must preserve. `apps/web/DESIGN.md` records the visual system, "Recipe tin", which the owner chose. Read both before any UI work. `apps/web/.impeccable/` holds the design workflow's surface briefs and the design system's machine-readable sidecar.
- `docs/operations.md` describes deploys and the one-time setup. It names settings and never gives their values.
- `docs/feature-spec.md` decides how the Phase 1 screens behave. Build screens from it, and change it in the same pull request when a screen has to differ.

## How to work

- One task from the implementation plan per pull request. Put the task ID in the title, for example `T1.4 Search and filters`.
- A task is done when its acceptance checks in the plan pass. Say which you ran and which you could not.
- Stay inside the current phase. A missing Phase 2 feature is not a bug in Phase 1.
- If a task needs a change to the data model, the shared schema or a rule below, update `docs/implementation-plan.md` in the same pull request.
- Check Cloudflare specifics against the live docs before relying on them. Limits and package names move: the Vitest integration was renamed during planning. The plan's first table lists what was verified and when.

## Layout

```text
wrangler.jsonc        Worker config at the repo root (the Deploy button needs it there)
apps/worker/          Hono API, queue consumer, auth, Drizzle schema, migrations
  src/app.ts          createApp(): the routes, and which of them need a member
  src/auth/           The auth middleware, one file per identity provider, members
  src/db/schema.ts    The tables. Change it, then run pnpm db:generate
  src/routes/         One file per resource, mounted in createApp()
  src/http.ts         jsonBody(), queryParams(), the shared error body
  src/db/recipes.ts   The recipe repository: createRecipe, updateRecipe, loadRecipe, deleteRecipe
  src/db/lists.ts     Organizers, foods, units and labels
  src/db/importJobs.ts  Import jobs: create, claim, advance to the next stage, finish, fail, requeue
  src/db/assets.ts    The rows behind photos and attachments
  src/ai/             The model runner: runner.ts (one call, checked), profiles.ts (which model does what),
                      failure.ts (what a failed call means), prompts.ts (what each job is told, with a version),
                      standIn.ts (a scripted model for localhost). The only code that uses env.AI
  src/media.ts        Files in R2: store (with the two smaller sizes), remove, sweep; sniffType()
  src/imports/        runner.ts (the queue handler and one stage of one run), handlers.ts (one handler per kind), url.ts (a link),
                      text.ts (pasted text), build.ts (a draft from text, by a model), sourceCheck.ts (is it in the text?)
  migrations/         One folder per migration; applied by Wrangler, in order
apps/web/             Vite React PWA; builds to apps/web/dist, served as static assets
  src/styles/         tokens.css (the design tokens) and app.css (Tailwind theme, base styles)
  src/api/            client.ts (api(), the three errors), queries.ts (TanStack Query hooks), session.ts,
                      saveRecipe.ts (the editor's save), assets.ts (assetUrl(), uploads, making a photo smaller)
                      persist.ts (the cache kept on the device), sync.ts (copying every recipe to the device),
                      sentPage.ts (the bookmark, and reading a page it sent)
  src/sw.ts           The service worker; src/sw/rules.ts holds what it keeps, as plain functions
  public/             The manifest and the icons
  src/shell/          The frame every screen sits in: header, navigation, the signed-out band
  src/ui/             Shared components: Button, DividerTabs, RecipeRow, Page, Notice, Sheet, Chip, Field, Picker
  src/pages/          Product screens. A screen is given its data as props and fetches nothing itself.
                      A page (RecipesPage.tsx) is the container that fetches and hands the screen its data
  src/mock/           The /mock harness: the same screens fed from fixtures, for design review
packages/schema/      @recipeflare/schema: Zod schemas, types, formatting, fixtures
scripts/              Small Node scripts used by the root package scripts
e2e/                  The end-to-end run (Playwright): the main path, accessibility, load time
services/fetch-agent/ Placeholder until Phase 3 (yt-dlp and ffmpeg Docker image)
docs/                 Build plan, implementation plan, feature spec, operations
```

## Commands

Run from the repository root. Needs Node 22.12 or later and pnpm 10 (`corepack enable` picks the pinned version).

| Command | Does |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Worker (`wrangler dev --local`, port 8787) and web app (Vite, port 5173) together. Open `http://localhost:5173`; Vite proxies `/api` to the Worker. No Cloudflare account is needed, and no model can be reached |
| `pnpm build` | Build the web app into `apps/web/dist` |
| `pnpm lint` | Biome lint and format check. `pnpm format` applies fixes. Markdown is not formatted |
| `pnpm test` | All Vitest projects once: `schema` (Node), `worker` (Workers runtime), `web` (happy-dom). `pnpm test:watch` re-runs on change |
| `pnpm test --project worker` | One project. A file path or `-t "name"` narrows it further |
| `pnpm e2e` | The end-to-end run: builds the app, serves it from a local Worker on port 8799 with an empty database of its own, and drives it in a phone-sized Chromium. Needs `pnpm exec playwright install chromium` once, or `PLAYWRIGHT_CHROMIUM_PATH` set to a Chromium already on the machine. A file path narrows it |
| `pnpm typecheck` | Regenerate the Worker's types, then run TypeScript in every package and in `e2e/` |
| `pnpm types` | Regenerate `apps/worker/worker-configuration.d.ts` from `wrangler.jsonc`. The file is git-ignored; run this after changing bindings |
| `pnpm db:generate --name <what_changed>` | Write a migration for a change to `apps/worker/src/db/schema.ts`. Add `--custom` for an empty one to write by hand |
| `pnpm db:check` | Fail if the schema has a change with no migration. CI runs it |
| `pnpm db:migrate:local` | Apply migrations to the local database that `pnpm dev` uses |
| `pnpm run deploy --dry-run` | Build and bundle the Worker without contacting Cloudflare. Add `--env staging` for the staging config. CI runs both |
| `pnpm run deploy:staging`, `pnpm run deploy` | Real deploys. They run from GitHub Actions, not from a laptop; see `docs/operations.md`. Use `pnpm run`: bare `pnpm deploy` is a different pnpm command |

To see the built app served by the Worker alone, as in production: `pnpm build`, then `pnpm dev:worker`, then open `http://localhost:8787`.

To be signed in locally, copy `.dev.vars.example` to `.dev.vars` and run `pnpm db:migrate:local` once. The same file sets `AI_MODE=stand-in`, which answers an import that needs a model with a scripted reading, on localhost only. `AUTH_MODE=dev` signs you in as `DEV_MEMBER_EMAIL`, on localhost only: the app opened from a phone by the computer's network address is not signed in. Without `.dev.vars` every API route except health answers 401.

## Rules that are easy to break

### Shared schema

- `packages/schema/src` holds one module per concern: `recipe.ts` (the three recipe shapes), `draft.ts` (importer output, `checkDraft`, `draftToInput`), `parse-ingredient.ts` (the line parser), `matching.ts` (`unitMatcher`, the lists a name is matched against), `lists.ts` (organizers, foods, units, labels, members, assets), `sections.ts`, `format.ts`, `slug.ts`, `url.ts`, `name-key.ts`, `duration.ts` (ISO durations, and `readStatedDuration()` for a time in words), `id.ts`, `import-job.ts`, `json-ld.ts` (`findRecipe`), `ai.ts` (the AI tasks and the check route), `api.ts`. Import from `@recipeflare/schema`.
- Fixture recipes, lists and import jobs are imported from `@recipeflare/schema/fixtures`, never from the main entry, so they stay out of production bundles. Six are invented and three come from sample cards the owner supplied (ingredient lines as written, steps reworded, no photos). Do not add text copied from a site or a book.
- Size caps live in `LIMITS` in `primitives.ts`. The one-batch save depends on them; change one only together with the plan's save section.
- The JSON Schema export of `RecipeDraft` has a snapshot test. When you change the draft on purpose, review the diff and update it with `pnpm test -u`.
- "From" on a recipe is `sourceName` in the API and `source_name` in the database.
- Match unit names with `unitMatcher()`. A one-letter unit matches by exact case only ("t" is a teaspoon, "T" a tablespoon); do not lowercase unit text before matching.
- Every recipe shape comes from `@recipeflare/schema`. The API validates with it, the editor uses it as its form resolver, and import output is validated with it. Do not define a second recipe type anywhere.
- `RecipeDraft` must stay exportable to JSON Schema: plain objects, arrays, strings, numbers and nullables only. Cross-field checks go in `checkDraft()`.
- A draft's `doubts` are what the importer was unsure of. Review lists each one; do not drop them on the way to the editor.
- An ingredient line keeps its `originalText`. Parsing fills the structured fields beside it and never overwrites it.
- The ingredient parser in the shared package is rules only in Phase 1 and must run in the browser with no network. It never creates foods or units.
- The parser reads only what it is sure of; a wrong reading is worse than none. It never takes a food from inside a longer name ("peanut butter" is not butter). A change to its rules comes with corpus lines in `parse-ingredient.test.ts`, including lines the new rule must leave alone.

### Design

- Colours, type sizes, radii and touch sizes come from the tokens in `apps/web/src/styles/tokens.css`, through Tailwind classes such as `bg-surface` and `text-ink`. Do not write a hex colour or a `dark:` variant in a component; the tokens switch with the theme.
- A new colour token needs its pairings added to `tokens.test.ts`, which checks WCAG contrast in both themes.
- One ink for all text. Hierarchy comes from size and weight; there is no grey or "soft" text token, and a test fails if one is added.
- Rule red has two jobs: the line a title sits on, and adding a recipe. Save, cook and confirm use the primary button. Delete is a quiet button with an icon. Problems go in the `Notice` band with an icon, never in red text.
- A category keeps one divider colour wherever it appears. Get it from `stock.ts`; do not pick colours per screen. The colour is stored on the category (`Organizer.color`), chosen by the API when the category is created.
- Rows are ruled, not carded: hairlines in ruling blue, no shadows. No paper textures, handwriting fonts or serif display type.
- Every link, button and tab is at least 44 by 44 CSS pixels. Use `min-h-touch` and `min-w-touch`.
- Fonts and icons are self-hosted. Nothing is fetched from a font or icon service, because the app must work offline.
- Mock screens live under `/mock`, load on demand, and are the only code that imports fixtures. Nothing in the app links to them: they are reached by typing the address. A mock screen renders the product screen from `src/pages/` with fixture data; do not draw a second copy of a screen for the mock. `src/mock/scenes.ts` loads with the router, so it must not import fixtures.
- Text boxes have no grey placeholder. A placeholder is ink at regular weight; a label above the box is better.
- A panel over the page is the `Sheet` component, a native modal dialog. It is the only thing that casts a shadow.
- A screen's main actions go in a bar that sticks to the bottom at `bottom-[var(--rf-nav-height)]`, so it sits on top of the phone's navigation bar. The navigation takes its height from the same token; change one only through the token.

### Web data

- Every request goes through `api()` in `apps/web/src/api/client.ts`, with a schema from `@recipeflare/schema` for the answer. Do not call `fetch` for the API anywhere else, and do not import the Worker's types into the web app.
- Server state lives in TanStack Query, through hooks in `queries.ts`. A screen in `src/pages/<area>/` still fetches nothing: its page component calls the hooks and passes props.
- `api()` uses `redirect: "manual"`. That is how a session that has run out is told from a dropped connection; do not change it.
- A session that has run out is handled in one place: `api()` marks it, and the shell shows the band with "Sign in again". A screen may take a `signedOut` prop to say what it cannot show; it does not offer its own way back in.
- What a list shows (search, filters, sort) is in the page address, read with the route's `validateSearch` and written with `navigate({ search, replace: true })`. A recipe's scale is in its address the same way.
- A screen offers an action only when it is given the handler for it: the recipe view shows Cook and Edit when it has `onCook` and `onEdit`. Do not show a button that does nothing.
- A change (a delete, a save) is a mutation hook in `queries.ts` that invalidates what it made stale. The screen is told when it is under way and when it failed, and says so in a `Notice`.

### Offline

- The service worker (`src/sw.ts`) keeps the app's own files and photos, and nothing else. It never answers a request for the API's JSON, and never a page load under `/api/`.
- Whether an answer may be kept is `mayKeep()` in `src/sw/rules.ts`: a plain 200 from this origin, not redirected. Do not loosen it. A session that has run out arrives as a redirect to the sign-in page, and that must never be stored in place of a file.
- The rules the worker follows are plain functions in `src/sw/rules.ts`, with tests. Put a new rule there, not in the event handlers.
- A new version of the app never takes over under someone using a page. It takes over only when a page asks it to (`registerServiceWorker.ts`): a page that has just loaded and has not been touched, or the next page load. Every open page then loads itself again, so none runs half old and half new. Do not call `skipWaiting()` at install, and do not ask for a takeover from anywhere else.
- Recipe data offline is the query cache, kept by `persist.ts`. Only whole recipes (`["recipes", "one", slug]`) and the household's lists (`["lists", …]`) are kept. What is read back is not checked against the schema, so a change to a kept shape raises `KEPT_SHAPE`.
- `sync.ts` copies every recipe to the device through the ordinary list and recipe routes. It runs only in the real app, where `App` is given a persister; `renderAt()` gives none, so tests never start it.
- Offline the list is answered by `listOffline()` from the copies on the device. A device with no copies shows the could-not-load state, not "No recipes yet".
- The icons in `public/` are drawn from `icon.svg`. Change the SVG and redraw them; do not edit a PNG.

### Manage screens

- All six lists use one screen, `ManageListScreen`. A list differs only in its words and in the boxes an entry has (`ManageField`), which `ManagePage.tsx` supplies. Do not write a seventh screen for a new list.
- The screen is told how a change went (`ManageOutcome`) and shows a refusal where it belongs: a taken name under the name box, anything else in a `Notice` in the sheet.
- A food or unit that recipes use has no Delete button; the sheet says why. Do not offer a button and then refuse.
- Saving a unit sends every field the API takes, including those with no box yet, so nothing is reset by a rename.

### Recipe editor

- The editor's value is `EditorValue` in `apps/web/src/pages/editor/editorState.ts`. It is not the saved shape: numbers are the text typed, and ingredients and steps are flat lists in which a section is a divider row. `checkEditorValue()` turns it into `RecipeInput` and ties every problem to a field or a row. Validation rules stay in the shared schema; the editor only adds what the schema cannot see, such as "lots" typed for servings.
- There is no form library. Do not add one for a single field.
- A closed row is one button. It is named by a hidden word or two (`ClosedRow`'s `label`: "Edit", "Edit step 2:") followed by everything the row shows. Do not give it an `aria-label`: that would replace what the row shows, and a screen reader would never say how a line was read.
- Rows are reordered with dnd-kit through `SortableRows`. Dragging starts from the handle only, so a row scrolls the page as usual.
- A food the household does not have is a name on the line (`newFood`) until the cook confirms it at save. Typing never creates a food. Units are created only from the unit picker.
- The editor reads a line with `ingredientParser()` from the shared package, handed to it as the `parse` prop. `ParsedLine` and `LineParser` are the shared package's types.
- A unit or an organizer made in a picker exists only in the editor until the save (`EditorPage.tsx`). `saveRecipe()` in `apps/web/src/api/saveRecipe.ts` then creates what the recipe still uses, creates the confirmed foods, swaps the editor's own IDs for the server's, and saves the recipe. Do not post to the lists from a picker: an abandoned recipe must leave nothing behind.
- Creating is "create or find": a name that is already taken answers with the entry that has it, and the save uses that. This is what makes a save safe to try again.
- The page asks before the cook leaves with unsaved changes, by any way out: `useBlocker` for the navigation and the back button, and the browser's own question for closing the tab. It reads the unsaved state from a ref.
- A conflict offers three ways on and takes none by itself: reload theirs, save over it from their version, or keep editing.

### Cook mode

- Cook mode fills the screen. `isFullScreen()` in `apps/web/src/shell/nav.ts` decides which addresses have no header and no navigation: one that ends in `/cook`.
- The shell asks `isFullScreen()` of the page that is on screen (`resolvedLocation`), not of the address being gone to. If the frame changes before the page does, the page is mounted a second time inside the new frame; cook mode then starts a fresh session just as the cook leaves, which undoes Done.
- Ticks and the scale live on the device, not on the server, in `localStorage` under `recipeflare:cook:<recipe id>` (`cookSession.ts`). They expire twelve hours after the last change and are cleared by Done. Do not send them to the API.
- A hidden input inside a scrolling list needs a `relative` parent. Without it the input is placed against the page, does not scroll with the list, and makes the whole page scroll. `CheckRow` and the scale switch do this.
- A done step is never faded. It takes the sunk ground and the ordinary text size, and its tick is an outline, not a filled box.
- `beside:` and `short:` are this app's own Tailwind variants, defined at the top of `app.css`: a screen wide enough for ingredients beside steps (a tablet or a phone on its side), and a screen too short to spare a line.

### Database (D1)

- A recipe save is at most two reads and one `db.batch()`. As built it is one batch of reads, then one batch that writes and reads the result back. Do not add statements outside the batch that the save depends on; a test counts the round trips.
- At most 100 bound parameters per statement. Chunk multi-row inserts with `chunkRows()` and state every column of each row, so the count per row is known. Pass `IN` lists as one JSON parameter expanded with `json_each` (`inJson()`).
- Columns that share a name across joined tables need their own names in a batched select, because a D1 batch returns rows keyed by column name. Booleans come back from a batch as 0 and 1.
- A recipe's search text is assembled only by `buildSearchText()`. Anything that changes a name the text contains rewrites the row through it.
- Never build SQL by concatenating values; bind them. Never pass user text to FTS `MATCH` without the query builder, `ftsQuery()` in `apps/worker/src/db/ftsQuery.ts`.
- `LIKE` patterns are capped at 50 bytes. Use the FTS index or a range scan.
- A recipe's children (ingredients, steps, notes, organizer links) are replaced on every save with their IDs preserved. No table may have a foreign key to those child rows.
- IDs are UUIDv7 text generated in the Worker. The only planned exception is the Phase 4 meal-plan table.
- Enumerations that will grow are validated in the schema, not with `CHECK`.

### Migrations

- Forward only. Never edit a migration that has been applied; add a new one.
- Generate with `pnpm db:generate --name <what_changed>` (Drizzle 1.0, one folder per migration, named by time). Virtual tables, triggers and seed data are hand-written: `pnpm db:generate --custom --name <what>` makes the empty folder.
- `drizzle-orm` and `drizzle-kit` are pinned to one exact release candidate. Move both together, and rerun `pnpm db:check` and the Worker tests when you do.
- Do not edit a generated `migration.sql` or `snapshot.json`, and do not let a formatter touch them. Biome skips the folder.
- The schema file does not hold the search index, its triggers or the version guard. drizzle-kit cannot model them; they are the hand-written migrations.
- Never rename or move a migration folder; Wrangler records migrations by path.
- Never run `drizzle-kit push`.
- A migration must work with the previously deployed code, because it is applied before the new code goes live. Dropping or renaming a column takes two releases.
- Do not rebuild a parent table without the procedure in the plan's migration section.
- The D1 binding is `DB`. Do not rename it.

### Auth

- Route handlers read the member from the request context with `c.get("member")`. They never read identity from headers, cookies or tokens; that is the middleware's job.
- A route is registered in `createApp()` after the two middleware lines, so it needs a member and its writes are checked for coming from the app. Only the health route sits above them.
- A new way to sign in is a new identity provider in `apps/worker/src/auth/`, not a branch in a route.
- The dev provider must stay refused off localhost.
- A bad Access token is refused; the request never falls through to another provider.
- Auth settings (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `AUTH_MODE`, `DEV_MEMBER_EMAIL`, `AUTH_PROVIDERS`, `AUTH_AUTO_ENROLL`) are secrets or local variables and are typed by `AuthSettings`, not by `wrangler.jsonc`.
- Our API lives under `/api/v1`. Bare `/api/...` paths are reserved for the Mealie-compatible subset in Phase 4.

### API routes

- A route's body goes through `jsonBody(Schema)` and its query through `queryParams(Schema)`, with a schema from `@recipeflare/schema`. Do not parse a body by hand in a handler.
- Chain routes (`new Hono().get(...).post(...)`) and mount them with `.route()` in `createApp()`, so they stay in `AppType` for the typed client.
- A new route gets its row in the plan's "The API as built" table.
- Tests reach the API through `signedIn()` in `test/helpers.ts`.

### Import jobs

- Every import kind uses the `import_jobs` table and the import queue. Do not add Workflows or a second job mechanism.
- Queue messages carry a job ID and nothing else of substance. Handlers are idempotent and take `fetch` as a parameter.
- Nothing an importer produces is saved as a recipe until a person confirms it on the review screen.
- A handler is a function of the job, its input and its tools, registered in `imports/handlers.ts`. It returns a draft and saves nothing. It says how it failed by what it throws: `RetryableImportError`, or `PermanentImportError` with a code the list can explain (`ImportRow.tsx` holds the words for each code).
- A run starts by claiming the job. Do not run a handler for a job that could not be claimed: that is what makes a message delivered twice harmless.
- The link importer reads only what the page states in schema.org JSON-LD and guesses nothing. Every address it asks for, redirects included, goes through `checkedUrl()`; do not let `fetch` follow redirects by itself.
- The importer asks for a page with a browser's request headers (`BROWSER_HEADERS` in `url.ts`), by the owner's decision. That is the limit. A site's refusal is final for that try: do not add retries of a refusal, a choice of identities, proxies, or anything else meant to get past a block.
- A page can arrive from the cook's own browser, by the "Send to Recipeflare" bookmark (`apps/web/src/api/sentPage.ts`). It comes in the address after the `#`, and the Add page asks before importing it. Never import a sent page unasked: any site can open that address. The bookmark's script is made from `window.location.origin` at run time; do not write an address into it.
- The JSON-LD finder, `findRecipe()`, is in the shared package, because the web app reads a sent page with it too. The mapping to a draft stays in the Worker.
- An import becomes a recipe only through `POST /recipes` with its `importJobId`, which completes the job in the save's own batch. Do not mark a job `completed` anywhere else.
- Review is the editor in review mode, opened by `ReviewImportPage` on a copy made by `prepareReview()`. Discard removes the import; leaving any other way keeps it.
- Worker tests have no network: `vitest.config.ts` answers every outbound request with a 503. A test that needs a page passes the importer its own `fetch`.
- An import with more than one step runs in stages, one queue message each. A handler is called for one stage (`job.stage`, and `work` for what earlier stages kept) and returns the draft or `new NextStage(stage, work)`. It does not loop over stages or send messages itself.
- A stage must be safe to run twice: it reads `work`, does one thing, and returns. A message says which stage it is for, and one for a stage the job has left is dropped; do not remove `stage` from the message.
- "Try again" keeps a failed job's stage and work, so it takes up where it failed. Do not reset them.
- The runner wraps `tools.ai` for each job: it records every call in `work.calls`, checks the daily limit before a job's first call, and turns a failed call into the job's outcome. A handler lets an `AiFailure` pass; it does not catch one to retry or to pick its own code.
- The Worker's default export is an object with `fetch` and `queue`. The dead-letter queue is told from the import queue by its name ending in `-dlq`; keep that ending when naming one.

### AI

- Only `apps/worker/src/ai/` uses `env.AI`. Everything else is handed the runner: an import handler as `tools.ai`, a route through `createApp({ ai })` or `aiFor(c.env)`.
- Tests, `pnpm dev` and the end-to-end run never reach a model: Workers AI has no local version and a real call is billed. The Worker tests set `remoteBindings: false` and Wrangler is started with `--local`; do not remove either, or CI, which has no Cloudflare credentials, stops. A test hands the runner a stand-in (`standInBinding()` and `chatAnswer()` in `test/helpers.ts`); a test that should not use a model passes `noAi`.
- A model ID is a setting. It lives in a profile in `ai/profiles.ts` and nowhere else; do not write one into a handler, a prompt or a test of behaviour.
- A model's answer is checked against a Zod schema before anything uses it. An answer that does not fit is asked for once more and then fails; do not loosen the schema to let one through.
- What a failed call means is decided in `ai/failure.ts`, from the service's own error code. A handler does not catch and retry a model call itself.
- Every call goes through the gateway and asks it not to keep what was asked and answered. `AI_LOG_CONTENT` is the only thing that changes that.
- AI settings (`AI_PROFILE`, `AI_GATEWAY`, `AI_LOG_CONTENT`, `AI_DAILY_IMPORTS`) are deploy variables typed by `AiSettings`, not part of `wrangler.jsonc`.
- Prompts are this project's own words, in `ai/prompts.ts`, each with a version that is kept with every call. Change the words, change the version. Nothing is copied from Mealie.
- A model copies; it does not write. It is asked for text as written (`Reading` in `imports/build.ts`), not for a `RecipeDraft`: amounts, units and foods are read from the lines by the same rules as a typed line, and a time from its words by `readStatedDuration()`. Do not ask a model to work out what code can read.
- What a model wrote is checked against the text it was given (`imports/sourceCheck.ts`). A line, a step or a title with a word the text does not have is kept and gets a doubt; it is never dropped quietly and never accepted quietly. A yield, a time or a heading the text does not state is dropped. Do not loosen the check to make a model look better.
- A doubt is a `{ where, why }` on the draft (`where` is `title`, `ingredient:3`, `step:0`, counted from zero across sections). `checkDraft()` turns each into an issue and review lists it. Text with no recipe in it fails with `too_thin`; it is not padded out.
- A draft a model made is returned as `new AiDraft(draft, sourceText)`, so that review shows the text beside it and says a model wrote it.
- The stand-in (`AI_MODE=stand-in`) is for localhost: `.dev.vars` and the end-to-end server set it, and the deploy script never does. Do not add it to `SECRET_NAMES` in `scripts/deploy.mjs`.

### Photos and attachments

- A file is uploaded first (`POST /assets`) and belongs to nothing. A recipe's save attaches it: `assets` on the input is the recipe's whole list, in order, and an asset left out is deleted. Do not add a second way to attach, reorder or remove.
- The editor sends photos at Save, never when they are chosen. Until then a photo is shown from the device. `sentPhotos` is what stops a second try from sending one twice.
- Every address of a stored file comes from `assetUrl()` in `apps/web/src/api/assets.ts`. A screen is handed a `photoUrl` function and builds no address itself.
- R2 keys are derived from the asset's ID by `assetKey()` and never stored. A stored file never changes, which is why it is served as immutable.
- What a file is comes from `sniffType()`, never from the request's content type. Only the picture types it knows are served inline; anything else is a download. Do not serve SVG or HTML from the app's origin.
- The Images binding is optional in the code (`env.IMAGES?`). A picture whose smaller sizes could not be made is kept and served from its original; nothing may depend on `hasVariants` being true.
- Rows are deleted before files. A route that removes assets deletes their files after answering, with `waitUntil`.
- An import's picture is fetched by the runner (`imports/picture.ts`), through `fetchChecked()`. A handler still saves nothing.
- An attachment is a file with the role `attachment`: any kind, sent as it is, listed by `attachmentName()` and `formatFileSize()` from the shared package. It is offered as a download and never shown inside the app. The device does not keep attachments, so offline they are named and not offered.

### Licensing

- Do not copy code, components, prompt text or translations from Mealie. Build from the feature list in the build plan.
- Do not use the word Cloudflare or its flare shapes in the app's name or icon.
- New dependencies must be compatible with AGPL-3.0-only.

### Secrets and privacy

- No secrets in the repository, in `wrangler.jsonc` or in CI logs. Local secrets go in `.dev.vars`; deployed ones are Wrangler secrets.
- The repository is public. Do not commit the household's domain, hostnames, Zero Trust team domain, Access audience tags, Cloudflare account or resource IDs, or email addresses. Hostnames and Access settings are GitHub environment secrets, so they are masked in the public CI logs. This applies to docs, tests, commit messages and pull requests too.
- `wrangler.jsonc` names resources and never holds an ID, a route or a hostname. The top-level config is production for every install; `env.staging` is this project's own.
- Never print a secret or a hostname from a script or a workflow step.
- Do not commit real recipe pages fetched from other sites. Test fixtures for URL import are synthetic.

## Testing

- Three Vitest projects, run together from the root config: `packages/schema` (tests beside the source), `apps/worker` (tests in `apps/worker/test/`), `apps/web` (tests beside the source).
- Worker tests run in workerd through `@cloudflare/vitest-plugin` (`cloudflareTest()` in the Vitest config). Import `env` and `exports` from `cloudflare:workers` and call `exports.default.fetch()`; queue and migration helpers come from `cloudflare:test`.
- Web tests use Testing Library on happy-dom. Render a screen with `renderAt(path)` from `src/test-utils.tsx`, which mounts the whole app at an address with its own query cache and returns the `router` and the `queryClient`. Stub `fetch` with `vi.stubGlobal`; stubs and mocks are reset after each test by the config. `RecipesPage.test.tsx` shows how to stand in for the API, including a session that has run out.
- Test tooling (`vitest`, the Cloudflare plugin, happy-dom) is installed at the workspace root only. Do not add `vitest` to a package: a second copy breaks the run.
- Storage is isolated per test file, not per test. Use distinct IDs within a file, or reset and re-apply migrations.
- `test/helpers.ts` has `seedLists()`, which gives a test file the fixtures' member, foods, units, labels and organizers, and `countingDatabase()`, which counts round trips.
- A Worker test that needs a signed-in member builds its own app with `createApp({ fetchKeys })` and states every auth setting itself, as `test/auth.test.ts` does, so that a developer's `.dev.vars` cannot change the result. Test email addresses are at `example.com`.
- Worker tests apply the real migration files before each test file (`test/apply-migrations.ts`), so a schema change needs its migration before its tests can pass.
- New behaviour comes with a test. A bug fix comes with a test that fails without it.
- The end-to-end run (`e2e/`) is Playwright, not Vitest: specs end in `.spec.ts`. They share one database and run in order, one at a time, so each spec starts by emptying the library (`emptyLibrary()`). It runs against the built app, service worker included, so going offline in a spec is real.
- The accessibility spec fails on a serious or critical axe finding on any screen it lists. A new screen is added to its list.
- `@playwright/test` is pinned to an exact version. Move it on purpose, and install the matching browser.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, the schema-drift check, test, build, a deploy dry run and the end-to-end run on every pull request and on pushes to `main`. On `main` it then deploys staging. `.github/workflows/deploy.yml` is the manual deploy.

## Style

- TypeScript throughout, strict mode. No `any` without a comment saying why.
- Database tables and columns are `snake_case`; API JSON is `camelCase`; timestamps are ISO 8601 UTC strings.
- API errors use the shared error body: `{ error: { code, message, issues? } }`.
- Web: mobile first at 390 px. Every screen handles loading, empty, error and offline.
