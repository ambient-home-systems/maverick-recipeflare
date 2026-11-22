# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

Maverick Recipeflare (Recipeflare for short) is a household recipe app on Cloudflare: one TypeScript Worker serving a React PWA and a JSON API, with D1, R2, Queues and, in later phases, Workers AI and Durable Objects. One household per install. Licensed AGPL-3.0-only.

**Status: Phase 0, scaffold and CI (T0.1, T0.2).** The workspace, a Worker with a health route, an empty React app, a first test in each Vitest project and the CI workflow exist. There are no features, no database and no auth yet. When a pull request changes a command or path below, it updates this file in the same pull request.

## Read first

- `docs/build-plan.md` is the design doc: scope, architecture, roadmap, phase gates and the nine decisions. **Its decisions are made. Do not reopen them.** If something in it conflicts with a fact you can verify, stop and say so; do not work around it quietly.
- `docs/implementation-plan.md` covers Phases 0 and 1: framework, repo layout, data model, shared schema, auth, import jobs, testing and deploys, and the task list (T0.1–T0.13, T1.1–T1.16). Its "Decisions since the build plan" section records later decisions by the owner; where one amends the build plan, it wins.
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
apps/web/             Vite React PWA; builds to apps/web/dist, served as static assets
packages/schema/      @recipeflare/schema: Zod schemas, types, formatting, fixtures
scripts/              Small Node scripts used by the root package scripts
services/fetch-agent/ Placeholder until Phase 3 (yt-dlp and ffmpeg Docker image)
docs/                 Build plan, implementation plan, feature spec
```

## Commands

Run from the repository root. Needs Node 22.12 or later and pnpm 10 (`corepack enable` picks the pinned version).

| Command | Does |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Worker (`wrangler dev`, port 8787) and web app (Vite, port 5173) together. Open `http://localhost:5173`; Vite proxies `/api` to the Worker |
| `pnpm build` | Build the web app into `apps/web/dist` |
| `pnpm lint` | Biome lint and format check. `pnpm format` applies fixes. Markdown is not formatted |
| `pnpm test` | All Vitest projects once: `schema` (Node), `worker` (Workers runtime), `web` (happy-dom). `pnpm test:watch` re-runs on change |
| `pnpm test --project worker` | One project. A file path or `-t "name"` narrows it further |
| `pnpm typecheck` | Regenerate the Worker's types, then run TypeScript in every package |
| `pnpm types` | Regenerate `apps/worker/worker-configuration.d.ts` from `wrangler.jsonc`. The file is git-ignored; run this after changing bindings |

To see the built app served by the Worker alone, as in production: `pnpm build`, then `pnpm dev:worker`, then open `http://localhost:8787`.

Not here yet:

| Command | Arrives with |
| --- | --- |
| `pnpm run deploy:staging`, `pnpm run deploy` (use `pnpm run`; bare `pnpm deploy` is a different pnpm command) | T0.5 |
| `pnpm db:generate`, `pnpm db:migrate:local` | T0.11 |
| Local sign-in through `.dev.vars` (`AUTH_MODE=dev`, `DEV_MEMBER_EMAIL`) | T0.12 |

## Rules that are easy to break

### Shared schema

- Every recipe shape comes from `@recipeflare/schema`. The API validates with it, the editor uses it as its form resolver, and import output is validated with it. Do not define a second recipe type anywhere.
- `RecipeDraft` must stay exportable to JSON Schema: plain objects, arrays, strings, numbers and nullables only. Cross-field checks go in `checkDraft()`.
- An ingredient line keeps its `originalText`. Parsing fills the structured fields beside it and never overwrites it.
- The ingredient parser in the shared package is rules only in Phase 1 and must run in the browser with no network. It never creates foods or units.

### Database (D1)

