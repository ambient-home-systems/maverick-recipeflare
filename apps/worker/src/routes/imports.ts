import {
  Id,
  type ImportDetail,
  type ImportJob,
  type ImportListResponse,
  ImportRequest,
  SENT_PAGE_LIMITS,
} from "@recipeflare/schema";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "../auth/types";
import { assetsOfImport } from "../db/assets";
import {
  createImportJob,
  deleteImportJob,
  failImportJob,
  listOpenImportJobs,
  loadImportJob,
  recipeFromLink,
  requeueImportJob,
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

/** `/api/v1/imports`. */
export const importRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const body: ImportListResponse = { items: await listOpenImportJobs(c.env.DB) };
    return c.json(body);
  })
  .post("/", importBody, jsonBody(ImportRequest), async (c) => {
    const request = c.req.valid("json");
    if (request.kind === "text") {
      const job = await createImportJob(
        c.env.DB,
        { kind: "text", sourceUrl: null, input: { text: request.text } },
        c.get("member").id,
      );
      return c.json(await enqueue(c, job), 202);
    }
    const page = request.page
      ? { siteName: request.page.siteName, blocks: request.page.blocks }
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
    };
    return c.json(body);
  })
  .post("/:id/retry", async (c) => {
    const id = idParam(c);
    const job = id ? await requeueImportJob(c.env.DB, id) : null;
    // Only a failed import can be tried again.
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
