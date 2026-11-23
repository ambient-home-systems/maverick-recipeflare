import { deflateSync } from "node:zlib";
import { type APIRequestContext, expect, type Page } from "@playwright/test";

/** A picture made here, so no photograph is kept in the repository: a plain gradient, as a PNG. */
export function gradientPng(width: number, height: number): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) {
      c = (table[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = Math.round((x * 255) / width);
      raw[at + 1] = Math.round((y * 255) / height);
      raw[at + 2] = 96;
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const uuid = () => crypto.randomUUID();

/** A file that is not a picture: a few bytes that begin as a PDF does. Invented, like everything here. */
export const samplePdf = () =>
  Buffer.from("%PDF-1.7\n% an invented attachment for the end-to-end run\n");

/** Makes a recipe through the API, for a spec that needs one to look at. */
export async function makeRecipe(
  request: APIRequestContext,
  title: string,
  options: { attachment?: string } = {},
): Promise<{ id: string; slug: string }> {
  const assets: { id: string; role: string }[] = [];
  if (options.attachment) {
    const upload = await request.post(
      `/api/v1/assets?role=attachment&filename=${encodeURIComponent(options.attachment)}`,
      { headers: { "Content-Type": "application/pdf" }, data: samplePdf() },
    );
    if (upload.status() !== 201) {
      throw new Error(`Could not store an attachment: ${upload.status()}`);
    }
    assets.push({ id: (await upload.json()).id, role: "attachment" });
  }
  const response = await request.post("/api/v1/recipes", {
    data: {
      title,
      assets,
      description: "Made for the end-to-end run.",
      servings: 4,
      totalTimeSeconds: 2700,
      ingredientSections: [
        {
          title: null,
          items: ["2 onions, sliced", "1 tin tomatoes", "a pinch of salt"].map((originalText) => ({
            id: uuid(),
            originalText,
            quantity: null,
            unitId: null,
            foodId: null,
            note: "",
          })),
        },
      ],
      stepSections: [
        {
          title: null,
          steps: ["Soften the onions.", "Add the tomatoes and simmer.", "Season and serve."].map(
            (text) => ({ id: uuid(), text, durationSeconds: null, ingredientIds: [] }),
          ),
        },
      ],
    },
  });
  if (response.status() !== 201) {
    throw new Error(`Could not make a recipe: ${response.status()}`);
  }
  return response.json();
}

/** Deletes every recipe, so a spec starts from an empty library whatever ran before it. */
export async function emptyLibrary(request: APIRequestContext): Promise<void> {
  for (;;) {
    const list = await (await request.get("/api/v1/recipes?perPage=100")).json();
    if (list.items.length === 0) {
      return;
    }
    for (const recipe of list.items) {
      await request.delete(`/api/v1/recipes/${recipe.id}`, {
        headers: { "Sec-Fetch-Site": "same-origin" },
      });
    }
  }
}

/** Waits until the service worker has the page, which is what makes the app open offline. */
export async function appInstalled(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 30_000,
  });
}

/** The addresses of the recipes this device has a copy of, read from its own database. */
function slugsOnDevice(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const open = indexedDB.open("keyval-store");
    const db = await new Promise<IDBDatabase | null>((resolve) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
    });
    if (!db?.objectStoreNames.contains("keyval")) {
      return [];
    }
    const kept = await new Promise<{
      clientState?: { queries?: { queryKey: unknown[] }[] };
    } | null>((resolve) => {
      const read = db.transaction("keyval").objectStore("keyval").get("recipeflare:queries");
      read.onsuccess = () => resolve(read.result ?? null);
      read.onerror = () => resolve(null);
    });
    return (kept?.clientState?.queries ?? [])
      .filter((query) => query.queryKey[1] === "one")
      .map((query) => String(query.queryKey[2]));
  });
}

/**
 * Waits until this device's copy holds a recipe at an address. The question is
 * asked from here, again and again: asked inside the page, an answer that is
 * still on its way counts as yes.
 */
export async function onDevice(page: Page, slug: string): Promise<void> {
  await expect.poll(() => slugsOnDevice(page), { timeout: 30_000 }).toContain(slug);
}
