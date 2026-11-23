/**
 * What the service worker keeps and what it leaves alone, as plain functions
 * so they can be tested without one. The worker itself is `src/sw.ts`.
 */

/** Photos, kept as they are first shown. Their addresses never change what they serve. */
export const PHOTO_CACHE = "rf-photos-v1";
/** How many photos are kept before the oldest are let go. */
export const PHOTO_LIMIT = 800;
/** The message a freshly loaded page sends a waiting version, to ask it to take over. */
export const TAKE_OVER = "take-over";
/** The start of every app-shell cache's name; the rest is the build it came from. */
export const SHELL_PREFIX = "rf-shell-";

/** True for the address of a stored photo: `/api/v1/assets/<id>/<size>`. */
export function isPhotoPath(pathname: string): boolean {
  return /^\/api\/v1\/assets\/[0-9a-f-]{36}\/(original|thumb|full)$/.test(pathname);
}

/**
 * True when a page load should be answered with the app itself. Anything under
 * `/api/` is the server's: "Sign in again" is a page load of an API address,
 * and it has to reach the sign-in page.
 */
export function servesApp(pathname: string): boolean {
  return pathname !== "/api" && !pathname.startsWith("/api/");
}

/**
 * True for an answer worth keeping: a plain success from this site. When the
 * sign-in session has run out, a request is answered with a redirect to the
 * sign-in page on another site. Followed, that arrives as an opaque or
 * redirected answer, and keeping it would put a sign-in page where a photo or
 * the app should be.
 */
export function mayKeep(response: Pick<Response, "status" | "type" | "redirected">): boolean {
  return response.status === 200 && response.type === "basic" && !response.redirected;
}

/** The oldest keys beyond `limit`, given keys in the order they were added. */
export function overLimit<T>(keys: readonly T[], limit: number = PHOTO_LIMIT): T[] {
  // Let go in batches, so that trimming does not happen on every photo.
  return keys.length > limit ? keys.slice(0, keys.length - limit + Math.floor(limit / 8)) : [];
}

/** A short name for a set of files: it changes when any file or its revision does. */
export function shellVersion(files: readonly { url: string; revision: string | null }[]): string {
  let hash = 5381;
  for (const file of files) {
    for (const character of `${file.url}@${file.revision ?? ""};`) {
      hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
    }
  }
  return hash.toString(36);
}
