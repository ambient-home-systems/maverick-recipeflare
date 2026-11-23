import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// As a string: this file is type-checked against the Workers runtime's URL, not Node's.
const root = fileURLToPath(new URL("../..", import.meta.url).href);

// Tests run inside the Workers runtime, with the bindings and flags from the
// same Wrangler file that production uses, and against the same migration
// files: they are read here, in Node, and handed to the tests as a binding.
export default defineConfig(async () => {
  const migrations = await readD1Migrations({
    projectPath: root,
    // The same two settings as the DB binding in wrangler.jsonc.
    migrationsDir: "apps/worker/migrations",
    migrationsPattern: "apps/worker/migrations/*/migration.sql",
  });

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "../../wrangler.jsonc" },
        // The AI binding only exists remotely. Tests never reach it, so that
        // they need no Cloudflare account and cost nothing; they hand the
        // model runner a stand-in.
        remoteBindings: false,
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
          // Tests never reach the network. An import that a test starts through
          // the queue finds every site down; a test that needs a page hands
          // the importer its own fetch.
          outboundService: () => new Response("No network in tests", { status: 503 }),
        },
      }),
    ],
    test: {
      name: "worker",
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
