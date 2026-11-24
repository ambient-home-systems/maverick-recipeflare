import {
  CompareRequest,
  type CompareResponse,
  draftText,
  Id,
  type ImportDetail,
  type ImportJob,
  type ImportListResponse,
  type ImportReport,
  ImportRequest,
  looksEnglish,
  SENT_PAGE_LIMITS,
} from "@recipeflare/schema";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AI_PROFILES } from "../ai";
import type { AppEnv } from "../auth/types";
import { assetsOfImport } from "../db/assets";
import {
  createImportJob,
  createPhotoImportJob,
  deleteImportJob,
  failImportJob,
  importCalls,
  importReport,
  listOpenImportJobs,
  loadImportJob,
  recipeFromLink,
  requeueForTranslation,
  requeueImportJob,
  startComparisons,
} from "../db/importJobs";
import { errorBody, invalid, jsonBody, notFound } from "../http";
import type { ImportMessage } from "../imports/runner";
import { removeAssets } from "../media";

/**
 * Puts a job on the queue. Saving the job and sending its message are two
 * steps; if the send fails the job is marked failed and returned as it is, so
 * the app shows it and offers to try again.
 */
async function enqueue(c: Context<AppEnv>, job: ImportJob): Promise<ImportJob> {
  try {
    const message: ImportMessage = { jobId: job.id, stage: job.stage };
    await c.env.IMPORT_QUEUE.send(message);
    return job;
  } catch (error) {
    console.error("import: could not queue a job", error);
    await failImportJob(c.env.DB, job.id, {
      code: "not_queued",
      message: "The import could not be started. Try again.",
    });
    return (await loadImportJob(c.env.DB, job.id)) ?? job;
  }
}

/** A link is a line of text. A page sent from a browser is its JSON-LD, and pasted text is text: both are capped. */
const importBody = bodyLimit({
  maxSize: 2 * 1024 * 1024,
  onError: (c) => c.json(errorBody("too_large", "That page is too large to import"), 413),
});

const idParam = (c: Context) => Id.safeParse(c.req.param("id")).data ?? null;

/**
 * Whether saved imports may be run again under another profile here. It is a
 * setting, switched on for staging: every run asks a model and is billed, and
 * what it measures is the models, not the household's cooking.
 */
const comparingIsOn = (c: Context<AppEnv>) => c.env.AI_COMPARE?.trim().toLowerCase() === "on";

/** `/api/v1/imports`. */
export const importRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const body: ImportListResponse = { items: await listOpenImportJobs(c.env.DB) };
    return c.json(body);
  })
  .post("/", importBody, jsonBody(ImportRequest), async (c) => {
    const request = c.req.valid("json");
    if (request.kind === "photo") {
      const job = await createPhotoImportJob(
        c.env.DB,
        request.photos,
        c.get("member").id,
        request.card,
      );
      if ("refused" in job) {
        return invalid(c, [{ path: ["photos"], message: job.refused }]);
      }
      return c.json(await enqueue(c, job), 202);
    }
    if (request.kind === "text") {
      const job = await createImportJob(
        c.env.DB,
        { kind: "text", sourceUrl: null, input: { text: request.text } },
        c.get("member").id,
      );
      return c.json(await enqueue(c, job), 202);
    }
    const page = request.page
      ? { siteName: request.page.siteName, blocks: request.page.blocks, text: request.page.text }
      : undefined;
    if (page && page.blocks.join("").length > SENT_PAGE_LIMITS.totalLength) {
      return invalid(c, [
        { path: ["page", "blocks"], message: "That page is too large to import" },
      ]);
    }
    const job = await createImportJob(
      c.env.DB,
      { kind: request.kind, sourceUrl: request.url, input: { url: request.url, page } },
      c.get("member").id,
    );
    // 202: the import has been taken on, not done.
    return c.json(await enqueue(c, job), 202);
  })
  // How each saved import was changed in review, and how other profiles did on the same cards.
  .get("/report", async (c) => {
    const mayCompare = comparingIsOn(c) && c.get("member").role === "owner";
    const body: ImportReport = {
      cards: await importReport(c.env.DB),
      compareWith: mayCompare ? Object.keys(AI_PROFILES) : [],
    };
    return c.json(body);
  })
  // Runs the saved cards again under one profile. The owner's, and only where it is switched on.
  .post("/compare", jsonBody(CompareRequest), async (c) => {
    if (!comparingIsOn(c)) {
      return c.json(errorBody("compare_off", "Comparing models is not switched on here"), 403);
    }
    if (c.get("member").role !== "owner") {
      return c.json(errorBody("owner_only", "Only the household's owner can compare models"), 403);
    }
    const { profile } = c.req.valid("json");
    if (!Object.hasOwn(AI_PROFILES, profile)) {
      return invalid(c, [{ path: ["profile"], message: "There is no AI profile of that name" }]);
    }
    const { jobs, waiting } = await startComparisons(c.env.DB, profile, c.get("member").id);
    for (const job of jobs) {
      await enqueue(c, job);
    }
    const body: CompareResponse = { started: jobs.length, waiting };
    return c.json(body, 202);
  })
  .get("/:id", async (c) => {
    const id = idParam(c);
    const job = id ? await loadImportJob(c.env.DB, id) : null;
    if (!job) {
      return notFound(c);
    }
    // Review warns when the household already has a recipe from this link.
    const body: ImportDetail = {
      ...job,
      duplicate: job.sourceUrl ? await recipeFromLink(c.env.DB, job.sourceUrl) : null,
      assets: await assetsOfImport(c.env.DB, job.id),
      // What each model call took, so that a slow or failed import can be explained.
      calls: await importCalls(c.env.DB, job.id),
    };
    return c.json(body);
  })
  .post("/:id/retry", async (c) => {
    const id = idParam(c);
    const job = id ? await requeueImportJob(c.env.DB, id) : null;
    // Only a failed import can be tried again.
    return job ? c.json(await enqueue(c, job), 202) : notFound(c);
  })
  // Asked for in review, of a draft that is not in English. One that is, is not sent.
  .post("/:id/translate", async (c) => {
    const id = idParam(c);
    const waiting = id ? await loadImportJob(c.env.DB, id) : null;
    const draft = waiting?.status === "needs_review" ? waiting.result?.draft : undefined;
    if (!id || !waiting || !draft) {
      return notFound(c);
    }
    const words = draftText(draft);
    if (looksEnglish(words)) {
      return c.json(errorBody("already_english", "This recipe is already in English"), 409);
    }
    // What the draft was made from is what review shows beside it. A draft
    // read from a page's own data has no such text: its own words stand in.
    const job = await requeueForTranslation(c.env.DB, id, waiting.result?.sourceText || words);
    return job ? c.json(await enqueue(c, job), 202) : notFound(c);
  })
  .delete("/:id", async (c) => {
    const id = idParam(c);
    if (!id) {
      return notFound(c);
    }
    // What the import brought and no recipe took goes with it.
    const pictures = (await assetsOfImport(c.env.DB, id)).map((asset) => asset.id);
    if (!(await deleteImportJob(c.env.DB, id))) {
      return notFound(c);
    }
    await removeAssets(c.env, pictures);
    return c.body(null, 204);
  });
