import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Runs before each test file. Storage is separate for each file, so each one
// starts from an empty database with every migration applied. Applying is
// idempotent: a migration already recorded is skipped.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
