import { Id, type ImportJob, type ImportListResponse, UrlImportRequest } from "@recipeflare/schema";
import { type Context, Hono } from "hono";
import type { AppEnv } from "../auth/types";
import {
  createImportJob,
  deleteImportJob,
  failImportJob,
  listOpenImportJobs,
  loadImportJob,
  requeueImportJob,
} from "../db/importJobs";
import { jsonBody, notFound } from "../http";
import type { ImportMessage } from "../imports/runner";

/**
 * Puts a job on the queue. Saving the job and sending its message are two
 * steps; if the send fails the job is marked failed and returned as it is, so
 * the app shows it and offers to try again.
 */
async function enqueue(c: Context<AppEnv>, job: ImportJob): Promise<ImportJob> {
  try {
    const message: ImportMessage = { jobId: job.id };
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

const idParam = (c: Context) => Id.safeParse(c.req.param("id")).data ?? null;

/** `/api/v1/imports`. */
export const importRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const body: ImportListResponse = { items: await listOpenImportJobs(c.env.DB) };
    return c.json(body);
  })
  .post("/", jsonBody(UrlImportRequest), async (c) => {
    const request = c.req.valid("json");
    const job = await createImportJob(
      c.env.DB,
      { kind: request.kind, sourceUrl: request.url, input: { url: request.url } },
      c.get("member").id,
    );
    // 202: the import has been taken on, not done.
    return c.json(await enqueue(c, job), 202);
  })
  .get("/:id", async (c) => {
    const id = idParam(c);
    const job = id ? await loadImportJob(c.env.DB, id) : null;
    return job ? c.json(job) : notFound(c);
  })
  .post("/:id/retry", async (c) => {
    const id = idParam(c);
    const job = id ? await requeueImportJob(c.env.DB, id) : null;
    // Only a failed import can be tried again.
    return job ? c.json(await enqueue(c, job), 202) : notFound(c);
  })
  .delete("/:id", async (c) => {
    const id = idParam(c);
    if (!id || !(await deleteImportJob(c.env.DB, id))) {
      return notFound(c);
    }
    return c.body(null, 204);
  });