- A recipe save is at most two reads and one `db.batch()`. Do not add statements outside the batch that the save depends on.
- At most 100 bound parameters per statement. Chunk multi-row inserts with the shared helper. Pass `IN` lists as one JSON parameter expanded with `json_each`.
- Never build SQL by concatenating values; bind them. Never pass user text to FTS `MATCH` without the query builder.
- `LIKE` patterns are capped at 50 bytes. Use the FTS index or a range scan.
- A recipe's children (ingredients, steps, notes, organizer links) are replaced on every save with their IDs preserved. No table may have a foreign key to those child rows.
- IDs are UUIDv7 text generated in the Worker. The only planned exception is the Phase 4 meal-plan table.
- Enumerations that will grow are validated in the schema, not with `CHECK`.

### Migrations

- Forward only. Never edit a migration that has been applied; add a new one.
- Generate with `pnpm db:generate` (Drizzle 1.0, one folder per migration). Virtual tables, triggers and seed data are hand-written migrations in the same layout.
- Never rename or move a migration folder; Wrangler records migrations by path.
- Never run `drizzle-kit push`.
- A migration must work with the previously deployed code, because it is applied before the new code goes live. Dropping or renaming a column takes two releases.
- Do not rebuild a parent table without the procedure in the plan's migration section.
- The D1 binding is `DB`. Do not rename it.

### Auth

- Route handlers read the member from the request context. They never read identity from headers, cookies or tokens; that is the middleware's job.
- A new way to sign in is a new identity provider in `apps/worker/src/auth/`, not a branch in a route.
- The dev provider must stay refused off localhost.
- Our API lives under `/api/v1`. Bare `/api/...` paths are reserved for the Mealie-compatible subset in Phase 4.

### Import jobs

- Every import kind uses the `import_jobs` table and the import queue. Do not add Workflows or a second job mechanism.
- Queue messages carry a job ID and nothing else of substance. Handlers are idempotent and take `fetch` as a parameter.
- Nothing an importer produces is saved as a recipe until a person confirms it on the review screen.

### Licensing

- Do not copy code, components, prompt text or translations from Mealie. Build from the feature list in the build plan.
- Do not use the word Cloudflare or its flare shapes in the app's name or icon.
- New dependencies must be compatible with AGPL-3.0-only.

### Secrets and privacy

- No secrets in the repository, in `wrangler.jsonc` or in CI logs. Local secrets go in `.dev.vars`; deployed ones are Wrangler secrets.
- The repository is public. Do not commit the household's domain, hostnames, Zero Trust team domain, Access audience tags, Cloudflare account or resource IDs, or email addresses. Hostnames are CI variables; Access settings are Worker secrets. This applies to docs, tests, commit messages and pull requests too.
- Do not commit real recipe pages fetched from other sites. Test fixtures for URL import are synthetic.

## Testing

- Three Vitest projects, run together from the root config: `packages/schema` (tests beside the source), `apps/worker` (tests in `apps/worker/test/`), `apps/web` (tests beside the source).
- Worker tests run in workerd through `@cloudflare/vitest-plugin` (`cloudflareTest()` in the Vitest config). Import `env` and `exports` from `cloudflare:workers` and call `exports.default.fetch()`; queue and migration helpers come from `cloudflare:test`.
- Web tests use Testing Library on happy-dom. Stub `fetch` with `vi.stubGlobal`; stubs and mocks are reset after each test by the config.
- Test tooling (`vitest`, the Cloudflare plugin, happy-dom) is installed at the workspace root only. Do not add `vitest` to a package: a second copy breaks the run.
- Storage is isolated per test file, not per test. Use distinct IDs within a file, or reset and re-apply migrations.
- Once the database exists (T0.11), tests apply the real migration files, so a schema change needs its migration before its tests can pass.
- New behaviour comes with a test. A bug fix comes with a test that fails without it.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on every pull request and on pushes to `main`.

## Style

- TypeScript throughout, strict mode. No `any` without a comment saying why.
- Database tables and columns are `snake_case`; API JSON is `camelCase`; timestamps are ISO 8601 UTC strings.
- API errors use the shared error body: `{ error: { code, message, issues? } }`.
- Web: mobile first at 390 px. Every screen handles loading, empty, error and offline.
