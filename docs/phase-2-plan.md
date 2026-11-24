# Maverick Recipeflare — Implementation Plan (Phase 2: AI import)

23 Nov 2026. Companion to the [build plan](build-plan.md), which stays the source of truth for scope, architecture, roadmap and decisions, and to the [implementation plan for Phases 0 and 1](implementation-plan.md), whose data model, shared schema, import jobs and rules this builds on. This document turns Phase 2 into buildable work.

**Status.** The owner approved this plan on 23 Nov 2026 and said to go ahead with T2.1 to T2.5 before the Phase 1 gate has been run, and then, the same day, with T2.6. On 24 Nov 2026, with Phase 1's gate passed, the owner said to go on with T2.7 to T2.10. The other decisions in [section 9](#9-decisions-for-the-owner) stand at their defaults. T2.1 to T2.8 are built; the task list says what each built task could not check.

**Phase 1 is finished.** Its gate, T1.16 (ten family recipes entered on production without workarounds), was declared passed by the owner on 24 Nov 2026. Phase 2 work had begun beside it, by the owner's decision, and T2.1 to T2.6 were built before it passed.

## Contents

- [1. What Phase 2 is](#1-what-phase-2-is)
- [2. What was checked, and what it changed](#2-what-was-checked-and-what-it-changed)
- [3. Conflicts with the build plan](#3-conflicts-with-the-build-plan)
- [4. How an AI import runs](#4-how-an-ai-import-runs)
- [5. The rules every AI step follows](#5-the-rules-every-ai-step-follows)
- [6. Changes to the data model and the shared schema](#6-changes-to-the-data-model-and-the-shared-schema)
- [7. Screens](#7-screens)
- [8. Testing, cost and privacy](#8-testing-cost-and-privacy)
- [9. Decisions for the owner](#9-decisions-for-the-owner)
- [10. Task list](#10-task-list)

## 1. What Phase 2 is

From the build plan's scope and roadmap:

| Feature | What it means here |
| --- | --- |
| Import from photos | The main path for the household's paper cards. A stack of cards is photographed in one sitting, front and back paired. The photos are kept as the recipe's original card |
| Import from text or a page | Pasted text; a link whose page has no structured data; a page sent by the browser's bookmark that has none |
| Ingredient parser, AI fallback | The Phase 1 rules read a line first. A model reads only the lines the rules could not |
| Auto-organize | Suggests categories, tags and tools the recipe itself mentions, from the ones the household already has |
| Step details | Which ingredients each step uses, and the times a step states |
| Translate on import | A recipe in another language is brought in in the household's language |
| Review beside the original | Built in Phase 1 for links. Phase 2 puts the photographed card there |
| Model per task | Which model does each job is a setting, through AI Gateway |

**Gate:** twenty paper cards imported by photo with minor fixes. Section 8 says how "minor fixes" is measured.

**Out of Phase 2**, so that gate testing does not log them: video and social-media import, the share sheet and email-a-link (Phase 3); a settings screen for models (Phase 6); importing while offline.

## 2. What was checked, and what it changed

Read from the live Cloudflare docs on 23 Nov 2026. The first pass, for the plan, went through a documentation search. T2.1 then read the pages themselves, and the AI binding's own code in the Workers runtime the project has installed, and corrected the table below where they differed.

| Fact | Source | Effect on this plan |
| --- | --- | --- |
| The current text models take OpenAI's chat request: `messages`, and `response_format: { type: "json_schema", json_schema: { name, schema, strict } }`. They answer in OpenAI's shape too: `choices[0].message.content` is the JSON as text, beside `model` and `usage`. The model is not guaranteed to comply: a call can fail with "JSON Mode couldn't be met". No streaming | [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/), the model pages, the binding's types | Every model answer is validated in code with the shared schema. An answer that is not the schema is asked for once more and then fails the job with a code the list explains ([§4](#4-how-an-ai-import-runs)). The runner also reads the older `{ response }` shape, which the JSON mode page still shows |
| Which models support JSON mode is not listed in one place: the JSON mode page names only older models. Each model's page lists `response_format` among its parameters | The model pages | A model is only eligible for a task once the owner's check on staging, or T2.11, has seen it return the schema |
| Twenty-four Workers AI models stopped answering on 20 Nov 2026. A retired model answers HTTP 410 with error code 5028 | [Planned model deprecations](https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/), [errors](https://developers.cloudflare.com/workers-ai/platform/errors/) | Model names in the build plan are out of date ([§3](#3-conflicts-with-the-build-plan)). Model IDs are settings, in `apps/worker/src/ai/profiles.ts`, chosen by the comparison in T2.11. A retired model fails at once and is not retried |
| `@cf/google/gemma-4-26b-a4b-it` (256,000 tokens of context; $0.10 per million tokens read, $0.30 written) and `@cf/qwen/qwen3.8-27b` (262,144; $0.45 and $3.20) both take pictures, both run on Cloudflare with zero data retention, and neither needs the Workers Paid plan. `@cf/zai-org/glm-5.3` takes no pictures and needs Workers Paid. `@cf/zai-org/glm-5.3-flash` was retired on 20 Nov 2026 | The model pages | The first profiles use Gemma 4 and Qwen 3.8. The retired GLM model is what the owner's check uses to see a retired model refused |
| A picture is one part of the user's message: `{ type: "image_url", image_url: { url } }`, where the address can be a `data:` address holding the picture. No page states a size limit; a request that is too large fails with code 3006 | The binding's types; [errors](https://developers.cloudflare.com/workers-ai/platform/errors/) | The runner sends pictures as `data:` addresses. T2.6 sends the smaller size the app already makes of every photo, and finds out on staging what the models accept |
| The Workers AI binding takes a gateway in its third argument: `env.AI.run(model, input, { gateway: { id, metadata, collectLog, … } })`. A gateway called `default` is made by Cloudflare on the first call that names it, with logging on | [AI Gateway Worker bindings](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/), [manage gateways](https://developers.cloudflare.com/ai-gateway/configuration/manage-gateway/) | One code path for every model. The gateway is a setting, `AI_GATEWAY`, and is `default` unless set, so an install needs no dashboard step before its first import |
| A gateway keeps a log of each call, with what was asked and answered. The header `cf-aig-collect-log-payload: false` on a request keeps the record (model, tokens, cost, time) and not the content. The binding passes extra headers on (`extraHeaders`) | [Logging](https://developers.cloudflare.com/ai-gateway/observability/logging/), the binding's code | The runner sends that header on every call unless `AI_LOG_CONTENT` is `true`: decision 3's default. That the gateway honours it for a call made through the binding is checked by the owner on staging, by looking at a log entry ([operations](operations.md)) |
| Spend limits are set per gateway, in the dashboard or by API: a dollar amount over a time window, for everything or by model, provider or a metadata key. Past the limit, calls answer 429 until the window ends | [Spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/) | The monthly limit of decision 8 is a rule on the gateway. The runner tags each call with `app`, `task` and `profile`, so a rule can be scoped to them |
| Through AI Gateway's Unified Billing, the same binding can call OpenAI, Anthropic and Google models as `{author}/{model}`, with no provider keys. It needs credits bought in the dashboard beforehand, and takes a 5% fee on them | [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/) | The build plan's "frontier model for handwriting" needs no new secret and no second client: it is a different model ID in a profile. None is in a profile yet: decision 2 |
| The binding throws an error whose message begins with the service's code, such as `5028: … was deprecated on …` or `AiGatewayError: 7003: User Input Error` | The binding's code; [errors](https://developers.cloudflare.com/workers-ai/platform/errors/); [gateway troubleshooting](https://developers.cloudflare.com/ai-gateway/reference/troubleshooting/) | The runner reads the code to decide whether a failure is worth another try. Timeouts and "out of capacity" are; a missing or retired model, a used-up allowance and a bad request are not |
| Workers AI has no local simulation. With an `ai` binding in the Wrangler file, `wrangler dev` and the Worker tests try to open a session with Cloudflare and stop if there are no credentials | [Local development](https://developers.cloudflare.com/workers/development-testing/), and tried here | `pnpm dev` and the end-to-end run start Wrangler with `--local`, and the Worker tests set `remoteBindings: false`. None of them needs a Cloudflare account or can reach a model. Every AI step takes its model runner as a tool, as importers take `fetch`, and tests hand it a stand-in ([§8](#8-testing-cost-and-privacy)) |
| A queue consumer gets 15 minutes of wall time per invocation. CPU time is 30 seconds by default and can be raised; time waiting on a model is not CPU time | [Queues limits](https://developers.cloudflare.com/queues/platform/limits/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) | An import is split into stages, one model call each, and the import queue's batch size drops so that one slow batch cannot run out of wall time ([§4](#4-how-an-ai-import-runs)). One model call is given up on after 90 seconds |
| Text models: 300 requests a minute for an account; 20 a minute for a model that needs Workers Paid | [Workers AI limits](https://developers.cloudflare.com/workers-ai/platform/limits/) | Far above what a household sends. A sitting of twenty cards is a few dozen calls |
| Workers AI: 10,000 Neurons a day free, then $0.011 per 1,000. Past the free amount on a free plan, calls fail with code 3036 | [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) | Unchanged from the build plan. T2.13 measures what an import really costs |

**What T2.1 settled, and what is still open:**

- *Model IDs, and which take a picture and a JSON Schema in one call.* Settled from the catalog as far as it goes: see the table. Whether each really returns the schema is seen by the owner's check on staging.
- *How a picture is passed, and how large it may be.* The shape is settled. The size is not stated anywhere and is found out in T2.6.
- *Whether the tests and the end-to-end run start without Cloudflare credentials.* They did not, and now do: see the table. CI has none and passes.
- *Whether the deploy token needs a Workers AI permission.* It does not. The docs say a deploy needs no permission on what a Worker is bound to, and the first staging deploy with the binding passed with the token unchanged.
- *Whether Unified Billing is available, and what the default gateway is called.* The gateway is `default`. Unified Billing needs credits bought first; nothing uses it yet.

## 3. Conflicts with the build plan

Nothing here reopens a decision. These are facts that have moved.

- **Model names.** The build plan names Moondream 3.1, Llama 4 Scout, Gemma 3 12B and Whisper as defaults. Workers AI retired two dozen models on 20 Nov 2026 and the catalog has turned over. The decision the build plan actually made stands: "Workers AI first, compared on 20 real imports". This plan carries out that comparison (T2.11) and treats every model name as a setting.
- **Cost per recipe.** The build plan's figure of about 145 Neurons assumes a model that may be gone. T2.13 measures it and corrects the figure here, not in the build plan.
- **"Queues and Workflows".** Already settled in the first implementation plan: imports use the import queue and no Workflows. Phase 2 keeps to that, with stages.
- **"Recipe sites block requests from Workers: Browser Run fallback, paste-the-page option."** Phase 1 met this risk early. The owner chose a bookmark that sends the page from the cook's own browser, which works where a hosted browser might not. Phase 2 adds the paste option. A hosted-browser fetch is not planned.

## 4. How an AI import runs

Every import still uses the `import_jobs` table and the import queue, ends on the review screen, and saves nothing until the cook confirms. What is new is that an import can take more than one step.

### 4.1 Stages

A stage is one model call, or one piece of work in code. The job row records which stage is next (`stage`, which the table has had since Phase 0) and what has been gathered so far (`work`, new). The runner runs one stage for one queue message. A handler answers with either a finished draft, or the next stage and what to keep; the runner then stores that and sends the queue another message for the same job. This is the design the first plan described ("a multi-step import records its stage and sends itself the next message").

| Stage | Runs for | Does | Uses a model |
| --- | --- | --- | --- |
| `read` | Photos | Reads each photo into text, exactly as written, in order: front, then back | Vision |
| `fetch` | A link | Phase 1's fetch. If the page describes a recipe in structured data, the job is finished here as it is today. If not, the page's readable text goes on to `build` | No |
| `build` | Text from `read`, a paste, or a page with no structured data | Fills the shared `RecipeDraft` from the text | Text |
| `details` | Every draft that came from a model, and Phase 1's drafts where the rules left lines unread | Reads the ingredient lines the rules could not; links ingredients and stated times to steps; suggests organizers | Text, once |
| `translate` | A draft not in the household's language, when asked for | Rewrites the draft's text in that language | Text |

- **Each stage is safe to run twice.** It reads the job's `work`, does its one thing, and writes the result. A message delivered twice runs a stage whose result is already there and overwrites it with the same.
- **Retries are per stage.** A failed model call retries that stage, not the whole import, so a card is not read again because organizing failed. The existing attempt count, back-off and dead-letter path apply.
- **Batch size.** The import queue's `max_batch_size` dropped from 10 to 2 in T2.2, so that two slow model calls were the most one invocation waited for. The first real cards showed what that cost: the jobs of a batch ran one after the other, and the queue adds consumers only between batches, so the cards of one sitting waited for each other. Since then the jobs of a batch run side by side and a batch holds four.
- **A photo import with two photos** makes one job, not two. The cook says which photos are one card when capturing them.

### 4.2 The model runner

- One module, `apps/worker/src/ai/`, is the only code that calls a model. It takes a task, a prompt, the input and a JSON Schema, runs the model set for that task through the gateway, validates the answer with Zod, and classifies failures as worth retrying (timeouts, rate limits, 5xx) or not (a retired model, a refusal, an answer that is not the schema twice running).
- Handlers get it as `tools.ai`, beside `tools.fetch`. Nothing else may use `env.AI`.
- **Tasks and settings.** A task is one of `read`, `build`, `details`, `translate`. A **profile** names a model for each task. Profiles are in code (`ai/profiles.ts`); which profile is in use is one setting, `AI_PROFILE`, with a default. As built there are three: `standard`, the default, which shows pictures to Gemma 4 and gives text to Qwen 3.8; and `gemma` and `qwen`, one model throughout, for the comparison in T2.11. A setting that names no profile fails every call, and the owner's check says so; it is not quietly replaced by the default. A job records the profile, the models and the prompt version it ran with, so two runs can be compared.
- **Prompts** are this project's own words, in one file, each with a version. Nothing is copied from Mealie.

### 4.3 Failures the list can explain

New codes for a failed import, each with plain words in `ImportRow.tsx`: `too_thin` (there was not enough to make a recipe from), `unreadable` (nothing could be read from the photo), `ai_unavailable` (the model could not be reached after retries; trying again later may work), `ai_limit` (today's allowance for AI imports is used up). As built, two more: `ai_answer` (the model's answer could not be used, twice running, or it declined) and `ai_setup` (the model is gone, or a setting is wrong).

## 5. The rules every AI step follows

These come from the build plan's pipeline and its first risk ("AI invents quantities or steps"). They are the acceptance checks' backbone.

1. **Nothing is invented.** A prompt forbids it, and code checks it. After `build`, every ingredient line and step is compared with the text it was built from. Words that are not in the source are not silently accepted: the line is kept and marked as a doubt for review. After `details`, a quantity, unit or food the model read from a line must appear in that line, or that field is dropped and the line stays as written. A duration must be stated in its step. This is the Phase 1 parser's rule, applied to a model: a wrong reading is worse than none.
2. **Too little is an answer.** A source with no recipe in it fails with `too_thin`. It is not padded out.
3. **The original text is kept.** An ingredient line keeps what the card says in `originalText`, as in Phase 1. The whole text a draft was built from is kept with the import and shown in review.
4. **Doubt is said, not hidden.** The model is asked to say where it was unsure: a smudge, a struck-through amount, two readings. Each doubt is listed at the top of review and marked on its line with the word "check", as missing parts are today. The feature spec already asks for this ("Phase 2's review should flag marks like this, not pick silently").
5. **Organizers come from the household's own.** The model is given the existing categories, tags and tools and may only choose among them. Its answer is checked against that list in code. It never creates one.
6. **Units and foods are matched by the existing code.** The model gives names; `draftToInput()` matches them to the household's lists exactly as it does for a link today, and a food the household lacks rides on the line as a new food for the cook to confirm at save.
7. **A person confirms.** Unchanged: nothing is a recipe until Save in review.

## 6. Changes to the data model and the shared schema

All additive. Nothing here rebuilds a table.

| Change | Where | Why |
| --- | --- | --- |
| `import_jobs.work` (TEXT, JSON, nullable) | One migration | What a staged import has gathered so far: the text read from photos, the profile and prompt versions, what each model call cost |
| `import_jobs.review` (TEXT, JSON, nullable) | Same migration | Written when the cook saves: how much the saved recipe differs from the draft ([§8](#8-testing-cost-and-privacy)) |
| `ImportResult.sourceText` | Shared schema | The text the draft was built from, for the review screen. Null for a link read from structured data |
| `ImportResult.readBy` | Shared schema | `structured-data` or `ai`, so review can say which |
| `RecipeDraft.doubts` | Shared schema | A list of `{ where, why }`, plain strings, so the draft stays exportable to JSON Schema. `where` names a part: `title`, `ingredient:3`, `step:2` |
| `DraftIssue` gains `doubt` | Shared schema | `checkDraft()` turns doubts, and words not found in the source, into issues the review screen already knows how to show |
| `POST /imports` takes `{ kind: "text", text }` and `{ kind: "photo", photos: [assetId, …], card }` | API | A paste, capped at 50,000 characters; and one photographed card: its photos, already uploaded with `POST /assets`, front first, and its place in the sitting. One request and one job per card (as built in T2.6; the plan first had a whole sitting in one request) |
| `ImportJob.card` | Shared schema | A photographed card's place in its sitting, counted from one, so that the list can say which paper card a row is. Kept in the job's input; no column |
| `POST /ai/ingredients` | API | Reads lines the rules could not, for the editor ([§7](#7-screens)). The Phase 4 Mealie-compatible parser endpoint will call the same code |
| `LIMITS.cardPhotos` = 4, `LIMITS.pastedText` = 50,000 | Shared schema | A card has a front and a back, sometimes a second card stapled on |

Step durations and the ingredients each step uses need no change: `recipe_steps.duration_seconds` and `ingredient_refs` have existed since Phase 0, and `DraftStep` already carries them.

## 7. Screens

New surfaces go through the design workflow the project uses: a brief, mock screens under `/mock` drawn from fixtures, and the owner's review on a phone, before they are connected.

- **Capturing cards (new).** Reached from Add, "From photos". On a phone it opens the camera. Each card is a short row: its front, then "Add the back" or "Next card". The sitting can be reviewed before sending: a card can be removed or its sides swapped. "Import 12 cards" sends them. Photos are made smaller on the device as they are today, and nothing is sent until that button. This screen decides how fast a tin of cards goes in, so it is designed and reviewed first (T2.5).
- **The list.** A sitting of cards shows as rows, like link imports, each with where it has got to: "Reading the card", "Writing it up", "Ready to review". No new design; new words.
- **Review.** Already shows the original beside the draft. For a card, the original is its photos; for a paste, the pasted text. A line at the top says the draft was written by AI from the card. Doubts join the list of things to check. "Next card" after Save goes to the next import waiting for review, so twenty cards are not twenty trips to the list.
- **Add.** A third way in beside typing and a link: "Paste text".
- **The editor's steps.** A step can show the ingredients it uses and its time, and the cook can correct them. Today the editor does not show either. This is a real addition to the hardest screen and gets its own brief (T2.9).
- **Cook mode.** Each step shows its ingredients, with amounts at the current scale, and its stated time. No timers; they stay out, as the feature spec says.
- **The editor's ingredient lines.** A line the rules could not read, marked "as written", gains "Read with AI". It is asked for, never automatic, and the result can be undone.

The feature spec is updated in the pull request that builds each of these.

## 8. Testing, cost and privacy

**Tests never call a model.** Workers AI has no local version, and CI has no Cloudflare credentials.

- Every stage is tested with a stand-in for `tools.ai` that returns what a model might: a good draft, a draft with an invented line, an answer that is not the schema, a timeout.
- The rules in [§5](#5-the-rules-every-ai-step-follows) are code, so they are unit-tested hard: invented lines are flagged, a quantity not in the line is dropped, an organizer not in the list is refused.
- The end-to-end run uses a scripted stand-in, switched on by a setting that the dev provider's rule also guards: it is refused off localhost.
- Fixtures are invented text, as in Phase 1. No photograph of a household card and no text copied from a site or a book goes into the repository.

**What a model is actually like is measured, not unit-tested.**

- When a cook saves a reviewed import, the app records how far the saved recipe is from the draft: whether the title changed, and how many ingredient lines and steps were changed, added or removed. That number is "minor fixes", per card.
- The owner can run an import again with another profile, on staging, and compare. T2.11 does this for twenty real cards, handwritten ones included, as the build plan decided. The photos stay in the staging bucket; they never enter the repository.
- The gate uses the same record: twenty cards on production, each saved with few enough changes. This plan proposes "few enough" as at most three lines or steps changed per card, with no ingredient amount wrong in the draft that review did not flag. The owner sets the number ([§9](#9-decisions-for-the-owner)).

**Cost is capped twice.** The gateway gets a monthly spend limit, set in the dashboard and written up in `docs/operations.md`. The app counts AI imports per day and stops at a limit with `ai_limit`. T2.13 replaces the build plan's estimate with a measured cost per card.

**Privacy.**

- Workers AI models run on Cloudflare. A model from another provider, reached through the gateway, means a photo of a family card and its text go to that provider.
- AI Gateway can keep each request and answer in its logs. For this app that would be photos of the household's cards.
- Both are the owner's call ([§9](#9-decisions-for-the-owner)). The defaults are the cautious ones.

## 9. Decisions for the owner

Each has a default. Saying nothing accepts the defaults.

| # | Decision | Default |
| --- | --- | --- |
| 1 | **Start Phase 2 before the Phase 1 gate has passed?** The build plan says a phase ends when its gate passes | Planning now; no Phase 2 code until the gate has been run, or the owner says to go ahead without it. **Decided 23 Nov 2026: go ahead with T2.1 to T2.5** |
| 2 | **May card photos go to a model outside Cloudflare** if Workers AI's models read handwriting badly? | No, until T2.11's comparison shows the difference. Then the owner is shown the numbers and asked |
| 3 | **Should AI Gateway keep requests and answers in its logs?** They are useful for tuning prompts, and they are photos of family cards | Keep the record of each call (model, time, cost) and not its content |
| 4 | **Where the model setting lives.** A setting in the deploy configuration means a deploy to change it. A settings screen is more work and is planned for Phase 6 | The deploy configuration |
| 5 | **Organizers a model suggests: ticked, or offered?** Phase 1 ticks the ones a page names that the household already has | Offered, not ticked. A page names its own category; a model is guessing |
| 6 | **What counts as "minor fixes" at the gate** | At most three lines or steps changed per card, and no wrong amount that review did not flag |
| 7 | **Translation.** Into which language, and is the untranslated text kept on the recipe? | English. Kept as a note on the recipe, which the cook can delete |
| 8 | **Daily and monthly limits** | 100 AI imports a day; a gateway spend limit of $5 a month |
| 9 | **"Read with AI" on a typed line: is it wanted?** It is the only place a model is used outside an import | Yes, as an action the cook asks for |

Two things only the owner can do, both in T2.11: photograph twenty cards on staging, and review them.

## 10. Task list

Each task is one pull request with its ID in the title. Hours are estimates and sum to about 47, inside the roadmap's 35 to 60 less the 5 hours that moved to Phase 1 with the rule-based parser. "Needs you" marks a step in the Cloudflare dashboard, a decision, or a review on a phone.

| ID | Task | Acceptance checks | Hours |
| --- | --- | --- | --- |
| T2.1 | **AI plumbing** (needs you, for the dashboard). The `AI` binding in both configurations; the gateway; the model runner in `apps/worker/src/ai/` with profiles, validation and failure classes; `tools.ai`; `docs/operations.md` gains the gateway, its spend limit and its log setting | The unverified items in [§2](#2-what-was-checked-and-what-it-changed) are each confirmed or corrected in this plan; CI passes with no Cloudflare credentials; both deploy dry runs pass; an owner-only check on staging runs one small prompt and says which model answered; a retired model fails as "not worth retrying" | 4 |
| T2.2 | **Staged import jobs.** The `work` and `review` columns; a handler can answer "next stage"; per-stage retries; the smaller batch size; the daily limit | A job moves through three stages and lands in review; a message delivered twice at any stage changes nothing; a stage that fails retries alone; the limit fails a job with `ai_limit`; Phase 1's link import behaves as before | 3 |
| T2.3 | **A draft from pasted text.** `text` imports; the `build` stage; the checks against inventing; `sourceText`, `readBy` and doubts in the schema; "Paste text" on Add; the pasted text as the original in review | With a stand-in model: a good answer lands in review with its text beside it; an invented line is kept and flagged; a source with no recipe fails with `too_thin`; an answer that is not the schema is tried once more and then fails clearly. On staging, with a real model: three recipes pasted from different kinds of source land in review | 5 |
| T2.4 | **A link with no structured data.** The page's readable text goes to `build`; the bookmark sends the page's text when it finds no structured data | A page with a recipe in plain text lands in review, marked as read by AI; a page with no recipe fails with `too_thin`, not `no_recipe`; a page with structured data is still read without a model | 2 |
| T2.5 | **Capture screen design** (needs you). Brief, mock screens for capturing a sitting of cards, and the import rows' new words | The owner has gone through the mock on an iPhone and an Android phone: one-sided cards, two-sided cards, a wrong photo removed, sides swapped, twelve cards in a sitting | 3 |
| T2.6 | **Photo import.** `photo` imports; the `read` stage; the capture screen connected; the photos kept as the recipe's original card; "Next card" in review | With a stand-in model: a two-sided card becomes one draft, front before back, with both photos beside it in review and on the saved recipe; a blank photo fails with `unreadable`. On staging, with a real model: five printed cards and five handwritten ones each land in review | 7 |
| T2.7 | **Ingredient lines the rules cannot read.** The `details` stage's first job; `POST /ai/ingredients`; "Read with AI" in the editor | A line the rules read is never sent to a model; a model's reading is dropped, field by field, where it is not in the line; names are matched by `draftToInput()` and nothing is created; the editor's action can be undone | 3 |
| T2.8 | **Organizer suggestions.** The `details` stage's second job, from the household's own list | A suggestion not in the household's list is refused in code; suggestions appear in review as offered, not ticked; a household with no organizers gets none and no model call is made for them | 2 |
| T2.9 | **Step details** (needs you, for the design). Rules in the shared package for stated times and for ingredients a step names; the model only where the rules find nothing; the editor shows and corrects them; cook mode shows them | The brief and mock are approved; a time is taken only when the step states it; an ingredient is linked only when the step names it; the cook can add and remove a link in the editor on a phone; cook mode shows a step's ingredients at the current scale; a recipe typed in Phase 1 is unchanged until its steps are edited | 6 |
| T2.10 | **Translate on import.** Asked for per import; the `translate` stage; the untranslated text kept as the owner decides | A recipe in another language arrives in the household's language with its amounts unchanged, checked in code; one already in the household's language is not sent to be translated | 2 |
| T2.11 | **Review record and model comparison** (needs you). The record written at save; running an import again with another profile, owner-only and on staging; a plain report; twenty real cards compared | The record matches hand-counted changes on test recipes; the owner has photographed and reviewed twenty cards on staging, handwritten ones among them; the report shows changes per card for at least two profiles; the default profile is chosen from it and written into this plan with the numbers | 5 |
| T2.12 | **End-to-end and accessibility.** The capture screen and the changed screens join the accessibility check; one browser run of a card import with the scripted stand-in | The run is in CI and takes a sitting of two cards to two saved recipes; no blocking accessibility findings on the new and changed screens in either theme | 2 |
| T2.13 | **Cost and limits, measured** | The cost of importing one card, in Neurons and in dollars, is measured from the gateway for the chosen profile and replaces the build plan's estimate in this plan; the spend limit and the daily limit are shown to stop a run | 1 |
| T2.14 | **Gate run** (needs you) | Twenty paper cards photographed on production by the people who will use it. Each is saved with changes inside the limit the owner set. Every workaround is written down as an issue. The app is then **usable**, in the build plan's word | 2 plus fixes |

**As built.**

- **T2.1** is built. Checked: the Worker tests (a stand-in for the binding), the end-to-end run and both deploy dry runs pass with no Cloudflare credentials; a retired model, by its error code, fails as not worth retrying; the items of [§2](#2-what-was-checked-and-what-it-changed) are each confirmed or corrected there. Not checked, because it needs the deployed Worker and the owner: the check on staging itself. It is the "Check the AI connection" button on the `/mock` page, which asks one small question and says which model answered; `docs/operations.md` gives the steps, including asking the retired model. The gateway's spend limit is a dashboard step for the owner, in the same place.

- **T2.2** is built: see "As built in T2.2" in [the first plan's import section](implementation-plan.md#72-rules). Checked, with handlers and a model that are stand-ins: a job moves through three stages and lands in review; a message delivered twice at any stage, one after the other or at once, changes nothing; a stage that fails is retried alone, and "Try again" takes up at that stage; the daily limit fails a job with `ai_limit` before any model is asked; Phase 1's link import passes its tests unchanged. The plan gave three failure codes for a model; as built there are four, `ai_setup` being the one for a model that is gone or a setting that is wrong, which only whoever looks after the app can fix.
- **T2.3** is built. Checked with a stand-in for the model: a good answer lands in review with its text beside it and a line saying a model wrote it; a line with a word the text does not have is kept and flagged, on its row and in the list of things to check; text with no recipe fails with `too_thin`; an answer that is not the shape asked for is asked for once more and then fails with `ai_answer`. Also run in a browser, from the Add page through the queue to a saved recipe, with the scripted stand-in. **Not checked: a real model.** That is the owner's on staging: paste three recipes from different kinds of source and see each land in review ([operations](operations.md)). How it differs from the plan:
  - *The model is not handed `RecipeDraft` to fill.* It is asked for a plainer shape (`Reading`, in `imports/build.ts`): the title, the ingredient lines and the steps as written, with a place on each line to say what it was unsure of, and yield and times in the text's own words. Code turns that into a `RecipeDraft`, as the link importer turns JSON-LD into one, and the result is validated as a `RecipeDraft`. The reason is rule 1: the less a model has to work out, the less it can invent. Amounts, units and foods are read from each line afterwards by the same rules as a typed line (rule 6), and a time is read from its words by `readStatedDuration()` in the shared package, which reads only a plain time and nothing from a range.
  - *What the check against inventing does* (`imports/sourceCheck.ts`). It compares words, not characters, so bullets, step numbers, line breaks and capitals make no difference. An ingredient line must be in the text word for word, in order; a step, a title, a description and a note may be laid out differently but may not have a word the text lacks. A line that fails is kept and gets a doubt. A yield, a time, a source or a section heading the text does not state is dropped, since there is then nothing to check.
  - *The stand-in of [§8](#8-testing-cost-and-privacy)* is `apps/worker/src/ai/standIn.ts`, switched on by `AI_MODE=stand-in`. `pnpm dev` (through `.dev.vars`) and the end-to-end run use it. The deploy script never passes the setting on, and a request that is not to localhost is refused it. A queue run has no address to check, so there the setting alone decides.
- **T2.4** is built: see "As built in T2.4" in [the first plan's import section](implementation-plan.md#73-the-url-handler). Checked with a stand-in for the model: a page with a recipe in plain text lands in review, marked as read by AI, with the page's words beside it; a page with words and no recipe fails with `too_thin`, not `no_recipe`; a page with structured data is read with no model asked. The bookmark sending a page's words was run in a browser, from the page to a saved recipe, with the scripted stand-in. Not checked: a real model on a real page, which is the owner's on staging, by importing a link to a recipe page that has no recipe data.
- **T2.5** is designed and built as a mock: the brief is `apps/web/.impeccable/surfaces/src-pages-capture-capturescreen-tsx.md`, the screen is `apps/web/src/pages/capture/CaptureScreen.tsx`, and it is drawn at `/mock/capture`, where "Next card" and "Add the back" open a phone's camera and a photo taken stays on the device. `/mock/list` has a "Cards coming in" scene for the import rows' new words, and `/mock/add` has "From photos". The real Add page does not offer it until T2.6 connects it. **Not done: the owner's walk through it on an iPhone and an Android phone**, which is this task's acceptance check: one-sided cards, two-sided cards, a wrong photo removed, sides swapped, twelve cards in a sitting. What the design adds to the plan: "Retake" for one side, joining a photo chosen from the device to the card before it as its back, and a limit of 30 cards to a sitting. What it leaves open is in the brief's "Unresolved".
- **T2.6** is built. Checked with a stand-in for the model, in the Worker tests and in a browser from the Add page to two saved recipes: a two-sided card becomes one draft, read front then back, with both photos beside it in review and on the saved recipe as its original card; a card with nothing written on it fails with `unreadable`; a second try of the writing-up does not read the card again; a sitting of two cards is reviewed in turn with "Save and next card". **Not checked: a real model on a real card.** That is the owner's on staging: five printed cards and five handwritten ones, each landing in review ([operations](operations.md)). It is also the first time a picture is sent to a model at all, so whether the models take the pictures as sent is found out there. How it differs from the plan:
  - *One card to a request.* The page sends a card's photos and then `POST /imports` for that card, and goes on to the next. A connection that drops half way through a sitting leaves the cards already sent on the list and the rest in the pile, with nothing to undo, which one request for the whole sitting could not do.
  - *Two model calls to a card, not one.* `read` copies out what is written, side by side, and says which words it was unsure of (`CardReading` in `imports/photo.ts`); `build` is then the same code as for pasted text, so the check against invented words is the same check. What the reader was unsure of is carried in the job's `work` and put on the line or step that has those words (`doubtsAbout()`); what cannot be placed is said about the card.
  - *Which picture the model is shown.* [§2](#2-what-was-checked-and-what-it-changed) said the smaller size the app makes of every photo. As built, a JPEG or a PNG of up to 4 MB is shown as it was sent, since the phone has already made it no more than 2,560 pixels on its long side and a second shrinking only costs handwriting its sharpness; any other kind is shown in the app's own smaller size, and fails with `unreadable` where that could not be made.
  - *The card's photos are the import's from the start.* `POST /imports` attaches the uploaded photos to the job as `original` assets, in the order given, and refuses a photo that is missing, not a picture, given twice or already someone's. From there they follow the path every import picture does: the save hands them to the recipe, and removing the import deletes them.
  - *A fault found on the way.* `keepPicture()`, which stores the picture a link's page names, used to clear every asset of the job first. It now clears only an earlier cover, or it would have deleted a card's photos.
  - *A card's place in its sitting* is new: the T2.5 review found that a failed card could not say which card it was. The page sends each card's number, the list calls an untitled card by it, and after a sitting is partly sent the cards left in the pile keep their numbers.
  - *Still open, from the brief's "Unresolved".* The pile is held in the page's memory, not on the device. If a phone short of memory throws the page away while its camera is open, the pile is lost; whether that happens is for the owner's walk-through to show.
- **The owner's checks, 23 and 24 Nov 2026.** These close what the entries above list as not checked, except where said.
  - *T2.1:* "Check the AI connection" answered from the deployed app; the gateway's spend limit is set at $5 a month; and the gateway's log of a call shows its model, time and cost and nothing of what was asked or answered, so the request not to keep content is honoured through the binding.
  - *T2.3:* three pasted recipes each landed in review as written up by AI, as expected.
  - *T2.4:* three wiki pages with no recipe data each landed in review as written up by AI, one with a discrepancy in the page rightly flagged. A page of a site that answers apps with a page of script and no words failed with `no_recipe`, as designed. The bookmark was checked on a recipe site.
  - *T2.5:* the walk-through of the capture screen passed on an iPhone. **Not checked on an Android phone:** the owner has none.
  - *T2.6:* two photographed cards were read, reviewed and saved. The rest of the five is the next entry; the count of five printed and five handwritten is still to do.
- **The first real cards** (the owner, 24 Nov 2026). Photographed cards came through a real model, which settled that the models take the pictures as sent. But a sitting of five took over twenty minutes and one card failed: the reader was given up on after a minute and a half, four times running. Three things changed:
  - *The reader is waited for three minutes*, twice as long as other calls (`READ_TIMEOUT_MS` in `imports/photo.ts`). That alone was not enough: the next try of a two-sided card, two photos of 2,560 by 1,920, was given up on at three minutes exactly.
  - *The reader is told not to reason first.* The cause was in the model's own page: it reasons before it answers unless a request says otherwise (`chat_template_kwargs.enable_thinking`, on by default), and the app said nothing. The text model had been told to keep its reasoning low from the start; the picture model's switch has another name and was missed. The profile now sends it (`ai/profiles.ts`). Copying out what is written does not need reasoning; whether a hard hand reads worse without it is for the comparison in T2.11 to show. Not yet seen on a real card.
  - *The jobs of a batch run side by side*, four to a batch, as above.
  - *It worked.* The same card, two sides, was read in 5.6 seconds, writing 212 tokens where it had written 4,422 in 101 seconds. The whole card went from photo to review in 74 seconds.
  - *The writer is told the same.* With the reader quick, writing the draft up was nearly all of the wait: 53 seconds and 1,751 tokens for a draft of about 500, at the text model's lowest reasoning effort. Its page has the same switch, and the profile now sends it. Not yet measured on a real card, and whether a draft is worse for it is for T2.11.
  - *That worked too.* The same card again: the draft was written up in 13.5 seconds and 564 tokens, and the card went from photo to review in 25 seconds, where the first sitting had taken over twenty minutes. With the new instructions its title came without the card's printed label, the line and the step that run over the card's edge each came whole, and the misspelt word was copied and not flagged. That is one card, printed labels and a clear hand; the count of five printed and five handwritten is still to do.
  - *The writer's instructions changed* (`build-2`), for three things the first cards showed. A sentence that runs over the card's edge was sometimes made two ingredients or two steps: it is now said to be one. A card's printed labels ("A recipe for", "Ingredients") were copied into the title: they are now said not to be part of what follows them. And a misspelt word was flagged as a doubt, because the instructions asked for that: a doubt is now for what would leave a cook unsure what to do.
  - *A call that gave no answer is recorded too*, with how long it was waited for and the service's own words, and `GET /imports/{id}` shows a job's calls: the task, the model, the time, the tokens read and written, and how many of those written were reasoning. Nothing that was asked or answered is in them. Before this, nothing said why an import had been slow.
- **T2.7** is built. Checked with a stand-in for the model: a line the rules read is never sent to a model, in an import or from the editor; a reading is kept field by field, and an amount, a unit or a food that is not in the line is dropped; names are matched to the household's own and nothing is created; the editor's action is undone by "Keep as written". Also looked at in a browser at phone size, in both themes, with the mock's scripted reader. **Not checked: a real model on a real line**, which is the owner's ([operations](operations.md)). How it differs from the plan:
  - *Only a draft a model wrote goes on to `details`.* [§4.1](#41-stages) has it run for Phase 1's drafts too, where the rules left lines unread. As built, a link read from a page's own recipe data still reaches no model, which is what the import rules promise; "Read with AI" is there in review for any line of it. The stage is skipped altogether when the rules read every line.
  - *`details` cannot fail an import.* A draft is already written by then. When the model gives no answer, busy or unusable, the import goes to review with those lines as written, and the failed call is on the job's record. This is the one place a handler catches a model's failure.
  - *What "appears in that line" means* (`imports/details.ts`). An amount is kept only when it equals the one amount the line states: the first number in it, or a number spelt out, from "one" to "twelve", "half", "quarter" and "dozen". A line whose first amount opens a range or a choice ("4 to 6", "2-3", "2 or 3") states no one amount and gets none. A unit and a food must be in the line word for word, together and in order; a note may not have a word the line lacks.
  - *`POST /ai/ingredients`* takes up to 30 lines and answers with names, not IDs. The web app matches them with `matchReading()` in the shared package, which also finds a food written in the plural, so the editor and review match alike. A unit the household does not have is left out, not offered as new: units are made only in the unit picker.
  - *Review marks what a model read.* Each such line is marked "check", and one sentence says how many there are. The draft itself carries no new field for it: a line with structured parts that the rules cannot read is one a model read.
- **T2.8** is built. Checked with a stand-in for the model: a name that is not on the household's lists is refused in code, and one from another kind's list with it; suggestions arrive in review offered, with none chosen; a household with no organizers gets none and no model is asked about them. Also looked at in a browser at phone size. **Not checked: a real model**, which is the owner's ([operations](operations.md)). How it differs from the plan:
  - *It is asked beside `build`, not in `details`.* The question is put at the same moment as the one that writes the recipe up, from the same text, so it adds nothing to the cook's wait; `details` would have added a stage to every import. It is a second call, where [§4.1](#41-stages) has one call do all of `details`. It is recorded under the `details` task with its own prompt version, `organize-1`.
  - *It cannot fail an import*, like the reading of lines: with no answer, the draft arrives with no suggestions.
  - *How many.* The model is shown up to 150 names of each kind and may be given two categories, four tags and four tools at most (`imports/organizers.ts`).
  - *Offered, not chosen, is decided in review* by who wrote the draft (`draftToInput()` with `organizers: "offer"`), so the draft's shape did not change: the same three lists of names are a page's own when the page stated the recipe, and a model's guesses when a model wrote it.
- **The deploy token** needs no new permission. The staging deploy that followed T2.1, on 23 Nov 2026, uploaded the Worker with its `AI` binding using the token as it was.

Suggested order: T2.1 and T2.5 first, since both wait on the owner. Then T2.2 to T2.4, which give a working import with no camera in the way. Then T2.6, T2.7 and T2.8. T2.11 as soon as cards can be imported, because its result decides the models every later task is judged with. T2.9 and T2.10 can follow the gate if time is short: neither is in the gate's twenty cards.
