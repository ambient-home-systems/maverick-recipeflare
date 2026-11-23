// Builds the web app, applies database migrations, and deploys the Worker.
//
//   node scripts/deploy.mjs                 deploy the top-level (production) config
//   node scripts/deploy.mjs --env staging   deploy the staging environment
//   node scripts/deploy.mjs --dry-run       build and bundle, but change nothing remote
//
// Everything that identifies an install comes from the environment, never from
// the repository:
//
//   APP_HOSTNAME         Custom domain to serve the app on. Without it the
//                        Worker is deployed with whatever wrangler.jsonc gives
//                        it, which for the top-level config is workers.dev.
//   REQUIRE_HOSTNAME     Set to "true" to fail when APP_HOSTNAME is missing.
//                        Our own CI sets it so a deploy can never fall back to
//                        a public workers.dev address.
//   ACCESS_TEAM_DOMAIN   Cloudflare Access team domain, stored as a Worker secret.
//   ACCESS_AUD           Access application audience tag, stored as a Worker secret.
//   AUTH_AUTO_ENROLL     Optional. "false" stops people the sign-in provider lets
//                        through from becoming members by themselves.
//   AI_PROFILE           Optional. Which models do the AI jobs; see
//                        apps/worker/src/ai/profiles.ts. Unset means "standard".
//   AI_GATEWAY           Optional. The AI Gateway model calls go through.
//                        Unset means "default".
//   AI_LOG_CONTENT       Optional. "true" lets the gateway keep what was asked
//                        of a model and what it answered.
//   AI_DAILY_IMPORTS     Optional. How many imports may ask a model in a day.
//                        Unset means 100.
//
// Wrangler reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID itself.
//
// This script is also what Workers Builds runs for installs made with the
// Deploy to Cloudflare button, so it must not depend on GitHub.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationsDir = join(root, "apps", "worker", "migrations");

/** Worker secrets taken from the environment, when present. */
const SECRET_NAMES = [
  "ACCESS_TEAM_DOMAIN",
  "ACCESS_AUD",
  "AUTH_AUTO_ENROLL",
  "AI_PROFILE",
  "AI_GATEWAY",
  "AI_LOG_CONTENT",
  "AI_DAILY_IMPORTS",
];

