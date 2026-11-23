/** Enough words for any search a person types; more would only slow the query. */
const MAX_WORDS = 12;

/**
 * Turns what someone typed into a query for the full-text index. User text
 * never reaches `MATCH` any other way.
 *
 * Only the letters and digits are kept, as words; that is all the index holds.
 * Each word is quoted, so nothing typed can be read as a search operator. Every
 * word must match, and the last one matches as a prefix, so "choc" finds
 * "chocolate" while it is still being typed.
 *
 * Returns null when there is nothing to search for: an empty box, or text with
 * no letter or digit in it, such as an emoji.
 */
export function ftsQuery(text: string): string | null {
  const words = (text.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_WORDS);
  if (words.length === 0) {
    return null;
  }
  return words
    .map((word, index) => (index === words.length - 1 ? `"${word}"*` : `"${word}"`))
    .join(" AND ");
}
