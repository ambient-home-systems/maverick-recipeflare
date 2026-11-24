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

Importing from photos and text (Phase 2) asks a model on Workers AI, through an AI Gateway. Nothing needs setting up before the first deploy: the binding names no resource, the deploy token needs no new permission (the first deploy with the binding, on 23 Nov 2026, passed with the token of step 1), and Cloudflare makes the gateway called `default` the first time the Worker calls it.

### Check it after a deploy

Signed in as the owner, open `/mock` on the hostname and press **Check the AI connection**. It puts one small question to a model, with nothing of the household's in it, and says which model answered, how long it took and the gateway's log ID. It spends a little of the account's AI allowance each time.

- To see that a retired model is refused and not retried, type `@cf/zai-org/glm-5.3-flash` in **Model to ask** and check again. The answer should say the model has been retired and that an import would not try again.
- If the check says a setting names something that does not exist, `AI_PROFILE` is mistyped.
- A member who is not the owner is told the check is for the owner.

### Try an import

Once the check passes, on the Add page paste a recipe's text under **Paste text** and press **Import text**. The list shows it being written up, then offers **Review**, where the draft sits beside the text you pasted. For T2.3 of the Phase 2 plan, do this on staging with three recipes from different kinds of source, such as a message, a document and a web page's text, and say how each came out. For T2.4, also import a link to a page that shows a recipe without recipe data, such as a blog post or a forum thread: it should land in review as written up by AI, with the page's words beside it.

For T2.7, in the editor type an ingredient line the app cannot read, such as "Juice of 2 lemons" or "a knob of butter", open it, and press **Read with AI**. The amount, food and note should fill in from the line's own words, and **Keep as written** should undo it. Then import a card or paste a recipe that has such a line: review should say how many lines were read by AI and mark each "check". Say if a reading is wrong and not just missing: a wrong amount is the thing this is built never to give.

For T2.10, paste a recipe in another language, or photograph a card in one. In review it should say the recipe does not look to be in English and offer **Translate into English**. Press it: the list should say it is being translated, and review should then open in English, with every amount as it was written and a note, "As written, before translation", holding the original. Say if an amount changed, or if a recipe in English was offered a translation: neither should happen.

For T2.9, on a phone: type a recipe with a few ingredients and steps, and see that each step shows the time it states and the ingredients it names. Open a step, correct its time, take an ingredient off and add another. Then cook from it: each step should show its ingredients with their amounts, and doubling the recipe should double them under the steps too. Do the same on a tablet on its side. Say where a step showed an ingredient it does not use, or a time that is not its own: either would be a wrong reading, which the rules are built to avoid.

For T2.8, with a few categories and tags of your own under **Manage**, import a card or paste a recipe. In review, under Categories, Tags and Tools, it should say "AI suggests these of yours" with a button for each, and none of them chosen. Say whether the suggestions were sensible, and above all whether one ever appears that is not on your lists: that should be impossible.

For T2.6, photograph cards: on a phone, Add, then **From photos**. Do five printed cards and five handwritten ones, some with a back, and press **Import**. Each should come up on the list as "Card 1", "Card 2" and so on, say "Reading the card" and then "Writing it up", and offer **Review**, where the card's photos sit beside the draft and **Save and next card** goes on to the next. Say how each came out, and above all whether any failed with "Nothing could be read from the photo" or "importing with AI is not working": this is the first time a picture is sent to a model, and the first place a wrong guess about what the models accept would show.

### When an import is slow or fails

Every call an import makes to a model is kept with it: which model, how long it took, how much it read and wrote, and for a call that gave no answer, why. Nothing that was asked or answered is kept. To see it, signed in on a computer, open `/api/v1/imports` on the hostname, copy the `id` of the import, and open `/api/v1/imports/` followed by that id. The `calls` list is oldest first. A call whose `failed` says the model took too long was given up on by the app: a minute and a half for most calls, three minutes for reading a card's photos.

