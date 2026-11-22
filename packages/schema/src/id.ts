type RandomSource = { getRandomValues<T extends Uint8Array>(array: T): T };

/**
 * A new UUIDv7: 48 bits of Unix milliseconds, then random bits. IDs made later
 * sort later, which keeps new database rows together in the index.
 *
 * Works in Workers, browsers and Node, which all provide a global `crypto`.
 */
export function newId(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  (globalThis as unknown as { crypto: RandomSource }).crypto.getRandomValues(bytes);

  let time = Math.floor(now);
  for (let i = 5; i >= 0; i--) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  // Version 7 in the high nibble of byte 6; RFC 9562 variant in byte 8.
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
