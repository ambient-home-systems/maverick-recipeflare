import { Asset, type AssetRole, type AssetVariant, LIMITS, newId } from "@recipeflare/schema";
import { deleteAssetRows, insertAsset, staleUnattachedAssetIds } from "./db/assets";

/**
 * Photos and attachments in R2, as docs/implementation-plan.md §4.3 describes.
 * A file is stored once, as it arrived, and never changes. A picture is also
 * stored in two smaller sizes when the Images binding can make them; when it
 * cannot, the original is served in their place.
 */

/** Where a file is kept. Keys are derived from the asset's ID, never stored. */
export const assetKey = (id: string, variant: AssetVariant): string =>
  variant === "original" ? `assets/${id}/original` : `assets/${id}/${variant}.webp`;

/** The long edge of each smaller size, in pixels. */
const VARIANT_EDGE = { thumb: 480, full: 1600 } as const;

/** Picture types a browser shows and that hold no script. */
const PICTURES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
]);

const startsWith = (bytes: Uint8Array, signature: number[], at = 0) =>
  signature.every((byte, index) => bytes[at + index] === byte);
const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

/**
 * What a file is, read from its first bytes. What the sender says it is does
 * not count: the type decides how the file is served back.
 */
export function sniffType(bytes: Uint8Array): string {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (ascii(bytes, 0, 4) === "GIF8") {
    return "image/gif";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") {
      return "image/avif";
    }
    if (["heic", "heix", "hevc", "mif1", "msf1"].includes(brand)) {
      return "image/heic";
    }
  }
  if (ascii(bytes, 0, 5) === "%PDF-") {
    return "application/pdf";
  }
  return "application/octet-stream";
}

export const isPicture = (contentType: string) => PICTURES.has(contentType);

/** Why a file was not stored, in the API's words. */
export class UploadRefused extends Error {
  readonly status: 413 | 415 | 400;
  readonly code: string;

  constructor(status: 413 | 415 | 400, code: string, message: string) {
    super(message);
    this.name = "UploadRefused";
    this.status = status;
    this.code = code;
  }
}

/** Reads a stream up to `max` bytes and no further. Null when there is more than that. */
export async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  max: number = LIMITS.uploadBytes,
): Promise<Uint8Array | null> {
  const reader = body?.getReader();
  if (!reader) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

export type MediaEnv = { DB: D1Database; MEDIA: R2Bucket; IMAGES?: ImagesBinding };

const streamOf = (bytes: Uint8Array) => new Blob([bytes]).stream() as ReadableStream<Uint8Array>;

/**
 * Makes the two smaller sizes of a picture and stores them. Null when it
 * could not: no Images binding, a format it cannot read, or a failure on the
 * day. The original is already stored, so nothing is lost.
 */
async function makeVariants(
  env: MediaEnv,
  id: string,
  bytes: Uint8Array,
): Promise<{ width: number; height: number } | null> {
  if (!env.IMAGES) {
    return null;
  }
  try {
    const info = await env.IMAGES.info(streamOf(bytes));
    if (!("width" in info)) {
      return null;
    }
    for (const variant of ["thumb", "full"] as const) {
      const edge = VARIANT_EDGE[variant];
      const result = await env.IMAGES.input(streamOf(bytes))
        // Never enlarged: a small picture keeps its size in both.
        .transform({ width: edge, height: edge, fit: "scale-down" })
        .output({ format: "image/webp", quality: 80 });
      await env.MEDIA.put(assetKey(id, variant), await result.response().arrayBuffer(), {
        httpMetadata: { contentType: "image/webp" },
      });
    }
    return { width: info.width, height: info.height };
  } catch (error) {
    console.error("media: could not make the smaller sizes of a picture", error);
    // Half a pair is no use: the original is served for both.
    await env.MEDIA.delete([assetKey(id, "thumb"), assetKey(id, "full")]).catch(() => {});
    return null;
  }
}

/**
 * Stores a file and records it as an asset. It belongs to nothing yet, or to
 * the import that brought it: a recipe's save is what attaches it.
 */
export async function storeAsset(
  env: MediaEnv,
  file: {
    bytes: Uint8Array;
    role: AssetRole;
    filename?: string | null;
    memberId: string;
    importJobId?: string | null;
  },
): Promise<Asset> {
  const { bytes, role } = file;
  if (bytes.byteLength === 0) {
    throw new UploadRefused(400, "empty_file", "The file is empty");
  }
  if (bytes.byteLength > LIMITS.uploadBytes) {
    throw new UploadRefused(413, "too_large", "This file is larger than 15 MB");
  }
  const contentType = sniffType(bytes);
  if (role !== "attachment" && !isPicture(contentType)) {
    throw new UploadRefused(
      415,
      "not_a_picture",
      "Only a picture can be added here: a JPEG, PNG, WebP, GIF, HEIC or AVIF file",
    );
  }

  const id = newId();
  await env.MEDIA.put(assetKey(id, "original"), bytes, { httpMetadata: { contentType } });
  const size = isPicture(contentType) ? await makeVariants(env, id, bytes) : null;

  const asset = Asset.parse({
    id,
    role,
    position: 0,
    contentType,
    sizeBytes: bytes.byteLength,
    width: size?.width ?? null,
    height: size?.height ?? null,
    hasVariants: size !== null,
    originalFilename: file.filename?.trim() || null,
    createdAt: new Date().toISOString(),
  });
  try {
    await insertAsset(env.DB, asset, {
      memberId: file.memberId,
      importJobId: file.importJobId ?? null,
    });
  } catch (error) {
    await removeAssetObjects(env.MEDIA, [id]);
    throw error;
  }
  return asset;
}

/** Deletes the stored files of assets whose rows are gone. A file that is not there is no error. */
export async function removeAssetObjects(media: R2Bucket, ids: readonly string[]): Promise<void> {
  const keys = ids.flatMap((id) => [
    assetKey(id, "original"),
    assetKey(id, "thumb"),
    assetKey(id, "full"),
  ]);
  // R2 deletes up to 1,000 keys in one call.
  for (let at = 0; at < keys.length; at += 900) {
    await media.delete(keys.slice(at, at + 900));
  }
}

/** Deletes assets, rows first and then files, so a row never points at nothing. */
export async function removeAssets(env: MediaEnv, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await deleteAssetRows(env.DB, ids);
  await removeAssetObjects(env.MEDIA, ids);
}

/**
 * Clears out uploads that never became part of a recipe: the editor was
 * closed, or a save failed part-way and was not tried again. A day is long
 * enough for anyone still typing.
 */
export async function sweepUnattachedAssets(env: MediaEnv): Promise<void> {
  const before = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await removeAssets(env, await staleUnattachedAssetIds(env.DB, before));
}
