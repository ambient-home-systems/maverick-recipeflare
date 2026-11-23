/// <reference lib="webworker" />
import {
  isPhotoPath,
  mayKeep,
  overLimit,
  PHOTO_CACHE,
  SHELL_PREFIX,
  servesApp,
  shellVersion,
} from "./sw/rules";

/**
 * The service worker: what lets the app open with no connection.
 *
 * It keeps two things. The app itself (its page, scripts, styles, fonts and
 * icons) is stored when the worker is installed and served from the device
 * from then on. Photos are stored as they are first shown. Recipe data is not
 * its business: the app keeps that itself (`api/persist.ts`).
 *
 * A new version of the app is stored beside the old one and takes over the
 * next time the app is opened afresh, so a page never runs half old and half new.
 */

declare const self: ServiceWorkerGlobalScope & {
  /** The app's files and their revisions, written in by the build. */
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

const files = self.__WB_MANIFEST;
const SHELL = `${SHELL_PREFIX}${shellVersion(files)}`;
/**
 * The app's one page is kept under "/", not "/index.html": the server answers
 * the second with a redirect to the first, and a redirect is never kept.
 */
const APP_PAGE = "/";
const pathOf = (url: string) => {
  const path = new URL(url, self.location.origin).pathname;
  return path === "/index.html" ? APP_PAGE : path;
};
const shellPaths = new Set(files.map((file) => pathOf(file.url)));

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all(
        [...shellPaths].map(async (path) => {
          // Past the browser's own cache, so the copy kept is the one this build was made with.
          const response = await fetch(path, { cache: "reload" });
          if (!mayKeep(response)) {
            // Not installed at all is better than installed with a sign-in page for a script.
            throw new Error(`Could not store ${path}`);
          }
          await cache.put(path, response);
        }),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(SHELL_PREFIX) && name !== SHELL)
          .map((name) => caches.delete(name)),
      );
      // The page that installed the worker is served by it at once, so the
      // photos it is already showing are kept from the first visit.
      await self.clients.claim();
    })(),
  );
});

/** The app's own files come from the device. The network is only for one that is somehow missing. */
async function fromShell(path: string, request: Request): Promise<Response> {
  const cache = await caches.open(SHELL);
  return (await cache.match(path)) ?? fetch(request);
}

/** A photo comes from the device once it has been shown; the first time, it is fetched and kept. */
async function photo(request: Request): Promise<Response> {
  const cache = await caches.open(PHOTO_CACHE);
  const kept = await cache.match(request.url);
  if (kept) {
    return kept;
  }
  const response = await fetch(request);
  if (mayKeep(response)) {
    await cache.put(request.url, response.clone());
    void trimPhotos(cache);
  }
  return response;
}

async function trimPhotos(cache: Cache): Promise<void> {
  for (const request of overLimit(await cache.keys())) {
    await cache.delete(request);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (request.mode === "navigate") {
    // Every address in the app is the same page. An address under /api/ is not the app's.
    if (servesApp(url.pathname)) {
      event.respondWith(fromShell(APP_PAGE, request));
    }
    return;
  }
  if (isPhotoPath(url.pathname)) {
    event.respondWith(photo(request));
    return;
  }
  if (shellPaths.has(url.pathname)) {
    event.respondWith(fromShell(url.pathname, request));
  }
  // Anything else, the API's answers above all, goes to the network untouched.
});
