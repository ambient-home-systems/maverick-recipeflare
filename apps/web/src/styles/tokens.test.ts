// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read from disk, in Node: the test runner does not load stylesheets.
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

/** Reads the colour tokens of one theme out of tokens.css. */
function readTheme(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`No "${selector}" block in tokens.css`);
  }
  const block = css.slice(start, css.indexOf("}", start));
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/(--rf-[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/g)) {
    tokens.set(match[1] as string, match[2] as string);
  }
  return tokens;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2.1 contrast ratio between two colours. */
function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

const light = readTheme(":root");
const dark = new Map([...light, ...readTheme(':root[data-theme="dark"]')]);

// Text on its background: WCAG AA asks for 4.5 to 1.
const TEXT_PAIRS: [text: string, background: string][] = [
  ["--rf-ink", "--rf-surface"],
  ["--rf-ink", "--rf-surface-sunk"],
  ["--rf-ink", "--rf-ground"],
  ["--rf-ink", "--rf-stock-plain"],
  ["--rf-on-shell", "--rf-shell"],
  ["--rf-on-primary", "--rf-primary"],
  ["--rf-on-primary", "--rf-primary-press"],
  ["--rf-on-red", "--rf-red-fill"],
  ["--rf-on-red", "--rf-red-fill-press"],
  ["--rf-on-notice", "--rf-notice"],
  ["--rf-on-stock", "--rf-stock-buff"],
  ["--rf-on-stock", "--rf-stock-salmon"],
  ["--rf-on-stock", "--rf-stock-sky"],
  ["--rf-on-stock", "--rf-stock-mint"],
  ["--rf-on-stock", "--rf-stock-lilac"],
];

// Lines and rings that carry meaning: WCAG AA asks for 3 to 1.
const GRAPHIC_PAIRS: [mark: string, background: string][] = [
  ["--rf-rule-strong", "--rf-surface"],
  ["--rf-red-line", "--rf-surface"],
  ["--rf-focus", "--rf-surface"],
  ["--rf-focus", "--rf-ground"],
  ["--rf-focus-on-shell", "--rf-shell"],
  ["--rf-red-fill", "--rf-surface"],
  ["--rf-primary", "--rf-surface"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_name, theme) => {
  const colour = (token: string) => {
    const value = theme.get(token);
    if (!value) {
      throw new Error(`${token} is not defined as a hex colour`);
    }
    return value;
  };

  it("defines every colour token", () => {
    for (const token of light.keys()) {
      expect(theme.has(token), token).toBe(true);
    }
    expect(light.size).toBeGreaterThanOrEqual(25);
    // One ink: no second text tone may come back.
    expect([...light.keys()].filter((token) => /soft|muted|-text$/.test(token))).toEqual([]);
  });

  it.each(TEXT_PAIRS)("%s on %s is readable (4.5 to 1)", (text, background) => {
    expect(contrast(colour(text), colour(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHIC_PAIRS)("%s on %s is visible (3 to 1)", (mark, background) => {
    expect(contrast(colour(mark), colour(background))).toBeGreaterThanOrEqual(3);
  });
});

describe("the two themes", () => {
  it("differ in every surface and ink colour, so dark is designed and not a copy", () => {
    for (const token of ["--rf-ink", "--rf-surface", "--rf-ground", "--rf-rule", "--rf-shell"]) {
      expect(dark.get(token), token).not.toBe(light.get(token));
    }
  });

  it("keep category colours recognisable: dark stock stays close to light stock", () => {
    for (const stock of ["buff", "salmon", "sky", "mint", "lilac"]) {
      const token = `--rf-stock-${stock}`;
      const ratio = contrast(light.get(token) as string, dark.get(token) as string);
      expect(ratio, token).toBeLessThan(1.35);
    }
  });
});

describe("sizes", () => {
  it("makes the smallest touch target 44 px", () => {
    expect(css).toMatch(/--rf-touch:\s*2\.75rem;/);
  });

  it("sets cook-mode step text to at least 20 px", () => {
    const rem = Number(/--rf-text-cook:\s*([\d.]+)rem;/.exec(css)?.[1]);
    expect(rem * 16).toBeGreaterThanOrEqual(20);
  });
});
