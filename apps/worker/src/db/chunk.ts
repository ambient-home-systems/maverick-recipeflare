/** D1 allows at most this many bound parameters in one statement. */
export const MAX_PARAMETERS = 100;

/**
 * Splits rows for multi-row inserts so that no statement binds more than 100
 * values. `columns` is how many values one row binds.
 */
export function chunkRows<T>(rows: readonly T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(MAX_PARAMETERS / columns));
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
}
