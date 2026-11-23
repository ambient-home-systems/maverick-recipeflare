import { type Asset, newId, type Recipe, slugify, toRecipeSummary } from "@recipeflare/schema";
import {
  fixtureFoods,
  fixtureOrganizers,
  fixtureRecipes,
  fixtureUnits,
  importNeedsReview,
} from "@recipeflare/schema/fixtures";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-utils";

afterEach(() => {
  cleanup();
});

const NOW = "2026-11-23T09:00:00.000Z";
const BASE: Recipe = (() => {
  const found = fixtureRecipes.find((recipe) => recipe.assets.length === 0);
  if (!found) {
    throw new Error("there is no fixture recipe without photos");
  }
  return found;
})();

const stored = (role: Asset["role"], extra: Partial<Asset> = {}): Asset => ({
  id: newId(),
  role,
  position: 0,
  contentType: "image/jpeg",
  sizeBytes: 1000,
  width: 1200,
  height: 900,
  hasVariants: true,
  originalFilename: null,
  createdAt: NOW,
  ...extra,
});

type Call = { method: string; path: string; body: unknown };

/**
 * A stand-in for the API that keeps photos: a file sent to it becomes an
 * asset, and a recipe saved with a list of assets has those assets, in that
 * order and with those roles.
 */
function fakeApi(
  options: {
    recipes?: Recipe[];
    importAssets?: Asset[];
    /** Answers an upload instead of storing it, by the file's name. */
    refuse?: (name: string) => Response | null;
  } = {},
) {
  const recipes = new Map((options.recipes ?? []).map((recipe) => [recipe.id, recipe]));
  const assets = new Map<string, Asset>(
    [...(options.importAssets ?? []), ...[...recipes.values()].flatMap((r) => r.assets)].map(
      (asset) => [asset.id, asset],
    ),
  );
  const uploads: { name: string; role: string | null; type: string }[] = [];
  const calls: Call[] = [];
  const refusal = (status: number, code: string) =>
    Response.json({ error: { code, message: code } }, { status });
  const list = (items: unknown[]) => Response.json({ items });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body ?? null);
    calls.push({ method, path, body });

    if (method === "GET") {
      switch (path) {
        case "/units":
          return list(fixtureUnits.map((unit) => ({ ...unit, recipeCount: 0 })));
        case "/foods":
          return list(fixtureFoods.map((food) => ({ ...food, recipeCount: 0 })));
        case "/organizers":
          return list(fixtureOrganizers.map((entry) => ({ ...entry, recipeCount: 0 })));
        case "/imports":
          return list([]);
        case "/recipes": {
          const items = [...recipes.values()].map(toRecipeSummary);
          return Response.json({
            items,
            page: 1,
            perPage: 30,
            total: items.length,
            libraryTotal: items.length,
          });
        }
      }
      if (path === `/imports/${importNeedsReview.id}`) {
        return Response.json({
          ...importNeedsReview,
          duplicate: null,
          assets: options.importAssets ?? [],
        });
      }
      const key = decodeURIComponent(path.replace("/recipes/", ""));
      const found = [...recipes.values()].find(
        (recipe) => recipe.slug === key || recipe.id === key,
      );
      return found ? Response.json(found) : refusal(404, "not_found");
    }

    if (method === "POST" && path === "/assets") {
      const file = init?.body as File;
      const name = url.searchParams.get("filename") ?? "";
      const refused = options.refuse?.(name);
      if (refused) {
        return refused;
      }
      uploads.push({ name, role: url.searchParams.get("role"), type: file.type });
      const asset = stored("photo", { originalFilename: name, sizeBytes: file.size });
      assets.set(asset.id, asset);
      return Response.json(asset, { status: 201 });
    }
    if (method === "POST" && path === "/foods") {
      return Response.json(
        { ...fixtureFoods[0], id: newId(), name: body.name, recipeCount: 0 },
        { status: 201 },
      );
    }
    if (path.startsWith("/recipes") && (method === "POST" || method === "PUT")) {
      const was = recipes.get(path.replace("/recipes/", ""));
      const placed = body.assets as { id: string; role: Asset["role"] }[] | undefined;
      const recipe: Recipe = {
        ...(was ?? BASE),
        id: was?.id ?? newId(),
        version: (was?.version ?? 0) + 1,
        title: body.title,
        slug: slugify(body.title),
        assets: placed
          ? placed.flatMap((entry, position) => {
              const asset = assets.get(entry.id);
              return asset ? [{ ...asset, role: entry.role, position }] : [];
            })
          : (was?.assets ?? []),
      };
      recipes.set(recipe.id, recipe);
      return Response.json(recipe, { status: method === "POST" ? 201 : 200 });
    }
    return refusal(404, "not_found");
  });
  vi.stubGlobal("fetch", fetchMock);

  const sent = (method: string, path?: string) =>
    calls.filter((call) => call.method === method && (path === undefined || call.path === path));
  const savedAssets = (call: Call | undefined) =>
    (call?.body as { assets?: { id: string; role: string }[] } | undefined)?.assets;
  return { calls, sent, uploads, recipes, assets, savedAssets };
}

