// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = new URL("..", import.meta.url).pathname;
const css = readFileSync(join(srcDir, "styles", "app.css"), "utf8");

/** Colour names the Tailwind theme defines, such as `ink` and `stock-buff`. */
const themeColours = new Set(
  [...css.matchAll(/--color-([a-z0-9-]+):/g)].map((match) => match[1] as string),
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

// app.css clears Tailwind's default palette, so a colour class that is not in
// the theme produces no CSS at all and fails silently. This test catches that.
describe("colour classes in components", () => {
  it("defines the theme colours", () => {
    expect(themeColours.has("ink")).toBe(true);
    expect(themeColours.has("shell-raised")).toBe(true);
  });

  it.each(sourceFiles(srcDir).map((path) => [path.slice(srcDir.length), path] as const))(
    "%s uses only colours the theme defines",
    (_name, path) => {
      const source = readFileSync(path, "utf8");
      const used = [
        ...source.matchAll(
          /(?:^|[\s"'`:])(?:bg|text|border|outline|ring|fill|stroke|decoration|accent|caret)-([a-z]+(?:-[a-z0-9]+)*)(?:\/\d+)?(?=[\s"'`])/g,
        ),
      ].map((match) => match[1] as string);
      const sizesAndKeywords =
        /^(xs|sm|base|lg|xl|2xl|cook|left|center|right|justify|wrap|nowrap|balance|pretty|ellipsis|clip|current|inherit|collapse|separate|solid|dashed|dotted|double|none|hidden|\d.*|t|b|l|r|x|y|[tblrxy]-\d.*|offset-\d+)$/;
      const unknown = used.filter(
        (name) => !themeColours.has(name) && !sizesAndKeywords.test(name),
      );
      expect(unknown).toEqual([]);
    },
  );
});
