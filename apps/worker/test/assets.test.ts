import { env } from "cloudflare:workers";
import {
  Asset,
  ErrorBody,
  ImportDetail,
  LIMITS,
  newId,
  Recipe,
  RecipeListResponse,
} from "@recipeflare/schema";
import { fixtureMember } from "@recipeflare/schema/fixtures";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createImportJob, loadImportJob } from "../src/db/importJobs";
import { createRecipe } from "../src/db/recipes";
import { runImportJob } from "../src/imports/runner";
import { assetKey, sniffType, storeAsset, sweepUnattachedAssets } from "../src/media";
import { countingDatabase, seedLists, signedIn } from "./helpers";

const db = env.DB;
const api = signedIn(env, fixtureMember.email ?? "");

beforeAll(async () => {
  await seedLists(db);
});

/** A real picture, one pixel square: enough for the Images binding to read and resize. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);
/** Bytes that begin like a JPEG and are not one: stored, but no smaller sizes can be made. */
const BROKEN_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const PDF = new TextEncoder().encode("%PDF-1.7\n% an invented attachment\n");

async function upload(bytes: Uint8Array, role = "photo", type = "image/png", filename?: string) {
  const query = new URLSearchParams({ role, ...(filename ? { filename } : {}) });
  return api.upload(`/assets?${query}`, bytes, type);
}
async function uploaded(bytes: Uint8Array = PNG, role = "photo") {
  const response = await upload(bytes, role);
  expect(response.status).toBe(201);
  return Asset.parse(await response.json());
}
const errorOf = async (response: Response) => ErrorBody.parse(await response.json()).error;
const stored = async (id: string, variant: "original" | "thumb" | "full") =>
  (await env.MEDIA.head(assetKey(id, variant))) !== null;

let titles = 0;
async function recipeWith(assets: { id: string; role: string }[], extra: object = {}) {
  const response = await api.post("/recipes", {
    title: `Photographed Dish ${++titles}`,
    assets,
    ...extra,
  });
  expect(response.status).toBe(201);
  return Recipe.parse(await response.json());
}

describe("uploading a photo", () => {
  it("stores the file and two smaller sizes, and says what it is", async () => {
    const asset = await uploaded();

    expect(asset).toMatchObject({
      role: "photo",
      contentType: "image/png",
      sizeBytes: PNG.byteLength,
      hasVariants: true,
      width: 1,
      height: 1,
    });
    expect(await stored(asset.id, "original")).toBe(true);
    expect(await stored(asset.id, "thumb")).toBe(true);
    expect(await stored(asset.id, "full")).toBe(true);
  });

  it("keeps and serves the original when the smaller sizes cannot be made", async () => {
    const asset = await uploaded(BROKEN_JPEG);

    expect(asset).toMatchObject({ contentType: "image/jpeg", hasVariants: false, width: null });
    expect(await stored(asset.id, "thumb")).toBe(false);
    // Asked for a thumbnail, the app is given the original.
    const response = await api.get(`/assets/${asset.id}/thumb`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BROKEN_JPEG);
  });

  it("goes by what the file is, not by what the request says it is", async () => {
    const asset = Asset.parse(await (await upload(PNG, "photo", "image/jpeg")).json());

    expect(asset.contentType).toBe("image/png");
  });

  it("refuses a file over the size limit, clearly, and stores nothing", async () => {
    const big = new Uint8Array(LIMITS.uploadBytes + 1);
    big.set(PNG);

    const response = await upload(big);

    expect(response.status).toBe(413);
    expect(await errorOf(response)).toMatchObject({
      code: "too_large",
      message: "This file is larger than 15 MB",
    });
  });

  it("refuses something that is not a picture where a picture belongs", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    for (const bytes of [svg, PDF]) {
      const response = await upload(bytes, "photo", "image/svg+xml");

      expect(response.status).toBe(415);
      expect((await errorOf(response)).code).toBe("not_a_picture");
    }
    expect((await upload(new Uint8Array(), "photo")).status).toBe(400);
  });

  it("takes a file of another kind as an attachment, and serves it only as a download", async () => {
    const response = await upload(PDF, "attachment", "application/pdf", 'Aunt "May" card.pdf');
    expect(response.status).toBe(201);
    const asset = Asset.parse(await response.json());
    expect(asset).toMatchObject({
      role: "attachment",
      contentType: "application/pdf",
      hasVariants: false,
      originalFilename: 'Aunt "May" card.pdf',
    });

    const served = await api.get(`/assets/${asset.id}/original`);

    expect(served.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(served.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Aunt _May_ card.pdf"',
    );
  });

  it("needs a role, and a signed-in member", async () => {
    expect((await api.upload("/assets", PNG, "image/png")).status).toBe(400);
    expect((await upload(PNG, "wallpaper")).status).toBe(400);
    const stranger = signedIn(env, "");
    expect((await stranger.upload("/assets?role=photo", PNG, "image/png")).status).toBe(401);
  });
});