const photo = (name: string) => new File([`the bytes of ${name}`], name, { type: "image/jpeg" });
const choose = (label: string, ...files: File[]) =>
  fireEvent.change(screen.getByLabelText(label), { target: { files } });
const editorOpen = () => screen.findByLabelText("Title");
const setTitle = (text: string) =>
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: text } });
const images = (root: HTMLElement = document.body) =>
  [...root.querySelectorAll("img")].map((image) => image.getAttribute("src") ?? "");

describe("adding photos in the editor", () => {
  it("shows a photo at once, from the device, and sends nothing until the save", async () => {
    const api = fakeApi();
    await renderAt("/recipes/new");
    await editorOpen();

    choose("Add photos", photo("soup.jpg"));

    await screen.findByRole("button", { name: /Photos, picture 1 of 1, the cover/ });
    expect(images().some((src) => src.startsWith("blob:"))).toBe(true);
    expect(api.sent("POST")).toEqual([]);
  });

  it("sends the photos with the save, then the recipe with each in its place", async () => {
    const api = fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();
    setTitle("Photographed Soup");
    choose("Add photos", photo("soup.jpg"), photo("bowl.jpg"));
    choose("Add the card", photo("card-front.jpg"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/photographed-soup"));
    expect(api.uploads.map((upload) => upload.name)).toEqual([
      "soup.jpg",
      "bowl.jpg",
      "card-front.jpg",
    ]);
    const saved = api.savedAssets(api.sent("POST", "/recipes")[0]);
    // The recipe names the stored photos, not the editor's own stand-ins.
    expect(saved?.map((entry) => entry.role)).toEqual(["photo", "photo", "original"]);
    expect(saved?.every((entry) => api.assets.has(entry.id))).toBe(true);
    // The saved recipe shows them from the server.
    await screen.findByRole("heading", { level: 1, name: "Photographed Soup" });
    expect(images().filter((src) => src.includes("/api/v1/assets/")).length).toBeGreaterThan(0);
  });

  it("saves the cover the cook chose, and leaves out a photo the cook removed", async () => {
    const api = fakeApi();
    const { router } = await renderAt("/recipes/new");
    await editorOpen();
    setTitle("Chosen Cover");
    choose("Add photos", photo("first.jpg"), photo("second.jpg"), photo("third.jpg"));

    fireEvent.click(await screen.findByRole("button", { name: /Photos, picture 2 of 3/ }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Photo" })).getByRole("button", {
        name: "Make it the cover",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Photo" })).getByRole("button", { name: "Done" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Photos, picture 3 of 3/ }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Photo" })).getByRole("button", {
        name: "Remove",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/chosen-cover"));
    // A photo taken off before the save is never sent.
    expect(api.uploads.map((upload) => upload.name)).toEqual(["first.jpg", "second.jpg"]);
    expect(api.savedAssets(api.sent("POST", "/recipes")[0])?.map((entry) => entry.role)).toEqual([
      "photo",
      "cover",
    ]);
  });

  it("says which photo is too large, keeps what was typed, and saves once it is removed", async () => {
    const api = fakeApi({
      refuse: (name) =>
        name === "huge.jpg"
          ? Response.json(
              { error: { code: "too_large", message: "This file is larger than 15 MB" } },
              { status: 413 },
            )
          : null,
    });
    const { router } = await renderAt("/recipes/new");
    await editorOpen();
    setTitle("Heavy Photo");
    choose("Add photos", photo("fine.jpg"), photo("huge.jpg"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/huge\.jpg is larger than 15 MB/)).toBeTruthy();
    expect(api.sent("POST", "/recipes")).toEqual([]);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Heavy Photo");

    fireEvent.click(screen.getByRole("button", { name: /Photos, picture 2 of 2/ }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Photo" })).getByRole("button", {
        name: "Remove",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/heavy-photo"));
    // The photo that went the first time is not sent again.
    expect(api.uploads.map((upload) => upload.name)).toEqual(["fine.jpg"]);
    expect(api.savedAssets(api.sent("POST", "/recipes")[0])).toHaveLength(1);
  });

  it("keeps a saved recipe's photos, and sends only what was added", async () => {
    const cover = stored("cover");
    const card = stored("original", { position: 1 });
    const recipe: Recipe = { ...BASE, assets: [cover, card] };
    const api = fakeApi({ recipes: [recipe] });
    const { router } = await renderAt(`/recipes/${recipe.slug}/edit`);
    await editorOpen();
    expect(images()).toContain(`/api/v1/assets/${cover.id}/thumb`);

    choose("Add the card", photo("card-back.jpg"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/recipes/${recipe.slug}`));
    expect(api.uploads.map((upload) => upload.name)).toEqual(["card-back.jpg"]);
    const saved = api.savedAssets(api.sent("PUT")[0]);
    expect(saved?.slice(0, 2)).toEqual([
      { id: cover.id, role: "cover" },
      { id: card.id, role: "original" },
    ]);
    expect(saved?.[2]?.role).toBe("original");
  });
});

describe("photos on the recipe and on the list", () => {
  it("shows a recipe's photos at thumbnail size, from the server", async () => {
    const cover = stored("cover");
    const plain = stored("original", { position: 1, hasVariants: false });
    const recipe: Recipe = { ...BASE, assets: [cover, plain] };
    fakeApi({ recipes: [recipe] });

    await renderAt(`/recipes/${recipe.slug}`);
    await screen.findByRole("heading", { level: 1, name: recipe.title });

    expect(images()).toContain(`/api/v1/assets/${cover.id}/thumb`);
    // A photo with no smaller sizes is shown from its original.
    expect(images()).toContain(`/api/v1/assets/${plain.id}/original`);
  });

  it("shows the cover on the recipe's row in the list", async () => {
    const cover = stored("cover");
    const recipe: Recipe = { ...BASE, assets: [cover] };
    fakeApi({ recipes: [recipe] });

    await renderAt("/");
    await screen.findByText(recipe.title);

    expect(images()).toContain(`/api/v1/assets/${cover.id}/thumb`);
  });
});

describe("the picture an import brought", () => {
  const REVIEW = `/imports/${importNeedsReview.id}/review`;

  it("is the cover in review, is shown as the original, and is saved with the recipe", async () => {
    const picture = stored("cover");
    const api = fakeApi({ importAssets: [picture] });
    const { router } = await renderAt(REVIEW);
    await editorOpen();

    expect(images()).toContain(`/api/v1/assets/${picture.id}/thumb`);
    expect(images()).toContain(`/api/v1/assets/${picture.id}/full`);

    const step = screen.getByLabelText("Add a step");
    fireEvent.change(step, { target: { value: "Bake until golden." } });
    fireEvent.keyDown(step, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    const foods = await screen.findByRole("dialog", { name: /Add \d+ foods?\?/ });
    fireEvent.click(within(foods).getByRole("button", { name: /^Add/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/skillet-cornbread"));
    expect(api.uploads).toEqual([]);
    expect(api.savedAssets(api.sent("POST", "/recipes")[0])).toEqual([
      { id: picture.id, role: "cover" },
    ]);
  });

  it("is left out of the recipe when the cook removes it in review", async () => {
    const picture = stored("cover");
    const api = fakeApi({ importAssets: [picture] });
    const { router } = await renderAt(REVIEW);
    await editorOpen();

    fireEvent.click(screen.getByRole("button", { name: /Photos, picture 1 of 1/ }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Photo" })).getByRole("button", {
        name: "Remove",
      }),
    );
    const step = screen.getByLabelText("Add a step");
    fireEvent.change(step, { target: { value: "Bake until golden." } });
    fireEvent.keyDown(step, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    const foods = await screen.findByRole("dialog", { name: /Add \d+ foods?\?/ });
    fireEvent.click(within(foods).getByRole("button", { name: /^Add/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/skillet-cornbread"));
    // An empty list, which is what tells the server to delete the picture.
    expect(api.savedAssets(api.sent("POST", "/recipes")[0])).toEqual([]);
  });
});
