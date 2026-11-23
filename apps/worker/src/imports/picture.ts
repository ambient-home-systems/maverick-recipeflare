import { LIMITS } from "@recipeflare/schema";
import { assetsOfImport } from "../db/assets";
import { readCapped, removeAssets, storeAsset } from "../media";
import type { ImportTools } from "./runner";
import { checkedUrl, fetchChecked } from "./url";

/**
 * Fetches the picture an import found and stores it as the job's own, to
 * become the recipe's cover when the cook saves. A picture is a nicety: if it
 * cannot be had, the import goes on without one and nothing is retried for it.
 */
export async function keepPicture(
  job: { id: string; createdBy: string },
  imageUrl: string | null,
  tools: ImportTools,
): Promise<void> {
  const env = tools.env;
  // A job that runs again starts clean: the picture its last attempt fetched
  // is replaced. Only that one: a photographed card's sides are the job's
  // too, and they are what the import is made from.
  await removeAssets(
    env,
    (await assetsOfImport(env.DB, job.id))
      .filter((asset) => asset.role === "cover")
      .map((asset) => asset.id),
  );
  if (!imageUrl) {
    return;
  }
  try {
    const { response } = await fetchChecked(
      checkedUrl(imageUrl),
      tools.fetch,
      "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
    );
    if (!response.ok) {
      await response.body?.cancel();
      return;
    }
    const bytes =
      Number(response.headers.get("Content-Length") ?? 0) > LIMITS.uploadBytes
        ? null
        : await readCapped(response.body);
    if (!bytes) {
      return;
    }
    await storeAsset(env, {
      bytes,
      role: "cover",
      memberId: job.createdBy,
      importJobId: job.id,
    });
  } catch (error) {
    // Not an address, not reachable, not a picture: the draft is whole without it.
    console.warn("import: the page's picture was not kept", error);
  }
}
