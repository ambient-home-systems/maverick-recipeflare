import type { D1Migration } from "cloudflare:test";

// The migrations, read from disk by vitest.config.ts. A test-only binding.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