function fail(message) {
  console.error(`deploy: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  let env = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--env" || arg === "-e") {
      env = argv[++i] ?? fail("--env needs a value");
    } else if (arg.startsWith("--env=")) {
      env = arg.slice("--env=".length);
    } else {
      fail(`unknown argument "${arg}"`);
    }
  }
  if (env !== null && !/^[a-z][a-z0-9-]*$/.test(env)) {
    fail(`"${env}" is not a valid environment name`);
  }
  return { env, dryRun };
}

function run(label, command, args) {
  console.log(`\ndeploy: ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    // pnpm is a .cmd shim on Windows, which needs a shell to start.
    shell: process.platform === "win32",
  });
  if (result.error) {
    fail(`could not start ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`"${label}" failed with exit code ${result.status}`);
  }
}

/**
 * Runs a command and prints what it printed, with anything shaped like a
 * Cloudflare resource ID replaced. Wrangler names the database it migrates by
 * its ID, and the deploy log of a public repository is public.
 */
function runRedacted(label, command, args) {
  console.log(`\ndeploy: ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    // No terminal on either end, so Wrangler does not wait for a yes.
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: { ...process.env, CI: process.env.CI ?? "true" },
  });
  const redact = (text) =>
    (text ?? "")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
      .replace(/\b[0-9a-f]{32}\b/gi, "<id>");
  process.stdout.write(redact(result.stdout));
  process.stderr.write(redact(result.stderr));
  if (result.error) {
    fail(`could not start ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`"${label}" failed with exit code ${result.status}`);
  }
}

/** JSON with comments and trailing commas, as wrangler.jsonc is written, parsed. */
function parseJsonc(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      out += char;
      if (char === "\\") {
        out += text[++i] ?? "";
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
      out += char;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        i++;
      }
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i === -1) {
        break;
      }
      i++;
    } else {
      out += char;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * The queues this environment's Worker consumes or sends dead letters to
 * without also producing to them. Wrangler creates a queue the Worker has a
 * producer binding for on the first deploy; it refuses to deploy a consumer of
 * a queue that does not exist.
 */
function queuesToEnsure(envName) {
  const config = parseJsonc(readFileSync(join(root, "wrangler.jsonc"), "utf8"));
  const queues = (envName ? config.env?.[envName]?.queues : config.queues) ?? {};
  const produced = new Set((queues.producers ?? []).map((producer) => producer.queue));
  const named = (queues.consumers ?? []).flatMap((consumer) => [
    consumer.queue,
    consumer.dead_letter_queue,
  ]);
  return [...new Set(named)].filter(
    (name) => typeof name === "string" && /^[a-z0-9-]{1,63}$/.test(name) && !produced.has(name),
  );
}

/** True if a command succeeds. Nothing it prints is shown: a queue's details include its ID. */
function succeeds(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "ignore",
    shell: process.platform === "win32",
    env: { ...process.env, CI: process.env.CI ?? "true" },
  });
  return result.status === 0;
}

function hasMigrations() {
  return (
    existsSync(migrationsDir) && readdirSync(migrationsDir).some((name) => !name.startsWith("."))
  );
}

/** A hostname only: no scheme, path, port or spaces. */
function validHostname(value) {
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}

const { env, dryRun } = parseArgs(process.argv.slice(2));
const envArgs = env ? ["--env", env] : [];
const hostname = process.env.APP_HOSTNAME?.trim() ?? "";

if (hostname === "" && process.env.REQUIRE_HOSTNAME === "true") {
  fail("APP_HOSTNAME is not set. Add it as a secret of this deploy environment.");
}
if (hostname !== "" && !validHostname(hostname)) {
  // Do not print the value: it may be a mistyped secret.
  fail("APP_HOSTNAME is not a plain hostname. Use a name such as app.example.com.");
}

run("build the web app", "pnpm", ["run", "build"]);

if (dryRun) {
  console.log("\ndeploy: dry run, skipping database migrations");
} else if (hasMigrations()) {
  // Before the new code is uploaded: each migration must work with the code already live.
  runRedacted("apply database migrations", "pnpm", [
    "exec",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    ...envArgs,
  ]);
} else {
  console.log("\ndeploy: no database migrations to apply");
}

if (!dryRun) {
  for (const queue of queuesToEnsure(env)) {
    if (succeeds("pnpm", ["exec", "wrangler", "queues", "info", queue])) {
      console.log(`\ndeploy: queue ${queue} exists`);
    } else {
      runRedacted(`create queue ${queue}`, "pnpm", ["exec", "wrangler", "queues", "create", queue]);
    }
  }
}

const secrets = SECRET_NAMES.map((name) => [name, process.env[name]?.trim() ?? ""]).filter(
  ([, value]) => value !== "",
);

const deployArgs = ["exec", "wrangler", "deploy", ...envArgs];
if (hostname !== "") {
  deployArgs.push("--domain", hostname);
}
if (dryRun) {
  deployArgs.push("--dry-run");
}

let secretsDir = null;
try {
  if (secrets.length > 0) {
    secretsDir = mkdtempSync(join(tmpdir(), "recipeflare-deploy-"));
    const secretsFile = join(secretsDir, "secrets.json");
    writeFileSync(secretsFile, JSON.stringify(Object.fromEntries(secrets)), { mode: 0o600 });
    deployArgs.push("--secrets-file", secretsFile);
    console.log(`\ndeploy: setting ${secrets.length} Worker secret(s)`);
  }
  run(`deploy the Worker${env ? ` (${env})` : ""}`, "pnpm", deployArgs);
} finally {
  if (secretsDir) {
    rmSync(secretsDir, { recursive: true, force: true });
  }
}

console.log("\ndeploy: done");
