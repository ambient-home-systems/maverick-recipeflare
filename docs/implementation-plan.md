# Maverick Recipeflare — Implementation Plan (Phases 0 and 1)

22 Nov 2026. Companion to the [build plan](build-plan.md), which stays the source of truth for scope, architecture, roadmap and decisions. This document turns Phase 0 (foundations and design) and Phase 1 (core recipes) into buildable work. Later phases appear only where they constrain a choice made now.

**Phase 0 is complete.** Its gate passed on 23 Nov 2026 ([§2.3](#23-phase-0-gate)), and tasks T0.1 to T0.13 are built. Phase 1 starts with T1.1. Sections 1 to 8 were written before any code existed and have been kept current as tasks changed them.

Updated the same day with the owner's answers to the first five open questions; see [Decisions since the build plan](#decisions-since-the-build-plan).

## Contents

- [What was checked, and what it changed](#what-was-checked-and-what-it-changed)
- [Conflicts with the build plan](#conflicts-with-the-build-plan)
- [Decisions since the build plan](#decisions-since-the-build-plan)
- [1. Frontend framework](#1-frontend-framework)
- [2. Phase 0 design work](#2-phase-0-design-work)
- [3. Repository layout](#3-repository-layout)
- [4. Data model](#4-data-model)
- [5. Shared recipe schema](#5-shared-recipe-schema)
- [6. Auth](#6-auth)
- [7. Import jobs](#7-import-jobs)
- [8. Testing, CI, migrations and deploys](#8-testing-ci-migrations-and-deploys)
- [9. Task list](#9-task-list)
- [10. Open questions](#10-open-questions)

## What was checked, and what it changed

Platform facts below were read from the live Cloudflare docs and from the published packages on 22 Nov 2026, because several have moved since the build plan's sources were gathered.

| Fact | Source | Effect on this plan |
| --- | --- | --- |
| D1: 100 bound parameters per statement; 100 KB per SQL statement; 2 MB per string or row; 100 columns per table and per result; `LIKE` patterns capped at 50 bytes; 30 s for a whole batch | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) | Sets the insert chunk sizes in [§4.6](#46-one-batch-recipe-save); slug lookups and `IN` lists avoid `LIKE` and long parameter lists |
| A `db.batch()` counts as one query against the per-invocation limit (1,000 paid, 50 free) and is one transaction that rolls back if any statement fails | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/) | A recipe save is 1–2 reads plus one batch, on either plan |
| D1 supports FTS5 and the JSON functions; foreign keys are always enforced; `wrangler d1 export` does not work on a database with virtual tables | [SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/), [foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) | Backups rely on Time Travel (30 days on Workers Paid, always on) and the build plan's JSON export, never on `d1 export` |
| A queue has one consumer. Switching it to HTTP pull means removing the Worker consumer, and pull is set up by CLI or dashboard, not in the Wrangler file | [Pull consumers](https://developers.cloudflare.com/queues/configuration/pull-consumers/) | The Phase 3 fetch agent needs its own queue beside the Worker-consumed one ([§7](#7-import-jobs)) |
| Queues: 128 KB per message, default 3 retries, messages past the retry limit are deleted unless a dead-letter queue is set, `max_batch_timeout` can be 0, consumers get 15 minutes of wall time, local simulation works in `wrangler dev` | [Queues limits](https://developers.cloudflare.com/queues/platform/limits/), [batching and retries](https://developers.cloudflare.com/queues/configuration/batching-retries/), [dead-letter queues](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/), [local development](https://developers.cloudflare.com/queues/configuration/local-development/) | Messages carry a job ID only; a dead-letter queue is part of Phase 1 |
| `ctx.access` is not passed to a Worker that has Static Assets | [Workers and Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) | The Worker validates the `Cf-Access-Jwt-Assertion` header itself with `jose`, as the build plan says and as Cloudflare's [own example](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) does |
| Worker-level Access (the per-Worker toggle) rejects WebSocket upgrades with 403 | Same page | Use a hostname-based Access application from day one, because Phase 4's live shopping lists use WebSockets |
| With SPA asset handling and a compatibility date of 2025-04-01 or later, browser navigations are served from assets without running the Worker; `assets.run_worker_first` takes route patterns | [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) | `run_worker_first: ["/api/*"]`; the Worker's auth check covers the API, and Access at the edge covers the static shell |
| The Deploy button still provisions D1, R2, KV, Durable Objects, Workers AI and Queues, and not Workflows; it reads the Wrangler file of the repository (or a subdirectory) it clones | [Deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/) | Wrangler config sits at the repository root ([§3](#3-repository-layout)); jobs use Queues only |
| The Workers Vitest integration is now `@cloudflare/vitest-plugin` 1.9 (Vitest 4.1 or 5). `@cloudflare/vitest-pool-workers` is deprecated. Storage is isolated per test file, not per test | Package READMEs on npm; [Vitest integration docs](https://developers.cloudflare.com/workers/testing/vitest-integration/) | [§8.1](#81-tests) uses the new package and its API |
| Workers AI JSON mode takes a JSON Schema and can fail with `JSON Mode couldn't be met`; no streaming | [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) | The draft schema in [§5](#5-shared-recipe-schema) stays plain enough to export as JSON Schema |
| aiomealie 2.1.4 (latest on PyPI) calls 29 distinct paths; its models were read field by field | `aiomealie-2.1.4` source from PyPI | Mapping table in [§4.7](#47-mapping-to-aiomealie) |

Not verified in this session: Cloudflare Images binding pricing and its included transformations, Drizzle 1.0's stable release date, and what the Deploy button requires as placeholder resource IDs. The first and last are in [§10](#10-open-questions); the Drizzle version was pinned and checked in T0.11 (see [§8.3](#83-d1-migrations)).

## Conflicts with the build plan

Three real conflicts were found. None reopens a decision; each has a resolution that keeps the decision intact.

1. **Workflows as a second job mechanism.** The architecture table gives jobs to "Queues and Workflows" and video step 5 runs in a Workflow, while the Deploy-button section says Workflows are not provisioned and "import jobs need a Queue-only fallback". Building both means building every import twice. **Resolution:** Queues are the only job mechanism. Multi-step imports are stages recorded on the job row, each stage one queue message ([§7](#7-import-jobs)). The Deploy button's list still omits Workflows, so this also removes that risk. Revisit only if a Phase 3 stage cannot fit a 15-minute consumer.
2. **Meal-plan IDs.** The data-model section says IDs are generated in the Worker. aiomealie types `Mealplan.mealplan_id` as `int`, and its get, update and delete calls take it as an integer. **Resolution:** every Phase 1 table uses Worker-generated UUIDs; the Phase 4 meal-plan table is the one exception and uses an integer key. A meal-plan entry is a single row, so it does not need the atomic-save property that motivated Worker-generated IDs.
3. **"30 Mealie API paths".** The compatibility table lists 29, and aiomealie 2.1.4 calls 29. Nothing to resolve; the count in the text is off by one.

Four places where this plan reads the build plan in a particular way, so you can object:

- **"Saved as a draft"** (video step 6) is implemented as an import job in `needs_review` holding the draft, not as a recipe row with a draft status. The `recipes` table then only ever holds confirmed recipes, so search and the Home Assistant API never filter drafts.
- **Default units.** A fixed list of about 25 common units ships in a migration. The out-of-scope list excludes "data seeders"; that is read as Mealie's seeding feature, not as a ban on a starting unit list.
- **Search index columns.** The FTS index covers title, description, ingredients and the names of all organizers (tags, categories and tools), a superset of the "title, description, ingredients and tags" in the architecture table.
- **Contract-test pin.** "Pinned to an aiomealie version" should mean the version your Home Assistant release pins, not the latest. The newest Home Assistant wheel installable in this session (2026.2.3) pins aiomealie 1.2.0, while PyPI is at 2.1.4.

## Decisions since the build plan

Made by the owner on 22 Nov 2026 in answer to this plan's open questions. The second one amends the build plan's roadmap; the build plan's text has not been edited.

| Decision | Choice | What it changes |
| --- | --- | --- |
| Hostnames and identifiers | The repository is public. The household's domain, hostnames, Zero Trust team domain, Access audience tags and account ID never appear in it | Hostnames are CI variables passed at deploy time; the Access settings are Worker secrets ([§8.4](#84-environments-and-deploys)) |
| Ingredient parser | The rule-based half moves from Phase 2 to Phase 1. The AI fallback stays in Phase 2 | New task T1.5; about 5 hours move from Phase 2's budget to Phase 1's ([§5.1](#51-rule-based-ingredient-parser)) |
| Core screens | List and search, recipe view, editor with review mode, cook mode, as a starting set | [§2.2](#22-the-four-core-screens) stands; the gate review can add a screen |
| "From" field | Recipes get an optional source name, for a relative, a cookbook or a social-media account | New `recipes.source_name` column and `sourceName` in the schema; searchable |
| Visual direction | "Recipe tin", chosen by the owner from three sketches: the index-card recipe tin, with categories as coloured divider tabs | Recorded in `apps/web/DESIGN.md`; every screen is built from its tokens and components |
| Public library | The owner wants the option to make the recipe library public | Not designed yet; see [§10](#10-open-questions). It touches auth, because Cloudflare Access sits in front of everything today |
| Drizzle | Start on 1.0 (currently a release candidate) | Folder-per-migration layout with Wrangler's `migrations_pattern` ([§8.3](#83-d1-migrations)) |

## 1. Frontend framework

**Recommendation: React 19 with TypeScript.** Runner-up: Svelte 5.

Capacitor wraps whatever `vite build` emits, and the web APIs this app leans on (service worker, Screen Wake Lock, camera capture, Web Share Target) are framework-neutral, so those do not separate the candidates. These do:

| Criterion | React 19 | Svelte 5 |
| --- | --- | --- |
| Claude Code writes most of the code (a build-plan assumption) | Largest body of existing code and examples; generated code needs the fewest corrections | Runes are recent, and generated code tends to mix Svelte 4 and Svelte 5 idioms. This is my judgment, not a measurement |
| The recipe editor: nested, reorderable field arrays validated by the shared Zod schema | Mature options: react-hook-form field arrays with a Zod resolver, dnd-kit with touch and keyboard sensors | Workable, with fewer and younger libraries for touch reordering and complex forms |
| Accessible primitives for sheets, comboboxes and dialogs on phones | Deep (Radix, Base UI, React Aria) | Good (Bits UI, Melt), smaller |
| Offline data | TanStack Query with IndexedDB persistence | Same library has a Svelte adapter |
| Bundle size | About 60 KB gzipped of runtime before app code | A fraction of that |
| Amount of code for the same screen | More | Less |
| Distance from Mealie's Vue components (the build plan's fresh-code rule) | Different framework | Different framework |

React wins on the two criteria that cost hours on this project: reliability of generated code, and library depth for the editor, which is the hardest screen in Phase 1 and becomes the review screen in Phase 2. Its bundle cost is paid once and then served from the service-worker cache.

Svelte 5 is the choice if you expect to write much of the UI by hand, or if old, slow phones matter more than I am assuming. Vue was not considered further: it would be a sound technical choice, but using Mealie's own framework makes accidental copying of its components more likely.

**Supporting defaults the mockups start with.** These are cheap to change before task T0.6 and expensive after Phase 1:

| Concern | Default |
| --- | --- |
| Build | Vite, static SPA output, no server rendering |
| Routing | TanStack Router, with filters and search held in URL search params |
| Server state | TanStack Query, persisted to IndexedDB |
| Styling | Tailwind CSS 4 with design tokens as CSS variables |
| Components | Components owned in the repo, built on headless accessible primitives |
| Type and icons | Atkinson Hyperlegible Next, self-hosted so it works offline; Lucide icons |
| Forms | The editor holds its own value and checks it with the shared Zod schemas when Save is pressed. This replaces react-hook-form, the first choice here, and was decided while drawing the editor (T0.9): ingredients and steps are flat sortable lists with one row open at a time, and numbers are kept as the text typed, neither of which fits a form library's field arrays. Nothing else in the plan depended on the library |
| Reordering | dnd-kit |
| PWA | vite-plugin-pwa (Workbox) with a hand-written service worker |

## 2. Phase 0 design work

### 2.1 Feature spec outline

`docs/feature-spec.md` covers Phase 1 in full and Phase 2 only where it changes a Phase 1 screen. It is short and decision-oriented; each section ends with the decisions it made.

1. **People and devices.** Who cooks, who enters recipes, which phones and tablets, where the device sits while cooking.
2. **Recipe content.** Every field, with examples from three real family cards: title, description, yield and servings, times, ingredient sections, instruction sections, notes, nutrition, source, photos, the original card photo, attachments. What is required (only the title).
3. **Entering ingredients.** How a line is typed: structured fields, free-text fallback, how units and foods are picked or created inline, how sections are added and reordered. The cook types a line and the rule-based parser fills the structured fields ([§5.1](#51-rule-based-ingredient-parser)); this section decides how the result is shown and corrected.
4. **Organizers.** Categories, tags and tools; foods, units and labels; creating inline, renaming, deleting something in use.
5. **Finding recipes.** Search behaviour, filters and how they combine, sorts, empty and no-result states.
6. **Import from a URL.** Entry point, progress, the review step, failure messages, duplicates.
7. **Cook mode.** Layout, checkboxes, scaling, screen-on behaviour, what happens on reload or a locked phone.
8. **Offline.** Which recipes and images are available offline, and what the app shows when the session has expired. Proposed default: every recipe's data syncs to the device in the background; images are cached once viewed.
9. **Deleting and undoing.** Proposed default: delete is permanent after a confirmation; no trash in Phase 1.
10. **Accessibility and sizing.** Touch target minimum, text scaling, contrast, one-handed reach, landscape.
11. **Out of Phase 1.** A list, so that gate testing does not log missing Phase 2 features as workarounds.

### 2.2 The four core screens

The build plan says "the four core screens" without naming them. These four cover the Phase 1 gate and are the ones Phase 2 builds on.

Each mockup is a real route in the web app (`/mock/...`), rendered from fixture recipes that must validate against the shared schema, at a 390 px phone width first and checked at tablet width. Reviewing on real phones through the staging deploy is part of the gate.

| Screen | Must show |
| --- | --- |
| **1. Recipe list and search** | Search box with live results; filter chips for category, tag, tool and food, and how several combine; sort control; recipe cards with thumbnail, title, total time and tags; entry points for "new recipe" and "import from URL"; an import in progress; states for loading, first run with no recipes, no results, and offline |
| **2. Recipe view** | Cover photo; title and description; times, servings and yield; scaling control and its effect on quantities; ingredients grouped by section, including an unparsed free-text line next to parsed ones; steps grouped by section; notes; nutrition; organizers; source link; the original card photo and how it opens; actions for cook, edit and delete; a long recipe (25 ingredients, 15 steps) and a minimal one (title only) |
| **3. Recipe editor** | Every field from spec section 2; the ingredient line editor: a typed line, what the parser made of it, and how to correct a field or leave the line as free text; adding, renaming and reordering sections and lines by touch; unit and food pickers with create-inline; organizer pickers; photo upload and cover choice; field-level validation errors; the unsaved-changes guard; the "someone else changed this recipe" message; **review mode** after a URL import, with flagged fields, and how the same layout will put the original photo beside the draft in Phase 2 (toggle on phones, side by side on tablets) |
| **4. Cook mode** | Large-type steps with checkboxes; ingredient checklist and how it is reached from a step; scaling; the screen-on indicator; progress through sections; phone portrait and tablet landscape; behaviour when offline or when the session has expired |

Alongside the screens, T0.6 fixes the design tokens (colour in light and dark, type scale, spacing, radius), a placeholder icon that stays clear of Cloudflare's flare shapes, and the app shell (navigation and page frame).

### 2.3 Phase 0 gate

"Mockups approved and schema reviewed" passes when:

- each of the four mock screens has been reviewed on at least one iPhone and one Android phone, and the approval is recorded in the gate pull request;
- every field on three real family cards has a home in the schema, the aiomealie mapping in [§4.7](#47-mapping-to-aiomealie) has no gaps, and the migrations apply cleanly to staging.

**The gate passed on 23 Nov 2026.**

**Gate record, screens half (T0.13, 23 Nov 2026).** The owner went through the four mock screens on staging on an iPhone and an Android phone and reported that everything works. No change was asked for. The same visit confirmed sign-in: the mock index named the owner as signed in, which was the last open check of T0.12.

Four defaults were put to the owner at the gate and drew no objection, so they stand for Phase 1: the 25 starting units with fractions by default; a range such as "2 to 3 cups" stored as its first number with the line as written keeping the range; imported recipes staying out of the list until confirmed; and anyone Access admits becoming a member, the first as owner.

**Gate record, schema half (T0.13, 23 Nov 2026).**

- *The cards.* Each row of the feature spec's card walk-through was followed from the card's fixture to a column: title, the ingredient lines in the card's order with their text as written, steps, cook time, the stated yield, the note about the unclear pen marks, the category and the original-card photo. Nothing on a card lacks a column. Two things are knowingly not kept as data, and the photo keeps both: a card's filing letter, and ingredient groups that have no heading.
- *The aiomealie mapping.* Every field of every model in aiomealie 2.1.4 was listed again from its source and set against §4.7. Every table and column the mapping names exists in the applied migration, and every field the library requires as a string comes from a column that cannot be null. Two models the table did not list, the group and household summaries, are added; both read the `household` row. One thing for Phase 6 is noted on `UserInfo`. Models for meal plans, shopping lists, ratings and favourites belong to the later tables listed under the mapping.
- *The migrations* applied to the staging database on 23 Nov 2026: four migrations, and the deploy log shows each one marked done.

## 3. Repository layout

One pnpm workspace. One deployed Worker.

```text
/
├─ wrangler.jsonc            Worker config: bindings, assets, queues, env.staging
├─ package.json              Root scripts: dev, build, test, lint, typecheck, db:*, deploy, deploy:staging
├─ pnpm-workspace.yaml
├─ apps/
│  ├─ worker/                Hono API, queue consumer, auth, database access
│  │  ├─ src/
│  │  │  ├─ index.ts         fetch and queue handlers
│  │  │  ├─ routes/          one file per resource
│  │  │  ├─ auth/            identity providers and the member middleware
│  │  │  ├─ db/              Drizzle schema, repositories, search
│  │  │  └─ imports/         job runner and one handler per import kind
│  │  ├─ migrations/         D1 migrations (generated and hand-written)
│  │  └─ test/
│  └─ web/                   Vite React PWA; builds to apps/web/dist
│     └─ src/                routes, components, api client, service worker, mocks
├─ packages/
│  └─ schema/                @recipeflare/schema: Zod schemas, types, formatting, fixtures
├─ services/
│  └─ fetch-agent/           README only until Phase 3 (yt-dlp and ffmpeg image)
├─ scripts/                  Small Node scripts used by the root package scripts
├─ docs/
└─ .github/workflows/
```

Reasons for the choices that are not obvious:

- **Wrangler config at the root.** The Deploy button clones the repository, or one subdirectory of it, and reads the Wrangler file there. A config inside `apps/worker` would make the button clone a subdirectory that lacks the web app and the schema package. The root `build` and `deploy` scripts are therefore the single entry point for our CI and, in Phase 6, for Workers Builds on other installs.
- **Top-level config is production; `env.staging` is ours alone.** Other households deploy the top-level config. Bindings are not inherited by Wrangler environments, so `env.staging` repeats them with staging resource names.
- **`packages/schema` has no build step.** It exports TypeScript source; Vite and Wrangler both bundle it. It depends on Zod only, so it can run in the Worker, the browser and Node tests.
- **Two dev servers, one origin.** `pnpm dev` runs `wrangler dev` for the Worker and Vite for the web app, with Vite proxying `/api` to the Worker. Production serves `apps/web/dist` as the Worker's static assets. The Cloudflare Vite plugin would merge these into one process; it is left out for now because its version 2 is in beta and it selects environments at build time, which complicates the staging and production split.
- **Native API under `/api/v1`.** The Phase 4 Home Assistant subset must answer Mealie's own paths, such as `/api/recipes` and `/api/foods`, with Mealie's response shapes. Putting our API under `/api/v1` keeps the two from colliding on any hostname.
- **One API client in the web app with a configurable base URL.** The build plan's path to native apps needs the server address to be a setting. Asset URLs are built by one helper for the same reason.

`services/fetch-agent` is deliberately outside `apps/` and outside the pnpm workspace: it is a Docker image with its own runtime and release cycle, and it shares only the job message format with the Worker.

## 4. Data model

### 4.1 Conventions

- **Names.** Tables and columns are `snake_case`; API JSON is `camelCase`.
- **IDs.** Text UUIDs, lowercase with hyphens, generated in the Worker as UUIDv7 so that new rows land in index order. Mealie emits UUID strings in every ID field aiomealie reads, so nothing downstream sees an unfamiliar format. Child rows of a recipe (ingredients, steps, notes) may also arrive with IDs generated by the client; any UUID version is accepted.
- **Timestamps.** ISO 8601 UTC text with milliseconds (`2026-11-22T18:04:05.123Z`), set by the Worker.
- **Booleans** are `INTEGER` 0 or 1. **JSON columns** are `TEXT`, validated by the shared schema on write and on read.
- **Enumerations that will grow** (job kind, job status, asset role) are validated in the shared schema, not with `CHECK` constraints. Changing a `CHECK` means rebuilding the table, and D1's docs warn that a rebuild can cascade-delete child rows.
- **Name keys.** Foods, units and labels carry a `name_key`: the name trimmed, lowercased, Unicode-normalized and whitespace-collapsed by one shared function. It enforces uniqueness now and is the match key for the Phase 2 ingredient parser.
- **Foreign keys** are always enforced by D1. Children of a recipe cascade on delete. References to foods, units and members restrict.
- **No table may hold a foreign key to a recipe's child rows.** Children are replaced on every save ([§4.6](#46-one-batch-recipe-save)). Phase 4 shopping items reference the recipe, not its ingredient rows.

### 4.2 Slugs

One `slugify` function in the shared package:

1. Unicode NFKD, drop combining marks, lowercase.
2. Replace `&` with `and`; replace every run of characters outside `a-z0-9` with one hyphen; trim hyphens.
3. Cut to 80 characters at a hyphen; if empty, use `recipe`.
4. Words the web router owns (`new`, `import`, `edit`) are treated as taken.

Recipes: if the slug is taken, append `-2`, `-3` and so on, lowest free number first. The lookup is a range scan on the unique index (`slug = :base OR (slug > :base || '-' AND slug < :base || '.')`), not `LIKE`, because D1 caps `LIKE` patterns at 50 bytes. The unique index is the final arbiter: on a collision the save retries once with the next suffix.

A recipe's slug follows its title: it is regenerated when the title changes, as in Mealie. The API resolves `/recipes/{idOrSlug}` by ID first, then slug. Anything that must survive a rename stores the ID. There is no redirect history in Phase 1.

Organizers: the same function, unique per kind. A collision means the organizer already exists and returns a conflict; no suffix is added.

### 4.3 Tables

All fifteen Phase 1 objects. "FK" columns reference the named table's `id`.

**`household`** — one row, created at first sign-in. Supplies Mealie's group and household IDs in Phase 4.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key |
| `singleton` | INTEGER | no | Default 1, `UNIQUE`, `CHECK (singleton = 1)`; keeps it to one row |
| `name` | TEXT | no | |
| `slug` | TEXT | no | |
| `created_at` | TEXT | no | |

**`members`**

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key |
| `email` | TEXT | yes | Lowercased; `UNIQUE`. Nullable for Phase 6 passkey-only members |
| `display_name` | TEXT | no | |
| `role` | TEXT | no | `owner` or `member` |
| `disabled_at` | TEXT | yes | A disabled member cannot sign in |
| `created_at`, `updated_at` | TEXT | no | |

**`recipes`**

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key |
| `slug` | TEXT | no | `UNIQUE` |
| `title` | TEXT | no | The only required content field |
| `description` | TEXT | no | Default `''` |
| `servings` | REAL | yes | |
| `yield_quantity` | REAL | yes | |
| `yield_unit` | TEXT | yes | Free text, such as "cookies" |
| `prep_time_seconds` | INTEGER | yes | |
| `cook_time_seconds` | INTEGER | yes | |
| `total_time_seconds` | INTEGER | yes | Stored as given; the UI sums prep and cook when it is null |
| `nutrition` | TEXT | yes | JSON object of schema.org nutrition keys with string values as printed |
| `source_name` | TEXT | yes | "From": who or where the recipe came from, such as a relative, a cookbook or a social-media account |
| `source_url` | TEXT | yes | Canonicalized: fragment and tracking parameters removed, host lowercased |
| `version` | INTEGER | no | Default 1; optimistic concurrency ([§4.5](#45-version-guard)) |
| `created_by`, `updated_by` | TEXT | no | FK `members`, restrict |
| `created_at`, `updated_at` | TEXT | no | |

Indexes: `UNIQUE(slug)`, `(updated_at)`, `(created_at)`, `(title COLLATE NOCASE)`, `(source_url)`.

**`recipe_ingredients`** — one row per ingredient line.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key; stable across saves |
| `recipe_id` | TEXT | no | FK `recipes`, cascade |
| `position` | INTEGER | no | Order within the recipe, across sections |
| `section` | TEXT | yes | Section title; consecutive lines with the same value form one section |
| `original_text` | TEXT | yes | The line exactly as typed or imported; null only when the line was built from the structured fields |
| `quantity` | REAL | yes | |
| `unit_id` | TEXT | yes | FK `units`, restrict |
| `food_id` | TEXT | yes | FK `foods`, restrict |
| `note` | TEXT | no | Default `''` |

`CHECK (original_text IS NOT NULL OR food_id IS NOT NULL OR note <> '')`. Indexes: `UNIQUE(recipe_id, position)`, `(food_id)`, `(unit_id)`.

A line with only `original_text` is valid. It displays as written and does not scale. It is what remains when the rule-based parser cannot read a line. A parser, rule-based in Phase 1 or AI in Phase 2, fills the structured fields beside the original text and never overwrites it.

**`recipe_steps`**

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key; stable across saves |
| `recipe_id` | TEXT | no | FK `recipes`, cascade |
| `position` | INTEGER | no | |
| `section` | TEXT | yes | As for ingredients |
| `text` | TEXT | no | |
| `duration_seconds` | INTEGER | yes | Written from Phase 2 (step details) |
| `ingredient_refs` | TEXT | no | JSON array of `recipe_ingredients.id`, default `[]`; written from Phase 2 |

Index: `UNIQUE(recipe_id, position)`. The shared schema rejects a reference to an ingredient that is not in the same recipe, and the whole recipe is always saved together, so a JSON column cannot dangle and saves a link table.

**`recipe_notes`**

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key |
| `recipe_id` | TEXT | no | FK `recipes`, cascade |
| `position` | INTEGER | no | |
| `title` | TEXT | no | Default `''` |
| `text` | TEXT | no | |

Index: `UNIQUE(recipe_id, position)`.

**`organizers`** — categories, tags and tools in one table, because their shape and behaviour are identical.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key |
| `kind` | TEXT | no | `category`, `tag` or `tool`; a closed set, so `CHECK` is used |
| `name` | TEXT | no | |
| `slug` | TEXT | no | |
| `color` | TEXT | yes | For a category: its divider stock, one of `buff`, `salmon`, `sky`, `mint`, `lilac`. Set when the category is created, taking the least-used stock, so a category keeps its colour when another is deleted. Null for tags and tools. `color` on the shared `Organizer` shape since T1.3 |
| `created_at`, `updated_at` | TEXT | no | |

Index: `UNIQUE(kind, slug)`.

**`recipe_organizers`**

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `recipe_id` | TEXT | no | FK `recipes`, cascade |
| `organizer_id` | TEXT | no | FK `organizers`, cascade |

Primary key `(recipe_id, organizer_id)`; index `(organizer_id, recipe_id)` for filtering.

**`labels`** — also the store aisles in Phase 4.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key |
| `name` | TEXT | no | |
| `name_key` | TEXT | no | `UNIQUE` |
| `color` | TEXT | yes | |
| `sort_order` | INTEGER | no | Default 0; aisle order |
| `created_at`, `updated_at` | TEXT | no | |

**`foods`**

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key |
| `name` | TEXT | no | |
| `name_key` | TEXT | no | `UNIQUE` |
| `plural_name` | TEXT | yes | |
| `description` | TEXT | no | Default `''` |
| `aliases` | TEXT | no | JSON array of strings, default `[]` |
| `label_id` | TEXT | yes | FK `labels`, set null |
| `created_at`, `updated_at` | TEXT | no | |

Index: `(label_id)`.

**`units`**

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key |
| `name` | TEXT | no | |
| `name_key` | TEXT | no | `UNIQUE` |
| `plural_name` | TEXT | yes | |
| `abbreviation`, `plural_abbreviation` | TEXT | yes | |
| `use_abbreviation` | INTEGER | no | Default 0 |
| `fraction` | INTEGER | no | Default 1; show quantities as fractions |
| `description` | TEXT | no | Default `''` |
| `aliases` | TEXT | no | JSON array of strings, default `[]` |
| `standard_quantity` | REAL | yes | With `standard_unit`, the conversion to a base unit; used by Phase 5 conversions |
| `standard_unit` | TEXT | yes | |
| `created_at`, `updated_at` | TEXT | no | |

A migration inserts 25 common units with fixed IDs. Teaspoon gets the alias `t`, tablespoon `T` and cup `C`, so that handwritten abbreviations match (see [§5.1](#51-rule-based-ingredient-parser)). `name_key` uniqueness applies to unit names; aliases are compared as written. Foods and labels start empty and are created as recipes are entered.

**`assets`** — images and attachments, owned by a recipe, an import job, or both in turn.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key; also the R2 key prefix |
| `recipe_id` | TEXT | yes | FK `recipes`, cascade |
| `import_job_id` | TEXT | yes | FK `import_jobs`, set null |
| `role` | TEXT | no | `cover`, `photo`, `original` (the paper card) or `attachment` |
| `position` | INTEGER | no | Default 0 |
| `content_type` | TEXT | no | |
| `size_bytes` | INTEGER | no | |
| `width`, `height` | INTEGER | yes | Images only |
| `has_variants` | INTEGER | no | Default 0; 1 once the WebP variants exist |
| `original_filename` | TEXT | yes | |
| `created_by` | TEXT | no | FK `members` |
| `created_at` | TEXT | no | |

Indexes: `(recipe_id, role, position)`, `(import_job_id)`, and a partial unique index on `(recipe_id) WHERE role = 'cover'`.

R2 keys are derived, not stored: `assets/{id}/original`, `assets/{id}/thumb.webp` (480 px) and `assets/{id}/full.webp` (1600 px). The upload request streams the original to R2 and then makes both variants with the Images binding. If that fails the original is still kept and served. An asset never changes after upload, so responses are cached as immutable, which is what lets the service worker keep them for offline cook mode.

An asset uploaded during an import belongs to the job until the cook confirms, when the save batch sets its `recipe_id`.

**`import_jobs`** — described in [§7](#7-import-jobs).

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | no | Primary key |
| `kind` | TEXT | no | `url` in Phase 1; `photo`, `text`, `video` later |
| `status` | TEXT | no | `queued`, `running`, `needs_review`, `completed`, `failed`, `cancelled` |
| `stage` | TEXT | yes | Current pipeline stage, for progress and resumption |
| `source_url` | TEXT | yes | Canonicalized as in `recipes` |
| `input` | TEXT | no | JSON: kind-specific input and options |
| `result` | TEXT | yes | JSON: the draft, its issues, and source details |
| `error_code`, `error_message` | TEXT | yes | |
| `attempts` | INTEGER | no | Default 0 |
| `recipe_id` | TEXT | yes | FK `recipes`, set null; set on confirmation |
| `created_by` | TEXT | no | FK `members` |
| `created_at`, `updated_at` | TEXT | no | |
| `finished_at` | TEXT | yes | |

Indexes: `(status, created_at)`, `(created_at)`, `(source_url)`.

**`recipe_search`** and **`recipes_fts`** — described next.

### 4.4 Full-text search

The index text comes from several tables (the recipe, its ingredient lines and food names, its organizers). Rather than triggers on each of those, the Worker writes one denormalized row per recipe into `recipe_search` inside the save batch, and three standard triggers keep an external-content FTS5 table in step with that row. This keeps the build plan's "kept in sync by triggers" while leaving one place where the text is assembled.

| `recipe_search` column | Type | Notes |
| --- | --- | --- |
| `doc_id` | INTEGER | Primary key. An explicit integer key, because FTS5 addresses content by rowid and implicit rowids are not guaranteed stable |
| `recipe_id` | TEXT | `UNIQUE`, FK `recipes`, cascade |
| `title` | TEXT | |
| `description` | TEXT | The description, followed by the recipe's source name so that "Grandma" finds her recipes |
| `ingredients` | TEXT | One line per ingredient: the food name if set, then the original text or note |
| `organizers` | TEXT | Names of the recipe's tags, categories and tools |

```sql
CREATE VIRTUAL TABLE recipes_fts USING fts5(
  title, description, ingredients, organizers,
  content = 'recipe_search', content_rowid = 'doc_id',
  tokenize = 'porter unicode61 remove_diacritics 2',
  prefix = '2 3'
);

CREATE TRIGGER recipe_search_ai AFTER INSERT ON recipe_search BEGIN
  INSERT INTO recipes_fts (rowid, title, description, ingredients, organizers)
  VALUES (new.doc_id, new.title, new.description, new.ingredients, new.organizers);
END;

CREATE TRIGGER recipe_search_ad AFTER DELETE ON recipe_search BEGIN
  INSERT INTO recipes_fts (recipes_fts, rowid, title, description, ingredients, organizers)
  VALUES ('delete', old.doc_id, old.title, old.description, old.ingredients, old.organizers);
END;

CREATE TRIGGER recipe_search_au AFTER UPDATE ON recipe_search BEGIN
  INSERT INTO recipes_fts (recipes_fts, rowid, title, description, ingredients, organizers)
  VALUES ('delete', old.doc_id, old.title, old.description, old.ingredients, old.organizers);
  INSERT INTO recipes_fts (rowid, title, description, ingredients, organizers)
  VALUES (new.doc_id, new.title, new.description, new.ingredients, new.organizers);
END;
```

- **Tokenizer.** Porter stemming makes "tomatoes" find "tomato"; `remove_diacritics` makes "creme" find "crème"; the prefix indexes make search-as-you-type cheap. Porter is English-only, which matches a household that translates recipes on the way in.
- **Queries.** User input is never passed to `MATCH` directly. It is split into tokens, each quoted, joined with `AND`, and the last token gets a prefix star. Results are ordered by `bm25()` with the title weighted highest. With no search text, the list skips FTS and sorts by the chosen column.
- **Filters** use `recipe_organizers` and `recipe_ingredients.food_id` with `EXISTS`, and combine with search. Proposed rule: every selected filter narrows the list.
- **As built in T1.4.** `ftsQuery()` keeps only the letters and digits of what was typed, as words, because that is all the index holds; so a quote, an operator or a column name typed into the box is at most another word. Text with no letter or digit in it, such as an emoji, finds nothing and is not an error. The stemmer is applied to the prefix word as well, so "tomatoe" still finds "tomato" while "tomatoes" is being typed. The weights are title 10, ingredients 4, organizers 3, description 2. "All of these tags" is one count compared with the number asked for, with the slugs passed as one JSON value. A slug or ID the household does not have finds nothing.
- **Renaming or deleting an organizer or food** rewrites `recipe_search` for the affected recipes in the same batch as the change, through the same function the save uses.
- **Deleting a recipe** deletes its `recipe_search` row explicitly in the batch, before the recipe, so the index does not depend on whether a cascaded delete fires triggers. A test asserts that a deleted recipe leaves search.
- **Migrations.** drizzle-kit does not model virtual tables or triggers, so this SQL lives in a hand-written migration. T0.11 must show that a migration containing `BEGIN … END` trigger bodies applies through Wrangler and through the test setup.
- **Rebuild.** `INSERT INTO recipes_fts (recipes_fts) VALUES ('rebuild')` re-derives the index from `recipe_search`. It belongs in the operations notes for restores.

### 4.5 Version guard

Two phones can edit one recipe. A D1 batch cannot branch on the result of an earlier statement, so the usual "update where version matches, then check rows changed" cannot stop the rest of the batch. A trigger can:

```sql
CREATE TRIGGER recipes_version_guard
BEFORE UPDATE OF version ON recipes
WHEN new.version <> old.version + 1
BEGIN
  SELECT RAISE(ABORT, 'version_conflict');
END;
```

The save sets `version` to the value the client loaded plus one. If someone else saved in between, the trigger aborts that statement, D1 rolls back the batch, and the API answers 409 with the current recipe so the editor can show what changed. The same guard later protects the Home Assistant recipe update, which reads, merges and writes.

### 4.6 One-batch recipe save

A save is: up to two reads, then one `batch()`.

**Reads before the batch**

1. Slug lookup, only on create or when the title changed.
2. Names of the referenced foods and organizers, to build the search text. `IN` lists are passed as one JSON parameter and expanded with `json_each`, so they never approach the 100-parameter limit. This is the rule for every `IN` list in the codebase.

**The batch, for an update**

| # | Statement | Bound parameters |
| --- | --- | --- |
| 1 | `UPDATE recipes SET … , version = :loaded + 1 WHERE id = :id` | about 19 |
| 2–5 | `DELETE` the recipe's ingredients, steps, notes and organizer links | 1 each |
| 6… | `INSERT` ingredients, 11 rows per statement | 9 columns × 11 = 99 |
| … | `INSERT` steps, 14 rows per statement | 7 × 14 = 98 |
| … | `INSERT` notes, 20 rows per statement | 5 × 20 = 100 |
| … | `INSERT` organizer links, 50 rows per statement | 2 × 50 = 100 |
| last | Upsert the `recipe_search` row | 5 |

A create replaces statement 1 with an `INSERT` and omits the deletes. Confirming an import adds two statements: attach the job's assets to the recipe and mark the job `completed`.

**Why it fits**

- **Parameters.** Rows are chunked by a helper that takes the column count and never exceeds 100 parameters per statement. The chunk sizes above are the maxima.
- **Statement size.** Every value is bound, so statement text is placeholders only and stays a few kilobytes against the 100 KB limit.
- **Row size.** The shared schema caps field lengths (a step is at most 4,000 characters), far below 2 MB.
- **Statement count.** The schema caps a recipe at 100 ingredient lines, 100 steps, 20 notes and 50 organizers. The largest possible save is 10 + 8 + 1 + 1 inserts plus 6 fixed statements: 26 statements in one batch. D1 documents no cap on statements per batch and its own example uses 2,000.
- **Query budget.** A batch counts as one query, so a save uses at most three of the 1,000 per invocation on Workers Paid, or of the 50 on the free plan.
- **Time.** A few dozen small writes is far inside the 30 seconds allowed for a batch.

**Why replace the children instead of diffing them.** One code path covers adds, edits, removals and reordering, and the cost is trivial at this size. Child IDs come back from the client and are reinserted unchanged, so a step's ingredient references survive an edit.

**What is not atomic.** The two reads happen before the batch. A slug collision in that gap fails the unique index and the save retries once. A food renamed in that gap leaves stale search text until the next save or rename, which rewrites it. New foods, units and organizers picked in the editor are created through their own endpoints before the save; a save that references a missing ID fails its foreign key and returns a validation error.

If parameter chunking ever becomes awkward, the fallback is to pass each child list as one JSON parameter and insert with `INSERT … SELECT … FROM json_each(?)`. It is not the default because it bypasses Drizzle's typed inserts.

**Reading a recipe** is one batch of selects (recipe, ingredients with food and unit, steps, notes, organizers, assets): one query, one consistent snapshot. Selects name their columns, because D1 caps a result at 100 columns.

**As built in T1.1** (`apps/worker/src/db/recipes.ts`):

- The reads before the batch are themselves one batch: the recipe as it stands, the slugs that could collide, and the foods, units and organizers the recipe names. The write batch ends with the six selects that read a recipe, so the saved recipe comes back from the same transaction. A save is therefore two round trips, and a test counts them.
- The read also checks the recipe's references. A food, unit or organizer that does not exist, or an organizer of the wrong kind, is answered with the path of the field before anything is written. The foreign keys still catch a deletion that lands between the read and the write.
- A version that is already stale at the read is answered as a conflict without attempting the write. The trigger remains the guard for two saves that both read before either wrote; a test runs that race.
- An unchanged title keeps its slug, even a numbered one. A changed title takes the lowest free slug, not counting the recipe's own.
- A recipe's categories, tags and tools have no order of their own and come back sorted by name.
- Nutrition is stored as only the values that were filled in, or null.
- `source_url` is canonicalized by `canonicalUrl()` in the shared package, which T1.12 will also use to notice a second import of one page.

### 4.7 Mapping to aiomealie

Checked against the models in aiomealie 2.1.4. "Required" means the model has no default, so a missing or null value fails Home Assistant's parsing.

| aiomealie field | Required | Our source |
| --- | --- | --- |
| `Recipe.id`, `slug`, `name` | yes | `recipes.id`, `slug`, `title` |
| `Recipe.userId`, `groupId` | yes | `recipes.created_by`; `household.id` |
| `Recipe.householdId` | no | `household.id` |
| `Recipe.description` (string) | yes | `recipes.description`, never null |
| `Recipe.recipeCategory`, `tags`, `tools` (lists of id, name, slug) | yes | `organizers` by kind |
| `Recipe.recipeServings`, `recipeYieldQuantity`, `recipeYield` | no | `servings`, `yield_quantity`, `yield_unit` |
| `Recipe.prepTime`, `performTime`, `totalTime` (text) and the three `…Seconds` | no | The three `*_time_seconds` columns; the text forms are formatted from them |
| `Recipe.orgURL` | no | `source_url`. `source_name` has no Mealie field and is not sent |
| `Recipe.dateAdded` | no | Date part of `created_at` |
| `Recipe.image`, `rating`, `lastMade` | no | Cover asset ID; null until Phase 5 |
| `Recipe.nutrition` (schema.org keys, string values) | no | `recipes.nutrition`, same keys |
| `Recipe.notes[]`: `title`, `text` | no | `recipe_notes` |
| `Ingredient.referenceId` | yes | `recipe_ingredients.id` |
| `Ingredient.quantity`, `unit`, `food` | key required, null allowed | `quantity`, joined `units`, joined `foods` |
| `Ingredient.note` (string) | yes | `note`, never null |
| `Ingredient.title` | key required | `section`, emitted on the first line of each section |
| `Ingredient.display` | key required | Shared `formatIngredient()` |
| `Ingredient.originalText` | no | `original_text` |
| `Instruction.id`, `text` | yes | `recipe_steps.id`, `text` |
| `Instruction.ingredientReferences` | yes | `ingredient_refs` |
| `Instruction.title`, `durationSeconds` | no | `section`, `duration_seconds` |
| `Food`: `id`, `name`, `description`, `aliases`, `pluralName`, `labelId`, `label`, `createdAt`, `updatedAt` | first four required | Same-named `foods` columns; `label` from `labels` |
| `Unit`: `name`, `pluralName`, `abbreviation`, `pluralAbbreviation`, `useAbbreviation`, `fraction`, `description`, `aliases`, `standardQuantity`, `standardUnit` | `name` | Same-named `units` columns |
| `Label`: `id`, `name` | yes | `labels` |
| `UserInfo`: `id`, `username`, `email`, `fullName` | yes | `members`; `username` derived from the email. `email` is required and `members.email` may be null from Phase 6, so a passkey-only member needs a stand-in address there |
| `GroupSummary`: `id`, `name`, `slug` | yes | The `household` row, which stands for Mealie's group as well as its household |
| `HouseholdSummary`: `id`, `groupId`, `name`, `slug`, `group` | yes | The `household` row again; `group` is its name |
| `Statistics` counts | yes | `COUNT(*)` queries |

Behaviour the Phase 4 facade needs that Phase 1 already allows: a recipe with only a title is valid (Home Assistant creates recipes by name alone); recipes resolve by ID or slug on the same path; lists take `page` and `perPage`, with `perPage=-1` meaning all; and import handlers are plain functions, so `recipes/create/url` can run one inline and return a slug within aiomealie's 10-second timeout instead of going through review.

Later tables with no Phase 1 footprint: meal plans (integer key, see [Conflicts](#conflicts-with-the-build-plan)), shopping lists and items, per-member ratings and favourites, and API tokens.

## 5. Shared recipe schema

One package, `@recipeflare/schema`, written with Zod 4. The API validates request bodies with it, the editor uses it as its form resolver, and import results are validated with it before anyone sees them. Field definitions are written once and composed into three shapes:

| Shape | Used for | Differs how |
| --- | --- | --- |
| `RecipeInput` | Body of create and update; the editor's form value | Child rows carry IDs; steps reference ingredients by ID; update carries `version` |
| `Recipe` | API responses; the offline cache | `RecipeInput` plus `id`, `slug`, `version`, timestamps, expanded unit, food and organizer objects, and assets |
| `RecipeDraft` | Output of every importer: the Phase 1 JSON-LD mapper now, AI models in Phase 2 | No IDs; units, foods and organizers by name; steps reference ingredients by index; every field optional so a thin source still parses |

Content fields common to all three:

```text
title                  string, 1–200 characters (may be empty in a draft)
description            string, up to 2,000
servings               number or null
yieldQuantity          number or null
yieldUnit              string or null
prepTimeSeconds        integer or null
cookTimeSeconds        integer or null
totalTimeSeconds       integer or null
nutrition              object of schema.org keys to strings, or null
sourceName             string or null ("From")
sourceUrl              URL or null
ingredientSections[]   { title: string | null, items: Ingredient[] }
stepSections[]         { title: string | null, steps: Step[] }
notes[]                { title: string, text: string }
categoryIds, tagIds, toolIds   ID arrays (names in a draft)

Ingredient   originalText | null, quantity | null, unitId | null, foodId | null, note
Step         text, durationSeconds | null, ingredientIds[]
```

Design rules:

- **Sections are nested in the schema and flat in the database.** Nesting makes grouping unambiguous for the editor and for a model. One pair of functions converts between the two forms, with a round-trip test.
- **The draft schema stays exportable.** Zod 4's built-in JSON Schema export turns `RecipeDraft` into the schema handed to Workers AI JSON mode in Phase 2, so the model is asked for the same shape the code validates. `RecipeDraft` therefore uses only plain objects, arrays, strings, numbers and nullables. Cross-field checks live in a separate `checkDraft()` function.
- **Missing content is reported, not guessed.** `checkDraft()` returns issues such as `missing_ingredients`, `missing_steps` and `unmatched_unit`, each with a path. The review screen shows them. This is the build plan's "validate" stage, and it exists in Phase 1 for URL imports.
- **One conversion from draft to input.** `draftToInput(draft, lists)` assigns IDs, matches unit, food and organizer names against the household's lists, and returns the input and the issues. Ingredient lines that arrive as text only go through the rule-based parser on the way.
- **Caps are part of the schema**: 100 ingredient lines, 100 steps, 20 notes, 50 organizers, 4,000 characters per step. They are what make the save's size provable in [§4.6](#46-one-batch-recipe-save).
- **Formatting is shared.** `formatQuantity`, `formatIngredient`, scaling and duration helpers live here, so the viewer, cook mode, the search text and later the Mealie `display` field agree.
- **Fixtures live here too**, under the `@recipeflare/schema/fixtures` import so they stay out of production bundles. Six invented recipes cover sections, free-text lines, a long recipe, a title-only recipe, an imported recipe and photos of a paper card. Three more come from sample cards the owner supplied: their ingredient lines are kept exactly as written and their steps are reworded. They feed the mock screens and the tests.

Drizzle table definitions stay in the Worker and are not generated from Zod, nor the reverse. The API shapes are nested documents and the tables are rows; one repository module maps between them, and a save-then-load test guards the mapping.

### 5.1 Rule-based ingredient parser

`parseIngredientLine(text, lists)` lives in the shared package. It is a pure function with no network or model call, so it runs in the editor as the cook types, offline included, and in the Worker for imported lines.

- **Quantity.** A leading integer, decimal, fraction, mixed number or Unicode fraction ("1 1/2", "1½", "0.5"). For a range it takes the first number.
- **Unit.** The next word or two, matched against the household's units by name, plural, abbreviation and alias. Full stops are ignored ("c.", "lbs."). A one-letter unit matches in its exact case only, because handwritten recipes use "t" for teaspoon and "T" for tablespoon; longer names ignore case. `unitMatcher()` in the shared package implements this and `draftToInput` already uses it.
- **Food.** The remaining text up to a comma or parenthesis, matched against the household's foods by name, plural and alias.
- **Note.** Whatever follows.
- **Result.** The fields it is sure of, and a list of what it could not match. An unmatched food is marked as new in the editor and is created only when the cook confirms at save; nothing is created silently. A line it cannot read at all stays a free-text line.
- **It never alters `originalText`.**

The three sample cards in the feature spec supply lines the parser's test corpus must include: "4 tbsp butter melted" (a note with no comma), "2 lbs. ground chuck", "1 t. soda", "3/4 C B. Sugar - Firmly Packed", "1 - 12 oz Chocolate Chips" and "1 - (15 1/2 oz can) Chef Boy-ar-Dee spaghetti sauce with mushrooms". The last may stay free text; it must not be misread.

**As built in T1.5** (`packages/schema/src/parse-ingredient.ts`). `ingredientParser(lists)` indexes the household's units and foods once and returns the function that reads a line; `parseIngredientLine` is the one-line form. A reading is `{ quantity, unitId, foodId, newFood, note }`, or `null` for a line left as written.

- **Amounts** also include "1-1/2", ".5", the words one to twelve, and "a" or "an" in front of a unit ("a pinch of salt"). "About" and a leading bullet are skipped.
- **Packages.** "1 (15-ounce) can black beans", "1 15-ounce can", "2 x 400 g cans" and "1 - (15 1/2 oz can)" read as a number of cans with the size as a note. "1 - 12 oz chocolate chips", with no container, reads as 12 ounces. A dash between two numbers is a range only when the second is larger and at most three times the first.
- **Food.** The words up to a comma, a semicolon or a spaced dash. They are tried as they stand first, so "cooked rice" and "crushed tomatoes" are foods when the household says so; then without the words that say how the food is prepared or how big it is ("minced onions", "butter melted", "2 large eggs"); then without "fresh" and "ripe". Those words go to the note. A plural is tried in the singular.
- **A food inside another food's name is never taken.** "Peanut butter" is not butter and "chicken broth" is not chicken: the whole name is offered as a new food. The one exception is a brand of at least two capitalised words in front of a food written small ("Chef Boy-ar-Dee spaghetti sauce"); one capitalised word is as likely "Greek yogurt", so it is not treated as a brand.
- **After the food.** "To taste", "for serving", "plus more for dusting", "or margarine" and anything in brackets go to the note.
- **A line with no amount and no unit** is read only when it is exactly one of the household's foods ("Salt"). Otherwise it stays as written, so a heading or a sentence never becomes a food.
- **Units.** A symbol of one or two letters ("g", "oz", "T") counts as a unit only after an amount.
- **`draftToInput`** runs a line that arrives as text only through the parser and uses the reading when it names a food the household has. A line with a food the household lacks stays as written in the input, so the input is always safe to save, and the editor offers that food as new by reading the line again.
- **The corpus** is 200 lines written for the tests, in seventeen groups, with the six card lines among them. All six read as the feature spec's walk-through expects, including the last, which the plan allowed to stay free text.
- The mock editor now uses this parser. `mockParser.ts` is deleted.

Phase 2 adds the AI fallback for lines the rules cannot read, behind the same function signature. The Mealie-compatible `parser/ingredient` endpoint in Phase 4 calls the same code.

### 5.2 Other exports

The package also exports the smaller schemas: organizer, food, unit, label, member, asset, import job, and the error body `{ error: { code, message, issues? } }`.

### 5.3 The API as built

Everything is under `/api/v1` and, except health, needs a member. Request bodies and query strings are checked by the shared schema before a handler runs; a failure is a 400 `validation_failed` with one issue per field. Each task adds its rows here.

| Route | Does | Answers |
| --- | --- | --- |
| `GET /health` | Open to anyone | `{ status }` |
| `GET /me` | Who is signed in | `{ member }` |
| `GET /auth/refresh?return=/path` | Where "Sign in again" leads. Behind sign-in like every route, which is what brings the Access sign-in page up; once through, it redirects to `return`. Only a path within the app is accepted; anything else becomes `/` | 302 |
| `GET /recipes` | One page of the list. `q` is the search text. `category` (one slug), `tags` and `tools` (slugs, comma-separated) and `foods` (IDs, comma-separated) are filters, and every one given must match. `sort` is `match`, `changed`, `newest` or `title`; left out it is best match while searching and last changed otherwise. `page` (from 1), `perPage` (1 to 100, default 30) | `{ items, page, perPage, total, libraryTotal }`; each item is a `RecipeSummary` with its cover, categories and tags, `total` counts everything that matched, and `libraryTotal` counts every recipe the household has, so the list can tell "nothing matches" from "no recipes yet" |
| `POST /recipes` | Create from a `RecipeCreate` body | 201 with the `Recipe` |
| `GET /recipes/{idOrSlug}` | One recipe, by ID first and then by slug | The `Recipe`, or 404 |
| `PUT /recipes/{id}` | Save over the copy the editor loaded; the `RecipeUpdate` body carries that copy's `version` | The `Recipe`; 409 `version_conflict` with `current`, the recipe as it is now; 404 |
| `DELETE /recipes/{id}` | Delete | 204, or 404 |
| `GET /organizers`, `/foods`, `/units`, `/labels` | The whole list, each entry with how much it is used: `recipeCount`, or `foodCount` for a label | `{ items }` |
| `POST /organizers` | Create a category, tag or tool from `{ kind, name }`. A category is given the divider stock the fewest categories have | 201 with the entry; 409 `duplicate` with `existingId` |
| `PUT /organizers/{id}` | Rename, from `{ name }`. The slug follows the name | The entry; 409 `duplicate`; 404 |
| `DELETE /organizers/{id}` | Delete, and take it off every recipe that had it | 204, or 404 |
| `POST /foods`, `PUT /foods/{id}` | Create or change, from a `FoodInput` | The entry; 409 `duplicate`; 400 for a label that does not exist |
| `DELETE /foods/{id}`, `DELETE /units/{id}` | Delete, unless a recipe uses it | 204; 409 `in_use` with `recipeCount`; 404 |
| `POST /units`, `PUT /units/{id}` | Create or change, from a `UnitInput` | The entry; 409 `duplicate` |
| `POST /labels`, `PUT /labels/{id}`, `DELETE /labels/{id}` | Create, change (name, colour, order) or delete. Deleting takes the label off its foods | The entry or 204; 409 `duplicate` |

- A body larger than 2 MB is a 413 `too_large`; a recipe at every size cap is under 1 MB.
- A body that is not the JSON it claims to be is a 400 `bad_request`.
- `POST /recipes` refuses a non-null `importJobId` until T1.12, which is where confirming an import is built.
- A name is a duplicate when it matches another ignoring capitals and spacing: by slug within a kind for organizers, by name key for foods, units and labels. The 409 names the entry that has it, so a picker can select that one, as the feature spec asks.
- Renaming or deleting an organizer, or renaming a food, rewrites the search text of the recipes that use it in the same batch as the change, through `buildSearchText()`. The names are read just before, so a recipe saved in that instant can keep stale search text until it is next saved; the plan accepts the same gap for the save.
- "Asks first" for a delete is the screen's job (T1.9). The list tells it how many recipes or foods are affected.
- **The web app's side, as built in T1.6** (`apps/web/src/api`). `api()` in `client.ts` makes every request and checks the answer against the shared schema. It does not import the Worker's route types: those need the Workers runtime's global types, which clash with the browser's in one TypeScript program, and the shared schemas already give the web app every shape. Requests are made with `redirect: "manual"`: when the session runs out, Access answers with a redirect to its sign-in page on another origin, which followed looks like a dropped connection and unfollowed can be recognised. That, or a 401, raises `SignedOutError`; a request that never arrives raises `UnreachableError`; a refusal raises `ApiError` with the code, the issues and the whole body. `queries.ts` holds the TanStack Query hooks. A refusal or a signed-out answer is not retried; an unreachable server is tried once more. Keeping the cache on the device is T1.13.
- The Worker's routes are also typed for a client: `AppType` is exported from `@recipeflare/worker`, and a test drives the API through `hono/client` so a route that drifts from its client stops compiling.

## 6. Auth

### 6.1 One middleware

Every route under `/api/` except health passes through one middleware that ends with a household member on the request context. Route handlers read the member from context and never look at headers, cookies or tokens.

The middleware runs an ordered list of identity providers. Each inspects the request and returns an identity, returns nothing, or rejects. The first identity wins. No identity means 401.

| Provider | Phase | Reads | Yields |
| --- | --- | --- | --- |
| Access JWT | 0 | `Cf-Access-Jwt-Assertion` | Email |
| Dev identity | 0, local only | A local variable | Email |
| API token | 3–4 | `Authorization: Bearer` | Member ID from a hashed token row |
| Access service token | 3 | An Access JWT with `common_name` and no email | Member mapped from the client ID |
| Passkey session | 6 | Session cookie | Member ID |

A list in configuration (`AUTH_PROVIDERS`) says which providers are on: `access` for our install now, `passkey,token` for a Deploy-button install later. Unset means `access`. The dev provider is not in the list; it switches itself on ([§6.3](#63-local-development-without-access)). Providers receive the whole request, so Phase 4 can accept only API tokens on the Home Assistant hostname.

A provider that recognises a request but finds it wrong refuses it, and the request does not fall through to the next provider. A bad Access token is a 401 even where the dev provider is on.

Identity then becomes a member:

- An email is looked up in `members`.
- If the table is empty, the first person through becomes the owner, and the `household` row is created.
- An unknown email that Access has let through is added as a member. Access's policy is the allowlist, so a second list in the app would only add a place to forget someone. Setting `AUTH_AUTO_ENROLL` to `false` turns this off; the first person still becomes the owner.
- A disabled member gets 403.

As built in T0.12:

- The usual request costs one read, the member by email. A first visit adds one batch of two inserts and a second read. Each insert decides for itself whether anyone is here yet, so two first visits at the same moment still give one household and one owner.
- A new member's display name is made from the email address ("ada.lovelace" becomes "Ada Lovelace"). The household is named "Household". Both can be renamed once the settings screens exist.
- Everything under `/api/v1` except health is behind the middleware, so an unknown path answers 401 to someone who is not signed in and 404 to a member.
- `GET /api/v1/me` returns `{ member }`.
- Errors: 401 `unauthenticated`; 403 `not_a_member`, `member_disabled` or `cross_site_request`; 500 `auth_not_configured` when a setting is missing; 503 `auth_unavailable` when the Access keys cannot be fetched, so that an outage is not mistaken for an expired session.

### 6.2 Cloudflare Access

- **Validation.** `jose` verifies the token against the keys at `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, checking the signature (RS256 only), issuer, audience (the application's AUD tag) and expiry; a token with no expiry is refused. The key set is held by the provider for the life of the Worker instance; Access rotates keys every six weeks and keeps the old key valid for seven days, which `jose`'s remote key set handles by fetching again when a token names a key it has not seen. A missing or invalid token is rejected even when Access is in front. A valid token with no email address, which is what a service token is, gets 403 until Phase 3 gives service tokens their own provider.
- **Application type.** A hostname-based self-hosted application on a custom domain, not the Worker-level toggle, because of the WebSocket limitation. Staging gets its own application and AUD tag.
- **No side doors.** `workers_dev` and `preview_urls` are off for staging and production, so the only hostnames are the protected ones.
- **Session length.** Set to a month so family phones are rarely sent back to the login page.

Three things an installed PWA needs behind Access:

- The manifest link needs `crossorigin="use-credentials"`, or the browser fetches it without the Access cookie and installation fails.
- The service worker must cache only successful same-origin responses, never the redirect to the login page.
- An expired session shows up as API calls that fail on a redirect. The client detects this with a manual-redirect probe and offers "sign in again", which navigates to `/api/v1/auth/refresh?return=…`. The service worker does not handle navigations under `/api/`, so that request reaches Cloudflare, Access shows its login, and the Worker then redirects back. Cook mode keeps working from the cache meanwhile.

Mutating requests also require a same-origin `Sec-Fetch-Site` or a JSON or binary content type, so the Access cookie cannot be ridden from another site. This is its own small middleware, in front of the member lookup, and it has covered every route since T0.12.

### 6.3 Local development without Access

`AUTH_MODE=dev` and `DEV_MEMBER_EMAIL` live in `.dev.vars`, which is git-ignored and never deployed. The dev provider is on only when that variable is set and the request's hostname is `localhost` or a loopback address, so a misconfigured deploy cannot enable it. The local app opened from a phone by the computer's network address is therefore not signed in; phone review happens on staging. A committed `.dev.vars.example` documents the variables; the Deploy button later reads the same file to prompt for secrets.

Tests cover both paths: the dev provider for ordinary API tests, and the Access provider against a key pair generated in the test with the key-set fetch stubbed.

## 7. Import jobs

One table (`import_jobs`, [§4.3](#43-tables)) and one mechanism (Queues) for every import kind. Phase 1 implements `url`; `photo`, `text` and `video` add handlers, not infrastructure.

### 7.1 Flow

1. `POST /api/v1/imports` validates the input, inserts a job as `queued`, sends `{ jobId }` to the import queue, and answers 202 with the job.
2. The queue consumer, in the same Worker, claims the job (`running`, attempts plus one), looks up the handler for its kind, and runs it.
3. The handler returns a `RecipeDraft`. The runner validates it, runs `checkDraft()`, stores the draft and its issues in `result`, and sets `needs_review`.
4. The web app polls the job while it is active, then opens the editor in review mode, prefilled from the draft.
5. Saving goes through the normal recipe save with the job ID attached. The same batch creates the recipe, attaches the job's assets and marks the job `completed`.

### 7.2 Rules

- **The message is a pointer.** Messages carry the job ID and, later, a stage name. The row is the source of truth; nothing large or sensitive goes through the queue's 128 KB limit.
- **Handlers are idempotent.** Queues deliver at least once. A redelivered message for a job that is already past `running` is acknowledged and ignored; one for a `running` job means the previous attempt died, and the handler runs again and overwrites the result.
- **Errors are classified.** A handler throws either a retryable error (network failure, upstream 5xx) or a permanent one (no recipe data on the page, not HTML, blocked). Retryable errors call `retry()` with a growing delay; permanent ones set `failed` with a code the UI can explain, and acknowledge. The list's import row (drawn in T0.7) explains three codes in plain words: `retries_exhausted` (the site could not be reached), `blocked` and `no_recipe`. Any other code shows the job's own message.
- **Nothing is lost silently.** The consumer allows 3 retries. Messages past that go to a dead-letter queue whose consumer, also in this Worker, marks the job `failed` with `retries_exhausted`.
- **Each message is acknowledged or retried on its own**, so one bad job cannot force a batch to be redelivered. `max_batch_timeout` is 0 so a single import starts at once instead of waiting to fill a batch.
- **Insert and send are not atomic.** If the send fails the job is marked `failed` and the API says so. The job list has a retry action that re-sends.
- **Handlers are plain functions** of the job and the environment, with `fetch` passed in. Tests call them directly, and the Phase 4 Home Assistant import can run one inline.
- **Stages.** A multi-step import records its `stage` and sends itself the next message. This is what replaces Workflows.

### 7.3 The URL handler

- Fetch the page with a size cap and a timeout; accept only `http` and `https` and reject IP-literal hosts.
- Collect every `application/ld+json` block with `HTMLRewriter`, and find a `Recipe` node, including inside `@graph`, arrays and multi-typed nodes.
- Map to a draft: name, the author or site name as the source name, description, yield, ISO 8601 durations to seconds, ingredient strings to lines with `originalText` (the rule-based parser fills the rest when the draft becomes input), instructions (strings, `HowToStep`, `HowToSection`) to step sections, nutrition, keywords and categories as suggested organizers, and the first usable image.
- Download the image into R2 as an asset owned by the job.
- Warn on review when a recipe with the same source URL exists.
- If there is no structured data, fail with a message that says so. The fallbacks (AI on the page text, paste the page, a browser-rendered fetch) are Phase 2 and later, as the build plan has them.

### 7.4 What later phases add

| Phase | Addition | Uses |
| --- | --- | --- |
| 2 | `photo` and `text` handlers; AI stages | Same table, queue, review screen and `RecipeDraft` |
| 3 | `video` handler and the fetch agent | A second queue with an HTTP pull consumer for the agent, since a queue has one consumer. The agent reports back through the API, and the next stage is queued on the import queue |
| 5 | Bulk URL import | Many jobs of kind `url`, grouped by an added batch column |

## 8. Testing, CI, migrations and deploys

### 8.1 Tests

Vitest with Cloudflare's Workers integration, which is now the `@cloudflare/vitest-plugin` package; the `vitest-pool-workers` name is deprecated. Three Vitest projects:

| Project | Runs in | Covers |
| --- | --- | --- |
| `schema` | Node | Schemas against fixtures, section round trip, slugs, formatting and scaling, the JSON Schema export of `RecipeDraft` as a snapshot |
| `worker` | workerd, through the plugin, reading the root Wrangler file | Repositories against local D1, API routes, auth, queue consumer, import handlers |
| `web` | A browser-like environment | The editor's field logic, the API client, cook-mode state |

Worker test setup, per the current docs:

- The config uses `cloudflareTest()` with the Wrangler config path. `readD1Migrations()` loads the migrations in Node and passes them in as a test-only binding; a setup file applies them with `applyD1Migrations()`. The tests therefore run against the same migration files that production gets.
- Tests import `env` and `exports` from `cloudflare:workers` and call `exports.default.fetch()`; queue tests use `createMessageBatch()` and `getQueueResult()` from `cloudflare:test`.
- Storage is isolated per test file, not per test. Tests in one file either use distinct IDs or reset and re-apply migrations in `beforeEach`.
- Coverage uses Istanbul; the integration does not support V8 coverage.
- The plugin injects `nodejs_compat` when the config lacks it, which can hide a deploy failure. The Wrangler file declares the flag so tests and production match.
- The Images binding runs as a reduced local version in tests and in `wrangler dev`.

Tests that must exist before Phase 1 ends:

- Save then load returns an equal recipe, at the size caps as well as at the minimum.
- A stale `version` returns 409 and changes nothing.
- The ingredient parser reads a corpus of at least 150 lines written for the tests, covering fractions, ranges, abbreviations, plurals, parentheses and lines it must leave alone.
- A statement failing mid-batch leaves no partial recipe.
- Search finds a recipe by title, ingredient, food name and tag; stops finding it after delete; reflects a renamed tag.
- A missing, expired, wrong-audience or wrong-issuer Access token is rejected; the dev provider is refused off localhost.
- The queue consumer handles redelivery, retryable and permanent errors, and the dead-letter path.
- The URL handler maps a set of synthetic JSON-LD fixtures (graph form, sections, arrays, missing fields). Real pages are used for manual gate testing and are not committed.
- One Playwright run of the main path: create a recipe, find it, open cook mode, go offline, reload.

### 8.2 CI

GitHub Actions, on every pull request and on pushes to `main`:

1. Install with a frozen lockfile.
2. Lint and format check.
3. Typecheck, including that the generated binding types are current.
4. Check that the Drizzle schema and the migrations folder agree.
5. Run the three test projects.
6. Build the web app.

A red check blocks merge. The Playwright run joins once T1.15 lands.

### 8.3 D1 migrations

- **Source.** Drizzle 1.0's `drizzle-kit generate` writes each migration into its own folder under `apps/worker/migrations`. Virtual tables, triggers and seed data are hand-written migrations created with `drizzle-kit generate --custom`, in the same layout.
- **Applied by Wrangler.** The D1 binding sets `migrations_dir` to `apps/worker/migrations` and `migrations_pattern` to `apps/worker/migrations/*/migration.sql`, the pair of settings Wrangler provides for this layout. `wrangler d1 migrations apply DB` runs with `--local` or `--remote`, by binding name as the build plan specifies, because other installs will have different database names. The binding is called `DB` and is never renamed.
- **Forward only.** No down migrations. An applied migration is never edited; a mistake is fixed by a new one.
- **Never `drizzle-kit push`.** It bypasses the migration history and would see the FTS shadow tables as drift.
- **Additive by default.** The deploy applies migrations and then uploads code, so for a moment the old code runs on the new schema. A migration must therefore work with the previous release. Removing or renaming a column takes two releases.
- **Avoid rebuilding parent tables.** If one is unavoidable, follow D1's deferred-foreign-key procedure and test on a copy of production data, checking child row counts.
- **Recovery.** Time Travel keeps 30 days of point-in-time restore, and restores to a time as well as to a bookmark, so a bad migration is undone by restoring to the minute before the deploy began. The deploy does not print a bookmark: its log is public, and it hides anything shaped like a resource ID in what Wrangler prints while migrating. `wrangler d1 export` cannot be used once the FTS table exists.
- **Checked in CI.** `pnpm db:check` fails when the schema has a change with no migration, or when the migration folders are inconsistent. It writes nothing.
- **Generated files are left alone.** Biome does not format the migrations folder, and a generated `migration.sql` or `snapshot.json` is never edited by hand.

The folder layout is fixed for good once the first migration is applied, because Wrangler records each migration by its path. Drizzle 1.0 is still a release candidate: `drizzle-orm` and `drizzle-kit` are pinned to exactly `1.0.0-rc.6`, the newest on 23 Nov 2026. T0.11 confirmed that Wrangler 4.166 and the test plugin's `readD1Migrations()` both read the layout, and that migrations whose trigger bodies run from `BEGIN` to `END` apply whole through both.

One thing the generated SQL does not do: SQLite lets a text primary key be null unless the column also says `NOT NULL`, and Drizzle does not write that for a primary key. Every ID is made by the Worker and typed as required, so a null ID would be a bug in our own code, and the tables do not guard against it.

### 8.4 Environments and deploys

| | Local | Staging | Production |
| --- | --- | --- | --- |
| Worker | `wrangler dev` plus Vite | `recipeflare-staging` (`env.staging`) | `recipeflare` (top-level config) |
| D1, R2, queues | Simulated on disk | Own database, bucket, import queue and dead-letter queue | Own set |
| Hostname | `localhost` | Staging hostname behind its own Access application | Production hostname behind Access |
| Auth | Dev provider | Access | Access |
| Deployed by | — | GitHub Actions on every merge to `main`, after CI passes | GitHub Actions, started by hand, with an approval on the `production` environment |

Both deploy jobs run the same root script, `scripts/deploy.mjs`: build, apply migrations to the remote database, then `wrangler deploy`. CI also runs it with `--dry-run` for both configurations on every pull request, so a broken Wrangler file fails before a deploy. That script is also what Workers Builds will run for Deploy-button installs in Phase 6, so it must not depend on anything GitHub-specific.

**Nothing that identifies the household is committed.** The repository is public, so:

- The Wrangler file names resources (`recipeflare`, `recipeflare-staging`) and carries no resource IDs; Wrangler provisions and links by name.
- Production and staging hostnames are GitHub environment secrets (`APP_HOSTNAME`), passed with `wrangler deploy --domain`. They are secrets, not variables, because a public repository's CI logs are public and GitHub masks only secrets.
- The Access team domain and each application's audience tag are GitHub environment secrets too (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`). The deploy script hands them to Wrangler as Worker secrets. `AUTH_AUTO_ENROLL` travels the same way from an optional GitHub environment variable; it identifies nobody.
- The Cloudflare account ID and API token are GitHub repository secrets.
- The Wrangler file names each resource and gives no ID; Wrangler creates a named resource on the first deploy and finds it by name afterwards.
- [`docs/operations.md`](operations.md) describes the steps and names the settings, without values.

Our install deploys from GitHub Actions rather than Workers Builds because the test run gates the deploy and production needs an approval step. The Workers Builds path is exercised in Phase 6 by the fresh-account test the build plan already requires.

Mock screens and all Phase 0 review happen on staging. Production stays empty until Phase 1 work is ready for real recipes, and the gate's ten recipes are entered there.

## 9. Task list

Each task is one pull request. Hours are my estimates and sum to about 29 for Phase 0 and 64 for Phase 1, inside the roadmap's ranges. Phase 1 includes the 5 hours moved from Phase 2 with the rule-based parser. Tasks marked "needs you" include steps in the Cloudflare dashboard or a decision.

### Phase 0 — gate: mockups approved and schema reviewed

| ID | Task | Acceptance checks | Hours |
| --- | --- | --- | --- |
| T0.1 | **Scaffold.** pnpm workspace, TypeScript config, lint and format, root Wrangler file, Worker with a health route, empty React app, `pnpm dev` | `pnpm dev` serves the app and `/api/v1/health` on one origin; lint, typecheck and build pass locally; `CLAUDE.md` commands match reality | 2 |
| T0.2 | **CI.** The workflow in [§8.2](#82-ci), with a first test in each Vitest project | A pull request shows all checks; a deliberately failing test blocks merge | 1.5 |
| T0.3 | **Feature spec.** `docs/feature-spec.md` following [§2.1](#21-feature-spec-outline) (needs you) | Every section ends with its decisions; the offline, delete and ingredient-entry questions are answered; three real cards are described field by field | 3 |
| T0.4 | **Shared schema.** The package in [§5](#5-shared-recipe-schema) with fixtures and tests | Fixtures, including the three real cards, validate; section round trip passes; `RecipeDraft` exports to JSON Schema without loss; caps are enforced | 3 |
| T0.5 | **Deploy pipeline and Access.** Staging and production Workers, databases, buckets and queues; deploy scripts and workflows; Access applications on both hostnames (needs you) | A merge to `main` deploys staging; staging opens on a phone only after Access login; a request without a token is refused; production deploys by hand with approval; no hostname, team domain, audience tag or account ID is in the repository; an operations note records the manual steps | 3 |
| T0.6 | **App shell and design tokens.** Navigation, page frame, tokens, placeholder icon, the `/mock` harness | Shell renders at 390 px and tablet width in light and dark; fixtures load in a mock route; contrast and touch-target minimums from the spec hold | 2 |
| T0.7 | **Mockup: recipe list and search** | Everything in the screen's row of [§2.2](#22-the-four-core-screens) is visible on staging | 2 |
| T0.8 | **Mockup: recipe view** | As above, including the long and the minimal recipe | 2 |
| T0.9 | **Mockup: recipe editor and review mode** | As above; reordering works by touch on a real phone | 3 |
| T0.10 | **Mockup: cook mode** | As above, in phone portrait and tablet landscape | 2 |
| T0.11 | **Database schema.** Drizzle schema, generated migration, hand-written FTS, trigger and unit-seed migrations, test setup that applies them | Migrations apply locally, in tests and on staging, including the trigger bodies; tests show FTS staying in sync, the version guard aborting a batch, and cascades; the schema-drift check passes | 2.5 |
| T0.12 | **Auth.** The middleware, Access and dev providers, first-member bootstrap, `/api/v1/me` | The auth tests in [§8.1](#81-tests) pass; on staging `/api/v1/me` returns the signed-in member; the dev provider is refused off localhost | 2 |
| T0.13 | **Gate review.** Phone review of the four screens; schema walk-through against the cards and [§4.7](#47-mapping-to-aiomealie); fold changes back into the spec and this plan (needs you) | Both gate conditions in [§2.3](#23-phase-0-gate) are recorded in the pull request | 1 |

T0.5 comes before the mockups so that they can be reviewed on phones. T0.11 and T0.12 can run in parallel with the mockups.

### Phase 1 — gate: 10 family recipes typed in and edited without workarounds

| ID | Task | Acceptance checks | Hours |
| --- | --- | --- | --- |
| T1.1 | **Recipe repository.** Save, load and delete as in [§4.6](#46-one-batch-recipe-save), slug handling, search-text building | Round-trip, size-cap, version-conflict and rollback tests pass; a save issues at most two reads and one batch | 4 |
| T1.2 | **Recipes API.** Create, read by ID or slug, update, delete, list with paging and sort; typed client export | Requests are validated by the shared schema; errors use the shared error body; conflict returns 409 with the current recipe | 3 |
| T1.3 | **Organizers, foods, units and labels API** | Create, rename, list and delete for each; duplicate names are rejected; deleting a food or unit in use is refused with a usage count; deleting a category, tag, tool or label asks first and removes it from whatever used it; a rename updates search text | 3.5 |
| T1.4 | **Search and filters** | The search tests in [§8.1](#81-tests) pass; hostile input (quotes, operators, emoji) never errors; filters combine with search | 3 |
| T1.5 | **Ingredient line parser.** The rule-based parser in [§5.1](#51-rule-based-ingredient-parser), in the shared package, and its use in `draftToInput` | The parser corpus test passes; a line it cannot read comes back unchanged as free text; it never creates a food or unit; it runs in the browser with no network | 5 |
| T1.6 | **Web data layer and recipe list.** API client, query cache, session-expiry handling, error states; the list screen on real data | The list matches its mockup with real data; search, filters and sort are in the URL; an expired session shows "sign in again" and recovers | 4 |
| T1.7 | **Recipe view** | Matches its mockup; scaling changes parsed quantities and leaves free-text lines alone; delete asks first | 3 |
| T1.8 | **Recipe editor** | A recipe with sections, notes and organizers can be created and edited on a phone; a typed ingredient line is parsed as it is entered and each parsed field can be corrected; new foods are confirmed once at save; units and organizers can be created from their pickers; validation errors appear on their fields; a conflict is shown, not overwritten; leaving with unsaved changes warns | 8 |
| T1.9 | **Manage screens** for organizers, foods, units and labels | Each can be listed, renamed and deleted from the app; labels can be ordered | 3 |
| T1.10 | **Images and attachments.** Upload to R2, variants, serving, cover choice, the original-card role | A phone photo uploads and shows as thumbnail and cover; the original card photo opens full size; a failed variant still serves the original; uploads over the size limit are refused clearly | 5 |
| T1.11 | **Import job infrastructure.** Table access, producer, consumer, dead-letter handling, job API, progress UI | The queue tests in [§8.1](#81-tests) pass; a job's progress shows in the app without a reload; a failed job explains itself and can be retried | 4 |
| T1.12 | **URL import** | The fixture set maps correctly; an import from three real recipe sites lands in review with its image and with parsed ingredient lines; a page with no structured data fails with a clear message; a duplicate source URL warns; confirming creates the recipe and completes the job | 5 |
| T1.13 | **PWA and offline** | Installs on Android and iOS behind Access; the shell loads offline; recipes and viewed images are available offline as the spec defines; the login redirect is never cached | 4 |
| T1.14 | **Cook mode** | Matches its mockup; the screen stays on; checkboxes and scale survive a reload and a locked phone; works in airplane mode | 4 |
| T1.15 | **End-to-end run and polish.** Playwright main path, accessibility pass, load-time check on a mid-range phone | The Playwright run is in CI; no blocking accessibility findings on the four screens; issues found are fixed or filed | 3 |
| T1.16 | **Gate run** (needs you) | Ten family recipes entered on production by the people who will use it, on phones and a desktop. Every workaround is written down as an issue. The gate passes when ten recipes in a row go in and are edited with none | 2.5 plus fixes |

Suggested mix for the gate's ten: at least one with ingredient sections, one with instruction sections, one with a card photo, one imported from a URL and then edited, and one cooked from cook mode with the network off.

## 10. Open questions

Questions answered since the first version are recorded in [Decisions since the build plan](#decisions-since-the-build-plan). What remains, each with the default this plan assumes so that work can start:

1. **Public library.** The owner wants the option to make the library public. Undecided: which phase; whether public means read-only; the whole library or chosen recipes; and how it works when Cloudflare Access is in front of the hostname. The build plan has public share links in Phase 5, which may be the same feature or a narrower one. Default until decided: nothing is public, and the shell is designed so that a signed-out visitor could be shown a read-only version later.
2. **Members.** Access admits the household's two adults. Should anyone Access admits become a member automatically on first sign-in? Built in T0.12 as the default: yes, with the first sign-in as owner. `AUTH_AUTO_ENROLL=false` turns it off ([§6.1](#61-one-middleware)). Stood at the Phase 0 gate.
3. **Drafts on the job, not in `recipes`.** See [Conflicts](#conflicts-with-the-build-plan). Stood at the Phase 0 gate: an imported draft does not appear in the recipe list before review.
4. **Units.** A starting list of 25 US and metric units, with quantities shown as fractions by default. Stood at the Phase 0 gate.
5. **What "works offline" covers.** Default: all recipe data syncs to the device, images once viewed. Settled in the spec (T0.3).
6. **Quantity ranges** ("2 to 3 cups"). Mealie has a single quantity. The first number goes in `quantity` and the original text keeps the range. A second column can be added later without a rebuild. Stood at the Phase 0 gate.
7. **Images binding cost.** I did not verify its pricing or included transformations. Two variants per upload should be small at household scale. If it is not, the fallback is resizing in the browser before upload.
8. **NoteFlare.** The build plan says Access works "as NoteFlare does". If NoteFlare has auth or UI code worth sharing, or uses a different frontend framework that you would rather match, that could change [§1](#1-frontend-framework) and T0.12.
9. **aiomealie pin for Phase 4.** Which Home Assistant version runs at home decides the version to pin. Nothing to do until Phase 4.
10. **Deploy button placeholders.** The docs ask for default resource names and IDs in the Wrangler file. What it accepts when IDs are omitted needs the Phase 6 fresh-account test.
11. **`cf` and `cloudflare.config.ts`.** Cloudflare has a new CLI and a typed config file at release-candidate stage. This plan stays on Wrangler and `wrangler.jsonc`, which the Deploy button and the test plugin both read today. Revisit before Phase 6.