### Settings

Each is optional. Add it as an environment **variable** of the GitHub environment (`staging` or `production`), and deploy.

| Variable | Does | When unset |
| --- | --- | --- |
| `AI_PROFILE` | Which models do the AI jobs. The profiles are in `apps/worker/src/ai/profiles.ts`: `standard`, `gemma`, `qwen` | `standard` |
| `AI_GATEWAY` | The name of the AI Gateway every model call goes through. Any name but `default` must be created in the dashboard first | `default` |
| `AI_LOG_CONTENT` | `true` lets the gateway keep what was asked of a model and what it answered: photos of recipe cards and their text | Not kept. The gateway still records each call's model, time and cost |
| `AI_DAILY_IMPORTS` | How many imports may ask a model in any 24 hours. Past it, a new import fails saying the day's allowance is used up; one already under way finishes | 100 |
| `AI_COMPARE` | `on` lets the owner run saved imports again under another profile, from the import report. Set it on `staging` only: every run asks a model and is billed | Off. The report is still there; it offers nothing to run |

A variable that has been set stays set on the Worker after it is removed from GitHub. To go back to a default, set the variable to the default's value and deploy.

### Comparing models

This is how the default profile is chosen (T2.11 in the [Phase 2 plan](phase-2-plan.md)). It is done on staging, with real cards, by the owner.

1. Once: add the variable `AI_COMPARE` with the value `on` to the `staging` GitHub environment, and deploy staging. Do not add it to `production`.
2. On staging, photograph twenty cards (Add, From photos), handwritten ones among them, and review and save each as you would at home. The photos stay in staging's bucket.
3. Open Manage, Import report. Each card says what you changed in review.
4. At the bottom, press "Run again with" for every profile, the one in use included. Twenty cards are started at a press; each run appears under its card as it finishes, and the page keeps itself up to date while any is under way.
5. Compare the "Run again with" lines under "Added up" with each other: changes for each import, how many were within minor fixes, amounts corrected without a warning, and the time taken. Do not set them against "As you saved them": your review began from one profile's draft, which flatters it.
6. To put the winner in use, set `AI_PROFILE` on each environment and deploy. The numbers go into the plan.

Each run counts towards `AI_DAILY_IMPORTS` and the gateway's spend limit: twenty cards under three profiles is sixty runs, on top of the twenty imports themselves. A run that failed is tried again by pressing the same button. `GET /api/v1/imports/report`, opened in the browser, gives the same report as data.

### The gateway, once

After the first check has made the gateway, in the Cloudflare dashboard go to **AI** > **AI Gateway** and select `default`.

1. **Spend limit.** Go to **Settings** > **Spend limits** and add a rule: the amount the household is willing to spend on AI in a month, with no model or provider chosen, so that it covers everything. The plan's figure is $5. Past it, the gateway refuses calls until the month ends, and imports fail saying the allowance is used up.
2. **Logs.** Open **Logs** and look at the entry for the check you ran. It should show the model, the tokens and the time, and no prompt or answer: the app asks the gateway not to keep them. If the prompt is there, turn log collection off under **Settings** > **Logs**, and say so in an issue, because the app's own request was not honoured.

Staging and production share the `default` gateway and so share its spend limit. To give each its own, create two gateways and set `AI_GATEWAY` in each GitHub environment.

Workers AI's own free allowance is 10,000 Neurons a day for the account. The Workers Paid plan bills use beyond it; on the free plan calls fail once it is used up.

### On a computer

`pnpm dev`, the tests and the end-to-end run never reach a model and need no Cloudflare account: Workers AI has no local version, and a real call is billed. With `AI_MODE=stand-in` in `.dev.vars`, as `.dev.vars.example` has it, a scripted stand-in reads pasted text by a few simple rules, so the screens can be tried. It works on localhost only and is never set on a deployed Worker. To try a real model from a computer, take that line out, sign Wrangler in and start the Worker without `--local`:

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
