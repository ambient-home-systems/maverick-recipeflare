# Maverick Recipeflare — Implementation Plan (Phase 2: AI import)

23 Nov 2026. Companion to the [build plan](build-plan.md), which stays the source of truth for scope, architecture, roadmap and decisions, and to the [implementation plan for Phases 0 and 1](implementation-plan.md), whose data model, shared schema, import jobs and rules this builds on. This document turns Phase 2 into buildable work.

**Nothing in this plan is built.** It is a proposal for the owner to review. Section 9 lists what the owner has to decide; each has a default, so that work can start once the plan is approved.

**Phase 1 is not finished.** It is built through T1.15, and its gate, T1.16 (ten family recipes entered on production without workarounds), has not been run. The build plan says a phase ends when its gate passes. Whether Phase 2 work starts before that is the first decision in section 9.

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

Read from the live Cloudflare docs on 23 Nov 2026 through a documentation search. The pages themselves could not be opened from the build environment, so each fact below is as the search reported it, and T2.1 confirms the ones the plan leans on against a real deploy.

| Fact | Source | Effect on this plan |
| --- | --- | --- |
| Workers AI JSON mode takes `response_format` with a JSON Schema, in OpenAI's shape. The model is not guaranteed to comply: it can fail with "JSON Mode couldn't be met". No streaming | [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) | Every model answer is validated in code with the shared schema. A failure to produce JSON is tried once more and then fails the job with a code the list explains ([§4](#4-how-an-ai-import-runs)) |
| Which models support JSON mode is listed per model in the catalog, not on the JSON mode page | Same page | A model is only eligible for a task if T2.1 or T2.11 has seen it return the schema |
| Twenty-four Workers AI models stopped answering on 20 Nov 2026 (HTTP 410). The list includes older Llama, Gemma and vision models. Suggested replacements include Gemma 4 26B, Qwen 3.8 27B, DeepSeek V4.1 Flash and GLM-5.3 | [Planned model deprecations](https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/) | Model names in the build plan are out of date ([§3](#3-conflicts-with-the-build-plan)). No model ID is written into this plan as a decision; they are settings, chosen by the comparison in T2.11 |
| Current models that take images include Gemma 4 26B, Qwen 3.8 27B, DeepSeek V4.1 Flash and Moondream 3.1. Some models now need the Workers Paid plan | [Workers AI changelog](https://developers.cloudflare.com/changelog/product/workers-ai/), [models that require Workers Paid](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/) | These are the candidates for reading cards. The household's account needs Workers Paid, which the build plan already assumes |
| The Workers AI binding takes a gateway in its third argument: `env.AI.run(model, input, { gateway: { id } })` | [AI Gateway Worker bindings](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/) | One code path for every model. Logs, caching and spend limits come from the gateway |
| Through AI Gateway's Unified Billing, the same binding can call OpenAI, Anthropic and Google models from prepaid credits, with no provider keys. A gateway can have spend limits by model or provider | [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/), [changelog](https://developers.cloudflare.com/changelog/post/2026-08-07-workers-ai-unified-billing/) | The build plan's "frontier model for handwriting" needs no new secret and no second client: it is a different model ID in a setting |
| Workers AI has no local simulation. The binding always calls the real service, and bills for it, in `wrangler dev` and in tests | [Local development](https://developers.cloudflare.com/workers/development-testing/), [bindings per mode](https://developers.cloudflare.com/workers/development-testing/bindings-per-env/) | Tests and the end-to-end run never touch the binding. Every AI step takes its model runner as a tool, as importers take `fetch`, and tests hand it a stand-in ([§8](#8-testing-cost-and-privacy)) |
| A queue consumer gets 15 minutes of wall time per invocation. CPU time is 30 seconds by default and can be raised; time waiting on a model is not CPU time | [Queues limits](https://developers.cloudflare.com/queues/platform/limits/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) | An import is split into stages, one model call each, and the import queue's batch size drops so that one slow batch cannot run out of wall time ([§4](#4-how-an-ai-import-runs)) |
| Workers AI: 10,000 Neurons a day free, then $0.011 per 1,000 | [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) | Unchanged from the build plan. T2.13 measures what an import really costs |

**Not verified, and settled by T2.1 before anything depends on it:**

- The exact model IDs available to this account today, and which of them accept an image and a JSON Schema in one call.
- How an image is passed to each candidate (a URL, base64 or bytes) and how large it may be.
- Whether a Wrangler file with an `ai` binding lets the Worker tests and the end-to-end run start without Cloudflare credentials, as CI has none.
- Whether the deploy token needs a Workers AI permission it does not have.
- Whether Unified Billing is available on this account, and what the default gateway is called.

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
- **Batch size.** The import queue's `max_batch_size` drops from 10 to 2, so two slow model calls are the most one invocation waits for. Concurrency does the rest.
- **A photo import with two photos** makes one job, not two. The cook says which photos are one card when capturing them.

### 4.2 The model runner

- One module, `apps/worker/src/ai/`, is the only code that calls a model. It takes a task, a prompt, the input and a JSON Schema, runs the model set for that task through the gateway, validates the answer with Zod, and classifies failures as worth retrying (timeouts, rate limits, 5xx) or not (a retired model, a refusal, an answer that is not the schema twice running).
- Handlers get it as `tools.ai`, beside `tools.fetch`. Nothing else may use `env.AI`.
- **Tasks and settings.** A task is one of `read`, `build`, `details`, `translate`. A **profile** names a model for each task. Profiles are in code; which profile is in use is one setting, `AI_PROFILE`, with a default. A job records the profile, the models and the prompt version it ran with, so two runs can be compared.
- **Prompts** are this project's own words, in one file, each with a version. Nothing is copied from Mealie.

### 4.3 Failures the list can explain

New codes for a failed import, each with plain words in `ImportRow.tsx`: `too_thin` (there was not enough to make a recipe from), `unreadable` (nothing could be read from the photo), `ai_unavailable` (the model could not be reached after retries; trying again later may work), `ai_limit` (today's allowance for AI imports is used up).

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
| `POST /imports` takes `{ kind: "text", text }` and `{ kind: "photo", cards: [[assetId, …], …] }` | API | A paste, capped at 50,000 characters; and a sitting of cards, each a list of photos already uploaded with `POST /assets`. One job per card |
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
| 1 | **Start Phase 2 before the Phase 1 gate has passed?** The build plan says a phase ends when its gate passes | Planning now; no Phase 2 code until the gate has been run, or the owner says to go ahead without it |
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

Suggested order: T2.1 and T2.5 first, since both wait on the owner. Then T2.2 to T2.4, which give a working import with no camera in the way. Then T2.6, T2.7 and T2.8. T2.11 as soon as cards can be imported, because its result decides the models every later task is judged with. T2.9 and T2.10 can follow the gate if time is short: neither is in the gate's twenty cards.
