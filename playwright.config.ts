import { defineConfig, devices } from "@playwright/test";

/**
 * The end-to-end run: the built app, served by a local Worker with an empty
 * database, driven in a phone-sized browser. `pnpm e2e` runs it; CI runs it
 * on every pull request. See docs/implementation-plan.md §8.1.
 */

const PORT = 8799;

export default defineConfig({
  testDir: "e2e",
  // One database, one story: the specs run in order, one at a time.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        // A machine that already has a Chromium can point at it instead of downloading one.
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
      },
    },
  ],
  webServer: {
    command: `node scripts/e2e-server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
