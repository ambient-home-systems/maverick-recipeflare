# Maverick Recipeflare — Operations

How this install is deployed and what has to be set up by hand. Written for T0.5 of the [implementation plan](implementation-plan.md).

**This document names settings and never gives their values.** The repository is public, and so are its CI logs. Hostnames, the Access team domain, audience tags and the account ID live only in GitHub secrets and in Cloudflare.

## What runs where

| | Staging | Production |
| --- | --- | --- |
| Worker | `recipeflare-staging` | `recipeflare` |
| Wrangler config | `env.staging` in `wrangler.jsonc` | Top level of `wrangler.jsonc` |
| D1 database | `recipeflare-staging` | `recipeflare` |
| R2 bucket | `recipeflare-staging-media` | `recipeflare-media` |
| Import queue | `recipeflare-staging-imports` | `recipeflare-imports` |
| Dead-letter queue | `recipeflare-staging-imports-dlq` | `recipeflare-imports-dlq` |
| Images | The `IMAGES` binding, which names no resource | The same |
| Workers AI | The `AI` binding, which names no resource | The same |
| AI Gateway | `default`, unless `AI_GATEWAY` names another | The same. One gateway serves both unless they are given different names |
| Deployed | Automatically, on every merge to `main`, after CI passes | By hand from the Actions tab, after approval |
| GitHub environment | `staging` | `production` |

Wrangler creates the database, bucket and import queue on the first deploy and finds them by name afterwards. It does not create a queue the Worker only consumes, so the deploy script creates the dead-letter queue itself when it is missing (`scripts/deploy.mjs` reads the names from `wrangler.jsonc`). No resource ID is ever committed.

## One-time setup

Do these in order. Steps 2 and 3 come before the first deploy on purpose: a hostname should have its Access application before anything is served on it.

### 1. Repository secrets

In GitHub: **Settings** > **Secrets and variables** > **Actions** > **Secrets**.

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | An API token with: Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit, Queues Edit, Account Settings Read, and for the zone, Workers Routes Edit. It needs no Access permissions |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |

### 2. Choose two hostnames

Pick a production hostname and a staging hostname in a domain that is on Cloudflare. Neither may already have a DNS record. Nothing needs creating yet: the deploy attaches the hostname to the Worker and Cloudflare adds the DNS record and certificate.

### 3. Create two Access applications

One for each hostname. In the Cloudflare dashboard:

1. Go to **Zero Trust** > **Access controls** > **Applications** and select **Create new application**.
2. Select **Self-hosted and private**, then **Add public hostname**, and enter the hostname.
3. Under **Access policies**, add an Allow policy that includes the household's email addresses. One reusable policy can serve both applications.
4. Set **Session Duration** to one month.
5. Select **Create**.
6. Open the application again, go to **Additional settings**, and copy the **Application Audience (AUD) Tag**. Each application has its own.

Use this hostname-based kind of application. Do not use the **Access** tab on the Worker itself: that kind rejects WebSocket connections, which the live shopping lists in Phase 4 need.

Then, once for the account:

- Go to **Zero Trust** > **Access controls** > **Access settings** and set the global session duration to one month, so that phones are not sent back to the login page every day.
- Go to **Zero Trust** > **Settings** and note the team name. The team domain is `https://<team-name>.cloudflareaccess.com`.

### 4. GitHub environments

In GitHub: **Settings** > **Environments**. Create `staging` and `production`, and in each add these **environment secrets**:

| Secret | Value |
| --- | --- |
| `APP_HOSTNAME` | That environment's hostname, with no `https://` and no path |
| `ACCESS_TEAM_DOMAIN` | The team domain, in full, starting with `https://`. The same in both environments |
| `ACCESS_AUD` | The AUD tag of that environment's Access application |

They are secrets, not variables, so that GitHub masks them in the public deploy logs.

On the `production` environment also set:

- **Required reviewers:** yourself. A production deploy then waits for your approval. Without this setting the deploy starts as soon as the workflow is run.
- **Deployment branches and tags:** `main` only.

### 5. First deploy

Merging to `main` deploys staging. Then run the production deploy once (see below).

The first deploys of both environments, on 22 Nov 2026, created their database, bucket and queue and attached the custom domain with exactly the token permissions listed in step 1. No DNS permission is needed.

## Deploying

**Staging** deploys by itself when a pull request merges to `main` and the checks pass. To try a branch on staging before merging: **Actions** > **Deploy** > **Run workflow**, choose the branch, and leave the target as `staging`.

**Production**: **Actions** > **Deploy** > **Run workflow**, on `main`, with the target `production`. The run waits for approval on the `production` environment, then deploys. It refuses to deploy production from any branch but `main`.

Both run the same script, `scripts/deploy.mjs`, which:

1. builds the web app;
2. applies any database migrations to the remote database;
3. deploys the Worker with the hostname as a custom domain and the two Access settings as Worker secrets.

Migrations run before the new code is uploaded, so each migration must work with the code that is already live. Migrations only move forward.

## Checking a deploy

- In a private browser window, open the hostname. Cloudflare Access should ask you to sign in, and after signing in the page at `/mock` should say that the API is reachable and who you are signed in as.
- Signed in, `/api/v1/me` shows the member the app knows you as.
- Without signing in, nothing of the app should load.
- In the deploy log, the Worker should be listed with one address only, shown masked. A `workers.dev` address there means the hostname secret was missing; the script is set to fail before that can happen.

## Members

The app has no member list of its own to keep. Whoever the Access policy lets in is a member.

