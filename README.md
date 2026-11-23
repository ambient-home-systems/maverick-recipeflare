# Maverick Recipeflare

A household recipe app that runs on Cloudflare: recipes, cook mode, AI import from photos of recipe cards, web pages and social-media videos, meal planning and shopping lists. Recipeflare for short.

**Status:** Phase 0. The repository has a Worker with a health route and sign-in, the database schema, the web app's shell and design system, and mock screens drawn from sample recipes under `/mock`. It has no features yet.

- [Build plan](docs/build-plan.md): scope, AI import pipeline, architecture, roadmap, decisions and risks.
- [Implementation plan](docs/implementation-plan.md): Phases 0 and 1 in detail, with the data model and the task list.
- [Feature spec](docs/feature-spec.md): how the Phase 1 screens behave.
- [Operations](docs/operations.md): how it is deployed and the one-time setup.

## Development

Needs Node 22.12 or later and pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

Then open `http://localhost:5173`. The mock screens are at `http://localhost:5173/mock`. See [CLAUDE.md](CLAUDE.md) for the other commands and the project's rules.

## License

[AGPL-3.0-only](LICENSE). Anyone who runs a modified copy as a network service must offer that copy's source to its users.
