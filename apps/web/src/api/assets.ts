import { Asset, type AssetRole, type AssetVariant } from "@recipeflare/schema";
import { API_BASE, api } from "./client";

/**
 * The address of a photo or an attachment. Every address of a stored file is
 * built here, so that pointing the app at another server stays one setting.
 * A file never changes once stored, so its address can be kept for good.
 */
export function assetUrl(asset: Pick<Asset, "id" | "hasVariants">, size: AssetVariant): string {
  // A picture with no smaller sizes has one address for all three.
  return `${API_BASE}/api/v1/assets/${asset.id}/${asset.hasVariants ? size : "original"}`;
}

/** The longest edge a photo is sent with. It keeps handwriting on a card legible. */
export const MAX_EDGE = 2560;
/** A picture this small and this light is sent as it is. */
const SEND_AS_IS_BYTES = 3 * 1024 * 1024;

/** The size a picture is drawn at so that its long edge is at most `max`. Never larger than it is. */
export function fitWithin(width: number, height: number, max: number = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * A photo as it will be sent: made smaller on the device when it is larger
 * than a recipe needs, so that an upload on mobile data is about a megabyte.
 * A file the browser cannot read as a picture is sent as it is, and the
 * server says whether it will have it.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    // Turned the way the camera held it, so the picture is upright once the note saying so is gone.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    if (size.width === bitmap.width && file.size <= SEND_AS_IS_BYTES) {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    return blob ?? file;
  } finally {
    bitmap.close();
  }
}

/** Sends a file to be stored. It belongs to no recipe until a recipe's save names it. */
export async function uploadAsset(file: File, role: AssetRole): Promise<Asset> {
  const body = role === "attachment" ? file : await preparePhoto(file);
  // The server takes a name of up to 200 characters. A longer one keeps its ending, where the type is.
  const query = new URLSearchParams({ role, filename: file.name.slice(-200) });
  return api(`/assets?${query}`, { method: "POST", file: body, schema: Asset });
}
