import { defineConfig } from "drizzle-kit";

// Only `generate` and `check` are used. Migrations are applied by Wrangler,
// never by drizzle-kit: `push` and `migrate` would bypass D1's own record of
// what has been applied, and would see the search index's shadow tables as drift.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