describe("serving a photo", () => {
  it("serves each size, to be kept for good, and never as something that can run", async () => {
    const asset = await uploaded();

    const original = await api.get(`/assets/${asset.id}/original`);
    const thumb = await api.get(`/assets/${asset.id}/thumb`);

    expect(original.status).toBe(200);
    expect(original.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(PNG);
    expect(thumb.headers.get("Content-Type")).toBe("image/webp");
    await thumb.arrayBuffer();
    for (const response of [original, thumb]) {
      expect(response.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
      expect(response.headers.get("ETag")).toBeTruthy();
    }
  });

  it("answers 404 for a photo that does not exist, a size that does not, and a stranger gets 401", async () => {
    const asset = await uploaded();

    expect((await api.get(`/assets/${newId()}/thumb`)).status).toBe(404);
    expect((await api.get(`/assets/${asset.id}/poster`)).status).toBe(404);
    expect((await api.get("/assets/not-an-id/thumb")).status).toBe(404);
    expect((await signedIn(env, "").get(`/assets/${asset.id}/thumb`)).status).toBe(401);
  });
});

describe("a recipe's photos", () => {
  it("are attached by the save, in the order given, with the cover chosen", async () => {
    const [first, second, card] = [
      await uploaded(),
      await uploaded(),
      await uploaded(PNG, "original"),
    ];

    const recipe = await recipeWith([
      { id: first.id, role: "photo" },
      { id: second.id, role: "cover" },
      { id: card.id, role: "original" },
    ]);

    expect(recipe.assets.map((asset) => [asset.id, asset.role, asset.position])).toEqual([
      [first.id, "photo", 0],
      [second.id, "cover", 1],
      [card.id, "original", 2],
    ]);
    // The list shows the cover.
    const list = RecipeListResponse.parse(
      await (await api.get(`/recipes?q=${encodeURIComponent(recipe.title)}`)).json(),
    );
    expect(list.items[0]?.cover?.id).toBe(second.id);
  });

  it("can change cover, order and membership in one save, and deletes the files of a photo left out", async () => {
    const [a, b, c] = [await uploaded(), await uploaded(), await uploaded()];
    const recipe = await recipeWith([
      { id: a.id, role: "cover" },
      { id: b.id, role: "photo" },
    ]);

    const response = await api.put(`/recipes/${recipe.id}`, {
      title: recipe.title,
      version: recipe.version,
      // The cover moves from a to b, b goes first, c joins, and a stays as a photo.
      assets: [
        { id: b.id, role: "cover" },
        { id: c.id, role: "photo" },
      ],
    });

    expect(response.status).toBe(200);
    const saved = Recipe.parse(await response.json());
    expect(saved.assets.map((asset) => [asset.id, asset.role])).toEqual([
      [b.id, "cover"],
      [c.id, "photo"],
    ]);
    await api.settled();
    expect(await stored(a.id, "original")).toBe(false);
    expect(await stored(a.id, "thumb")).toBe(false);
    expect((await api.get(`/assets/${a.id}/thumb`)).status).toBe(404);
    expect(await stored(b.id, "original")).toBe(true);
  });

  it("are left alone by a save that says nothing about them", async () => {
    const photo = await uploaded();
    const recipe = await recipeWith([{ id: photo.id, role: "cover" }]);

    const response = await api.put(`/recipes/${recipe.id}`, {
      title: `${recipe.title} Again`,
      version: recipe.version,
    });

    expect(Recipe.parse(await response.json()).assets.map((asset) => asset.id)).toEqual([photo.id]);
  });

  it("are all removed by a save with an empty list", async () => {
    const photo = await uploaded();
    const recipe = await recipeWith([{ id: photo.id, role: "cover" }]);

    const response = await api.put(`/recipes/${recipe.id}`, {
      title: recipe.title,
      version: recipe.version,
      assets: [],
    });

    expect(Recipe.parse(await response.json()).assets).toEqual([]);
    await api.settled();
    expect(await stored(photo.id, "original")).toBe(false);
  });

  it("cannot be taken from another recipe, or made of a photo that is not there", async () => {
    const photo = await uploaded();
    await recipeWith([{ id: photo.id, role: "cover" }]);

    for (const id of [photo.id, newId()]) {
      const response = await api.post("/recipes", {
        title: "Borrowed Photo",
        assets: [{ id, role: "photo" }],
      });

      expect(response.status).toBe(400);
      expect((await errorOf(response)).issues?.[0]?.path).toEqual(["assets", 0]);
    }
    expect((await api.get("/recipes/borrowed-photo")).status).toBe(404);
  });

  it("are checked by the shared schema: one cover, each photo once, no more than a recipe may have", async () => {
    const photo = await uploaded();
    const twice = await api.post("/recipes", {
      title: "Twice",
      assets: [
        { id: photo.id, role: "photo" },
        { id: photo.id, role: "photo" },
      ],
    });
    const covers = await api.post("/recipes", {
      title: "Two Covers",
      assets: [
        { id: photo.id, role: "cover" },
        { id: newId(), role: "cover" },
      ],
    });
    const many = await api.post("/recipes", {
      title: "Too Many",
      assets: Array.from({ length: LIMITS.assets + 1 }, () => ({ id: newId(), role: "photo" })),
    });

    expect([twice.status, covers.status, many.status]).toEqual([400, 400, 400]);
  });

  it("are saved within the save's two round trips", async () => {
    const [a, b] = [await uploaded(), await uploaded()];
    const counted = countingDatabase(db);

    const result = await createRecipe(
      counted.db,
      {
        title: "Counted Photos",
        description: "",
        servings: null,
        yieldQuantity: null,
        yieldUnit: null,
        prepTimeSeconds: null,
        cookTimeSeconds: null,
        totalTimeSeconds: null,
        nutrition: null,
        sourceName: null,
        sourceUrl: null,
        ingredientSections: [],
        stepSections: [],
        notes: [],
        categoryIds: [],
        tagIds: [],
        toolIds: [],
        assets: [
          { id: a.id, role: "cover" },
          { id: b.id, role: "photo" },
        ],
      },
      fixtureMember.id,
    );

    expect(result.ok).toBe(true);
    expect(counted.counts()).toEqual({ batches: 2, statementsOutsideABatch: 0 });
  });

  it("go when the recipe is deleted, files and all", async () => {
    const photo = await uploaded();
    const recipe = await recipeWith([{ id: photo.id, role: "cover" }]);

    expect((await api.delete(`/recipes/${recipe.id}`)).status).toBe(204);

    await api.settled();
    expect(await stored(photo.id, "original")).toBe(false);
    expect(await stored(photo.id, "full")).toBe(false);
    expect((await api.get(`/assets/${photo.id}/original`)).status).toBe(404);
  });
});

describe("uploads that never became part of a recipe", () => {
  it("are cleared away after a day, and not before", async () => {
    const fresh = await uploaded();
    const old = await uploaded();
    const kept = await uploaded();
    await recipeWith([{ id: kept.id, role: "cover" }]);
    const longAgo = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    await db
      .prepare("UPDATE assets SET created_at = ?1 WHERE id IN (?2, ?3)")
      .bind(longAgo, old.id, kept.id)
      .run();

    await sweepUnattachedAssets(env);

    expect(await stored(old.id, "original")).toBe(false);
    expect((await api.get(`/assets/${old.id}/thumb`)).status).toBe(404);
    expect(await stored(fresh.id, "original")).toBe(true);
    // A photo on a recipe is never swept, however old.
    expect(await stored(kept.id, "original")).toBe(true);
  });
});

describe("the picture an import brings", () => {
  const page = "https://kitchen.example.com/pictured";
  const picture = "https://kitchen.example.com/pictures/dish.png";
  const DRAFT = {
    title: "Pictured Dish",
    sourceUrl: page,
    imageUrl: picture,
    ingredientSections: [{ title: null, items: [{ originalText: "1 onion" }] }],
    stepSections: [{ title: null, steps: [{ text: "Cook." }] }],
  };
  const pictures = (answer: () => Response) =>
    vi.fn<typeof fetch>(async (input) => {
      if (String(input) === picture) {
        return answer();
      }
      throw new Error(`nothing is served at ${String(input)}`);
    });
  const png = () => new Response(PNG, { headers: { "Content-Type": "image/png" } });

  async function imported(fetcher: typeof fetch, draft: object = DRAFT, url = page) {
    const created = await createImportJob(
      db,
      { kind: "url", sourceUrl: url, input: { url } },
      fixtureMember.id,
    );
    await runImportJob(created.id, { url: async () => draft }, { fetch: fetcher, env });
    return ImportDetail.parse(await (await api.get(`/imports/${created.id}`)).json());
  }

  it("is fetched and kept as the job's own, as a cover, and shown with the import", async () => {
    const fetcher = pictures(png);

    const detail = await imported(fetcher);

    expect(detail.status).toBe("needs_review");
    expect(detail.assets).toHaveLength(1);
    expect(detail.assets[0]).toMatchObject({ role: "cover", contentType: "image/png" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await api.get(`/assets/${detail.assets[0]?.id}/thumb`)).status).toBe(200);
  });

  it("becomes the recipe's cover when the import is saved", async () => {
    const detail = await imported(pictures(png));
    const cover = detail.assets[0];

    const recipe = await recipeWith([{ id: cover?.id ?? "", role: "cover" }], {
      importJobId: detail.id,
    });

    expect(recipe.assets.map((asset) => [asset.id, asset.role])).toEqual([[cover?.id, "cover"]]);
    expect((await loadImportJob(db, detail.id))?.status).toBe("completed");
  });

  it("is deleted when the cook takes it off in review, and when the import is discarded", async () => {
    const removed = await imported(pictures(png));
    const recipe = await recipeWith([], { importJobId: removed.id });
    expect(recipe.assets).toEqual([]);
    await api.settled();
    expect(await stored(removed.assets[0]?.id ?? "", "original")).toBe(false);

    const discarded = await imported(pictures(png));
    expect((await api.delete(`/imports/${discarded.id}`)).status).toBe(204);
    expect(await stored(discarded.assets[0]?.id ?? "", "original")).toBe(false);
  });

  it("is replaced, not doubled, when a job runs again", async () => {
    const created = await createImportJob(
      db,
      { kind: "url", sourceUrl: page, input: { url: page } },
      fixtureMember.id,
    );
    const tools = { fetch: pictures(png), env };
    await runImportJob(created.id, { url: async () => DRAFT }, tools);
    // The attempt died after storing the picture, and the message came back.
    await db
      .prepare("UPDATE import_jobs SET status = 'running' WHERE id = ?1")
      .bind(created.id)
      .run();
    await runImportJob(created.id, { url: async () => DRAFT }, tools);

    const detail = ImportDetail.parse(await (await api.get(`/imports/${created.id}`)).json());
    expect(detail.assets).toHaveLength(1);
  });

  it.each([
    ["the site refuses it", () => new Response("no", { status: 403 })],
    [
      "it is not a picture",
      () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } }),
    ],
    [
      "it is too large",
      () => new Response(PNG, { headers: { "Content-Length": String(LIMITS.uploadBytes + 1) } }),
    ],
  ])("is done without when %s: the import still lands in review", async (_why, answer) => {
    const detail = await imported(pictures(answer));

    expect(detail.status).toBe("needs_review");
    expect(detail.assets).toEqual([]);
  });

  it("is never fetched from a machine named by number", async () => {
    const fetcher = pictures(png);

    const detail = await imported(fetcher, {
      ...DRAFT,
      imageUrl: "http://169.254.169.254/dish.png",
    });

    expect(detail.status).toBe("needs_review");
    expect(detail.assets).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("reading what a file is from its first bytes", () => {
  const bytes = (text: string) => Uint8Array.from(text, (character) => character.charCodeAt(0));

  it("knows the pictures a browser shows, a PDF, and nothing else", () => {
    expect(sniffType(PNG)).toBe("image/png");
    expect(sniffType(BROKEN_JPEG)).toBe("image/jpeg");
    expect(sniffType(bytes("GIF89a......"))).toBe("image/gif");
    expect(sniffType(bytes("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffType(bytes("\0\0\0\x1cftypavif\0\0\0\0"))).toBe("image/avif");
    expect(sniffType(bytes("\0\0\0\x18ftypheic\0\0\0\0"))).toBe("image/heic");
    expect(sniffType(PDF)).toBe("application/pdf");
    expect(sniffType(bytes("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBe(
      "application/octet-stream",
    );
    expect(sniffType(bytes("<!doctype html><script>alert(1)</script>"))).toBe(
      "application/octet-stream",
    );
    expect(sniffType(new Uint8Array())).toBe("application/octet-stream");
  });

  it("stores an asset for an import without going through the API", async () => {
    const job = await createImportJob(
      db,
      { kind: "url", sourceUrl: "https://kitchen.example.com/direct", input: {} },
      fixtureMember.id,
    );

    const asset = await storeAsset(env, {
      bytes: PNG,
      role: "cover",
      memberId: fixtureMember.id,
      importJobId: job.id,
    });

    expect(asset.hasVariants).toBe(true);
  });
});
