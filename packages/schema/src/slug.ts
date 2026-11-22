const MAX_SLUG_LENGTH = 80;
const FALLBACK_SLUG = "recipe";

/** Slugs the web app's router uses for its own pages. */
const RESERVED_SLUGS: ReadonlySet<string> = new Set(["new", "import", "edit"]);

/**
 * Turns a title or name into a URL slug: accents removed, lowercase, anything
 * that is not a letter or digit becomes a hyphen, at most 80 characters.
 */
export function slugify(text: string): string {
  const hyphenated = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (hyphenated.length <= MAX_SLUG_LENGTH) {
    return hyphenated || FALLBACK_SLUG;
  }
  // Cut at the last hyphen that fits, so a word is not split.
  const cut = hyphenated.slice(0, MAX_SLUG_LENGTH + 1);
  const lastHyphen = cut.lastIndexOf("-");
  const shortened = lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut.slice(0, MAX_SLUG_LENGTH);
  return shortened.replace(/-+$/g, "") || FALLBACK_SLUG;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/**
 * The slug to use for `base` given the slugs already taken: `base` itself if
 * it is free, otherwise `base-2`, `base-3` and so on, lowest free number first.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base) && !isReservedSlug(base)) {
    return base;
  }
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}
