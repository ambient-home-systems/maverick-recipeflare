/**
 * Checking what a model wrote against the text it was given. See
 * docs/phase-2-plan.md §5, rule 1: nothing is invented. A prompt forbids it;
 * this is the code that checks it.
 *
 * The comparison is by words, not by characters, so that a bullet, a step's
 * number, a line break or a capital letter makes no difference, and a changed
 * amount or an added word does.
 */

/** A number as written ("2", "1/2", "2.5", "1,000"), or a word, apostrophe and all. */
const WORD = /\d+(?:[.,/]\d+)*|[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;

/** The words and numbers of a text, in order, in one plain form. */
export function wordsOf(text: string): string[] {
  const plain = text
    // "1½" is one and a half: the half is set apart before it is spelt out as 1/2.
    .replace(/(\d)(\p{No})/gu, "$1 $2")
    .normalize("NFKD")
    .replace(/⁄/g, "/")
    // Accents written apart from their letters go; "é" pasted two ways is one word.
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/’/g, "'");
  return plain.match(WORD) ?? [];
}

export type Source = {
  /** The words of `text` that the source does not have, each once, in order. */
  missing(text: string): string[];
  /** Whether the source has the words of `text` together, in that order. */
  hasRun(text: string): boolean;
};

/** A source text, ready to be asked about. */
export function sourceOf(text: string): Source {
  const words = wordsOf(text);
  const known = new Set(words);
  const run = ` ${words.join(" ")} `;
  return {
    missing(candidate) {
      const absent: string[] = [];
      for (const word of wordsOf(candidate)) {
        if (!known.has(word) && !absent.includes(word)) {
          absent.push(word);
        }
      }
      return absent;
    },
    hasRun(candidate) {
      const wanted = wordsOf(candidate);
      return wanted.length === 0 || run.includes(` ${wanted.join(" ")} `);
    },
  };
}

/** A few of the words, quoted, for a sentence: `"powder", "extra"`. */
export function quoted(words: readonly string[], most = 5): string {
  const shown = words.slice(0, most).map((word) => `"${word}"`);
  return words.length > most ? `${shown.join(", ")} and others` : shown.join(", ");
}
