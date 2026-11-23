// Fails when the Drizzle schema and the migrations folder disagree.
//
// Two checks:
//   1. `drizzle-kit check`: the migration folders are consistent with each other.
//   2. `drizzle-kit generate --explain`: generating now would produce nothing,
//      so every change to apps/worker/src/db/schema.ts has its migration.
//
// Neither writes a file. To fix a failure, run `pnpm db:generate --name <what_changed>`
// and commit the new folder.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const worker = fileURLToPath(new URL("../apps/worker", import.meta.url));

function kit(args) {
  const result = spawnSync("pnpm", ["exec", "drizzle-kit", ...args], {
    cwd: worker,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error) {
    console.error(`check-migrations: could not start drizzle-kit: ${result.error.message}`);
    process.exit(1);
  }
  return result;
}

const folders = kit(["check"]);
if (folders.status !== 0) {
  console.error(folders.stdout + folders.stderr);
  console.error("check-migrations: the migration folders are not consistent.");
  process.exit(1);
}

const plan = kit(["generate", "--explain", "--output", "json"]);
// The report is the last line that is a JSON object; lines before it are progress messages.
const line = plan.stdout
  .split("\n")
  .map((text) => text.trim())
  .reverse()
  .find((text) => text.startsWith("{") && text.endsWith("}"));
let report = null;
try {
  report = line ? JSON.parse(line) : null;
} catch {
  report = null;
}

if (plan.status !== 0 || report === null) {
  console.error(plan.stdout + plan.stderr);
  console.error("check-migrations: could not read drizzle-kit's report.");
  process.exit(1);
}
if (report.status !== "no_changes") {
  console.error("check-migrations: the schema has changes with no migration:");
  for (const statement of report.statements ?? []) {
    const where = statement.column
      ? `${statement.column.table}.${statement.column.name}`
      : (statement.table?.name ?? statement.name ?? "");
    console.error(`  ${statement.type} ${where}`.trimEnd());
  }
  console.error("Run `pnpm db:generate --name <what_changed>` and commit the new folder.");
  process.exit(1);
}

console.log("check-migrations: the schema and the migrations agree.");
