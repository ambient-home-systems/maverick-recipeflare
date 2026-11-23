import { describe, expect, it } from "vitest";
import { assetUrl, fitWithin, MAX_EDGE, preparePhoto } from "./assets";

const ID = "00000000-0000-7000-8000-000000000a01";

describe("the address of a photo", () => {
  it("names the size asked for when the photo has smaller sizes", () => {
    expect(assetUrl({ id: ID, hasVariants: true }, "thumb")).toBe(`/api/v1/assets/${ID}/thumb`);
    expect(assetUrl({ id: ID, hasVariants: true }, "full")).toBe(`/api/v1/assets/${ID}/full`);
  });

  it("is the original's for every size when it has none, so one copy is fetched and kept", () => {
    expect(assetUrl({ id: ID, hasVariants: false }, "thumb")).toBe(`/api/v1/assets/${ID}/original`);
    expect(assetUrl({ id: ID, hasVariants: false }, "full")).toBe(`/api/v1/assets/${ID}/original`);
  });
});

describe("making a photo smaller before it is sent", () => {
  it("brings the long edge down to the limit and keeps the shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_EDGE, height: 1920 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1920, height: MAX_EDGE });
  });

  it("never makes a photo larger", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(MAX_EDGE, 100)).toEqual({ width: MAX_EDGE, height: 100 });
  });

  it("sends a file as it is where the browser cannot read pictures", async () => {
    const file = new File(["not really a picture"], "card.heic", { type: "image/heic" });

    expect(await preparePhoto(file)).toBe(file);
  });
});
