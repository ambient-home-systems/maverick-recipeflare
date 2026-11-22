import { defineConfig } from "vitest/config";

// One Vitest run covers three projects. Each has its own config because each
// runs in a different environment: Node, the Workers runtime, and a DOM.
export default defineConfig({
  test: {
    projects: ["packages/schema", "apps/worker", "apps/web"],
  },
});
