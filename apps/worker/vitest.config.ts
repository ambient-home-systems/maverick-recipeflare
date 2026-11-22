import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside the Workers runtime, with the bindings and flags from the
// same Wrangler file that production uses.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "../../wrangler.jsonc" },
    }),
  ],
  test: {
    name: "worker",
    include: ["test/**/*.test.ts"],
  },
});