- **The first person to sign in becomes the owner**, and that sign-in creates the household. On a new install, sign in yourself before sharing the address.
- Anyone else Access lets in becomes a member the first time they open the app.
- A member's name starts as the first part of their email address.
- To stop new people becoming members by themselves, add an environment **variable** named `AUTH_AUTO_ENROLL` with the value `false` to the GitHub environment, and deploy. The first person still becomes the owner. Set it to `true` and deploy to turn it back on.
- Removing someone from the Access policy stops them signing in. Their recipes stay.

If every request answers "Sign-in is not set up on this server", the `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` secret is missing from that GitHub environment.

## AI

Importing from photos and text (Phase 2) asks a model on Workers AI, through an AI Gateway. Nothing needs setting up before the first deploy: the binding names no resource, the deploy token needs no new permission as far as the docs say, and Cloudflare makes the gateway called `default` the first time the Worker calls it.

### Check it after a deploy

Signed in as the owner, open `/mock` on the hostname and press **Check the AI connection**. It puts one small question to a model, with nothing of the household's in it, and says which model answered, how long it took and the gateway's log ID. It spends a little of the account's AI allowance each time.

- To see that a retired model is refused and not retried, type `@cf/zai-org/glm-5.3-flash` in **Model to ask** and check again. The answer should say the model has been retired and that an import would not try again.
- If the check says a setting names something that does not exist, `AI_PROFILE` is mistyped.
- A member who is not the owner is told the check is for the owner.

### Settings

Each is optional. Add it as an environment **variable** of the GitHub environment (`staging` or `production`), and deploy.

| Variable | Does | When unset |
| --- | --- | --- |
| `AI_PROFILE` | Which models do the AI jobs. The profiles are in `apps/worker/src/ai/profiles.ts`: `standard`, `gemma`, `qwen` | `standard` |
| `AI_GATEWAY` | The name of the AI Gateway every model call goes through. Any name but `default` must be created in the dashboard first | `default` |
| `AI_LOG_CONTENT` | `true` lets the gateway keep what was asked of a model and what it answered: photos of recipe cards and their text | Not kept. The gateway still records each call's model, time and cost |

A variable that has been set stays set on the Worker after it is removed from GitHub. To go back to a default, set the variable to the default's value and deploy.

### The gateway, once

After the first check has made the gateway, in the Cloudflare dashboard go to **AI** > **AI Gateway** and select `default`.

1. **Spend limit.** Go to **Settings** > **Spend limits** and add a rule: the amount the household is willing to spend on AI in a month, with no model or provider chosen, so that it covers everything. The plan's figure is $5. Past it, the gateway refuses calls until the month ends, and imports fail saying the allowance is used up.
2. **Logs.** Open **Logs** and look at the entry for the check you ran. It should show the model, the tokens and the time, and no prompt or answer: the app asks the gateway not to keep them. If the prompt is there, turn log collection off under **Settings** > **Logs**, and say so in an issue, because the app's own request was not honoured.

Staging and production share the `default` gateway and so share its spend limit. To give each its own, create two gateways and set `AI_GATEWAY` in each GitHub environment.

Workers AI's own free allowance is 10,000 Neurons a day for the account. The Workers Paid plan bills use beyond it; on the free plan calls fail once it is used up.

### On a computer

`pnpm dev`, the tests and the end-to-end run never reach a model and need no Cloudflare account: Workers AI has no local version, and a real call is billed. To try a real model from a computer, sign Wrangler in and start the Worker without `--local`:

```bash
pnpm exec wrangler dev
```

## The database

Each deploy applies any new database migrations before it uploads the code. The first deploy after the schema was added (T0.11) creates every table, the search index and its triggers, and 25 units.

- Migrations live in `apps/worker/migrations`, one folder each, and only ever move forward.
- The deploy log hides anything shaped like a Cloudflare resource ID in what Wrangler prints while migrating, because the log is public.
- To see which migrations a database has, with Wrangler signed in: `pnpm exec wrangler d1 migrations list DB --remote`, adding `--env staging` for staging.
- The search index can be rebuilt from its source table at any time. Do this after restoring a database:

  ```sql
  INSERT INTO recipes_fts (recipes_fts) VALUES ('rebuild');
  ```

- `wrangler d1 export` does not work on this database, because it has a full-text index. Backups are D1's Time Travel, which keeps 30 days.

### Undoing a bad migration

A migration cannot be rolled back by rolling back the code. Restore the database to the minute before the deploy began, with Wrangler signed in:

```bash
pnpm exec wrangler d1 time-travel restore DB --timestamp <time before the deploy, such as 2026-11-23T18:04:00Z>
```

Add `--env staging` for staging. Everything written after that time is lost, so do it promptly. Then roll the Worker back as described below, and rebuild the search index.

## Rolling back

In the Cloudflare dashboard, open the Worker, go to **Deployments**, and roll back to the previous version. This restores the code and static files at once.

A rollback does not undo a database migration. Migrations are written so that the previous release still works after them, which is what makes rolling back the code safe.

## Deploying from a computer

Not needed for normal work. With Wrangler signed in (`pnpm exec wrangler login`) and the same settings in the shell environment:

```bash
APP_HOSTNAME=<hostname> REQUIRE_HOSTNAME=true pnpm run deploy:staging
```

`pnpm run deploy --dry-run` builds and bundles without contacting Cloudflare. Use `pnpm run deploy`, not `pnpm deploy`, which is a different pnpm command.

## Other installs

A household that installs its own copy runs the same `pnpm run deploy` through Workers Builds, with no hostname set. Its Worker is then served on its `workers.dev` address. Packaging that path, with its setup secret and passkey login, is Phase 6.
