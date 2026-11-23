import { describe, expect, it } from "vitest";
import { canonicalUrl } from "./url";

describe("canonicalUrl", () => {
  it("lowercases the host and leaves the path as written", () => {
    expect(canonicalUrl("https://Example.COM/Recipes/Pie")).toBe("https://example.com/Recipes/Pie");
  });

  it("drops the fragment and tracking parameters, and keeps the others in order", () => {
    expect(
      canonicalUrl("https://example.com/pie?utm_source=mail&page=2&fbclid=abc&id=7#comments"),
    ).toBe("https://example.com/pie?page=2&id=7");
  });

  it("leaves no question mark behind when every parameter was tracking", () => {
    expect(canonicalUrl("https://example.com/pie?utm_medium=social&gclid=1")).toBe(
      "https://example.com/pie",
    );
  });

  it("makes two links to the same page equal", () => {
    expect(canonicalUrl("https://EXAMPLE.com/pie?utm_campaign=x")).toBe(
      canonicalUrl(" https://example.com/pie#top "),
    );
  });

  it("returns text that is not an address unchanged", () => {
    expect(canonicalUrl("grandma's notebook")).toBe("grandma's notebook");
  });
});
