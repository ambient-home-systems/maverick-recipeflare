import { describe, expect, it } from "vitest";
import { formatDuration, parseIsoDuration } from "./duration";
import { newId } from "./id";
import { nameKey } from "./name-key";
import { Id } from "./primitives";
import { isReservedSlug, slugify, uniqueSlug } from "./slug";

describe("newId", () => {
  it("makes a UUIDv7 that the Id schema accepts", () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(Id.safeParse(id).success).toBe(true);
  });

  it("sorts by creation time", () => {
    const earlier = newId(Date.UTC(2026, 0, 1));
    const later = newId(Date.UTC(2026, 0, 2));
    expect(earlier < later).toBe(true);
  });

  it("encodes the timestamp in the first 48 bits", () => {
    const time = Date.UTC(2026, 10, 22, 12, 0, 0);
    const hex = newId(time).replace(/-/g, "").slice(0, 12);
    expect(Number.parseInt(hex, 16)).toBe(time);
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newId(1_700_000_000_000)));
    expect(ids.size).toBe(2000);
  });
});

describe("nameKey", () => {
  it("ignores case, outer spaces and repeated spaces", () => {
    expect(nameKey("  Olive   Oil ")).toBe("olive oil");
  });

  it("treats compatibility forms of a character as the same", () => {
    // U+FB01 is the "fi" ligature.
    expect(nameKey("ﬁg")).toBe(nameKey("fig"));
  });

  it("keeps accents, which distinguish real names", () => {
    expect(nameKey("Jalapeño")).not.toBe(nameKey("Jalapeno"));
  });
});

describe("slugify", () => {
  it.each([
    ["Buttermilk Pancakes", "buttermilk-pancakes"],
    ["Crème Brûlée", "creme-brulee"],
    ["Mac & Cheese", "mac-and-cheese"],
    ['  Grandma\'s  "Best" Pie!! ', "grandma-s-best-pie"],
    ["9x13 Brownies", "9x13-brownies"],
    ["🍕", "recipe"],
    ["", "recipe"],
  ])("turns %j into %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("cuts long titles at a hyphen and stays within 80 characters", () => {
    const slug = slugify("slow cooker ".repeat(20));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.endsWith("cooker") || slug.endsWith("slow")).toBe(true);
  });

  it("cuts a single very long word to 80 characters", () => {
    expect(slugify("a".repeat(200))).toBe("a".repeat(80));
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it is free", () => {
    expect(uniqueSlug("chili", ["chili-con-carne"])).toBe("chili");
  });

  it("appends the lowest free number", () => {
    expect(uniqueSlug("chili", ["chili"])).toBe("chili-2");
    expect(uniqueSlug("chili", ["chili", "chili-2", "chili-4"])).toBe("chili-3");
  });

  it("never returns a slug the router owns", () => {
    expect(isReservedSlug("new")).toBe(true);
    expect(uniqueSlug("new", [])).toBe("new-2");
  });
});

describe("parseIsoDuration", () => {
  it.each([
    ["PT30M", 1800],
    ["PT1H30M", 5400],
    ["PT2H", 7200],
    ["P1DT2H", 93600],
    ["PT90S", 90],
    ["pt45m", 2700],
    ["PT0M", 0],
  ])("reads %s as %i seconds", (input, expected) => {
    expect(parseIsoDuration(input)).toBe(expected);
  });

  it.each(["", "P", "PT", "30 minutes", "P1M", "P1Y", "1:30"])("rejects %j", (input) => {
    expect(parseIsoDuration(input)).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0 min"],
    [1800, "30 min"],
    [3600, "1 hr"],
    [5400, "1 hr 30 min"],
    [5399, "1 hr 30 min"],
    [93600, "26 hr"],
  ])("shows %i seconds as %j", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
