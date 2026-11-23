// Serves the built app from a local Worker for the end-to-end run, on its own
// port and with its own empty database, so a run never touches the data that
// `pnpm dev` uses and always starts from nothing.
//
//   node scripts/e2e-server.mjs <port>
//
// Playwright starts and stops this (playwright.config.ts).

import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = process.argv[2] ?? "8799";
const state = join(root, ".wrangler", "e2e");

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, CI: process.env.CI ?? "true" },
  });
  if (result.status !== 0) {
    console.error(`e2e: "${label}" failed`);
    process.exit(result.status ?? 1);
  }
}

rmSync(state, { recursive: true, force: true });
run("build the web app", "pnpm", ["run", "build"]);
run("apply migrations", "pnpm", [
  "exec",
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "DB",
  "--local",
  "--persist-to",
  state,
]);

// Signed in as an invented member, which the dev provider allows on localhost only.
const server = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "dev",
    "--port",
    port,
    "--persist-to",
    state,
    "--var",
    "AUTH_MODE:dev",
    "--var",
    "DEV_MEMBER_EMAIL:cook@example.com",
    "--show-interactive-dev-session=false",
  ],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
