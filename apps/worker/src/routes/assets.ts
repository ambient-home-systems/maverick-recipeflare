import { AssetUploadQuery, AssetVariant, Id, LIMITS } from "@recipeflare/schema";
import { Hono } from "hono";
import type { AppEnv } from "../auth/types";
import { loadAssetForServing } from "../db/assets";
import { errorBody, notFound, queryParams } from "../http";
import {
  assetKey,
  isPicture,
  readCapped,
  storeAsset,
  sweepUnattachedAssets,
  UploadRefused,
} from "../media";

/** The request's body, or null when it is larger than an upload may be. */
function uploadOf(request: Request): Promise<Uint8Array | null> {
  if (Number(request.headers.get("Content-Length") ?? 0) > LIMITS.uploadBytes) {
    return Promise.resolve(null);
  }
  return readCapped(request.body);
}

/** A file name safe to put in a header: plain characters only. */
const headerName = (name: string | null) =>
  (name ?? "attachment").replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "attachment";

/** `/api/v1/assets`: photos, card sides and attachments. */
export const assetRoutes = new Hono<AppEnv>()
  // The body is the file itself. It is recorded and stored, and belongs to no
  // recipe until a recipe's save names it.
  .post("/", queryParams(AssetUploadQuery), async (c) => {
    const { role, filename } = c.req.valid("query");
    const bytes = await uploadOf(c.req.raw);
    if (!bytes) {
      return c.json(errorBody("too_large", "This file is larger than 15 MB"), 413);
    }
    try {
      const asset = await storeAsset(c.env, {
        bytes,
        role,
        filename,
        memberId: c.get("member").id,
      });
      // Tidying up after abandoned uploads rides along, after the answer.
      c.executionCtx.waitUntil(
        sweepUnattachedAssets(c.env).catch((error) =>
          console.error("media: could not clear old uploads", error),
        ),
      );
      return c.json(asset, 201);
    } catch (error) {
      if (error instanceof UploadRefused) {
        return c.json(errorBody(error.code, error.message), error.status);
      }
      throw error;
    }
  })
  // A file never changes once stored, so it can be kept for good by whoever fetched it.
  .get("/:id/:variant", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    const variant = AssetVariant.safeParse(c.req.param("variant"));
    const asset =
      id.success && variant.success ? await loadAssetForServing(c.env.DB, id.data) : null;
    if (!asset || !variant.success) {
      return notFound(c);
    }
    // A picture with no smaller sizes is served as its original in their place.
    const wanted = asset.hasVariants ? variant.data : "original";
    const object =
      (await c.env.MEDIA.get(assetKey(asset.id, wanted))) ??
      (wanted === "original" ? null : await c.env.MEDIA.get(assetKey(asset.id, "original")));
    if (!object) {
      return notFound(c);
    }
    const served = object.key.endsWith(".webp") ? "image/webp" : asset.contentType;
    const headers = new Headers({
      "Content-Type": isPicture(served) ? served : "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: object.httpEtag,
      // Whatever the file holds, it is shown as a picture or downloaded, never run.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    if (!isPicture(served)) {
      headers.set(
        "Content-Disposition",
        `attachment; filename="${headerName(asset.originalFilename)}"`,
      );
    }
    return new Response(object.body, { headers });
  });
