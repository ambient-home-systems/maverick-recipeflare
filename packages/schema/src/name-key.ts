/**
 * The key that decides whether two names are the same food, unit or label:
 * Unicode-normalized, lowercased, trimmed, with runs of whitespace collapsed.
 * "  Olive  Oil " and "olive oil" share a key.
 */
export function nameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().trim().replace(/\s+/gu, " ");
}
