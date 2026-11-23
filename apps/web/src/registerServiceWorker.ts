import { TAKE_OVER } from "./sw/rules";

/**
 * The page's side of the service worker: installing it, which is what lets
 * the app open offline, and moving to a new version of the app.
 *
 * A new version is fetched in the background when the app's page loads, and
 * then waits. It is taken up in one of two ways, and each ends with the page
 * loading itself again, so a page never runs half old and half new:
 *
 * - If it is ready within a few seconds of the page loading and nobody has
 *   touched the page yet, it takes over there and then. A refresh after a
 *   deploy usually ends on the new version this way.
 * - Otherwise it waits, and the next time the page is loaded, by a refresh or
 *   by opening the app again, it takes over before anything is shown.
 *
 * It never takes over under someone who is using the page.
 */

/** What the page needs of `navigator.serviceWorker`. Narrow, so it can be stood in for. */
export type WorkerContainer = Pick<
  ServiceWorkerContainer,
  "controller" | "getRegistration" | "addEventListener"
>;

/**
 * Loads the page again when a new version takes over from the one that was
 * serving it. The first install of all is not a change of version, and
 * reloads nothing.
 */
export function reloadOnNewVersion(container: WorkerContainer, reload: () => void): void {
  const served = container.controller !== null;
  let reloading = false;
  container.addEventListener("controllerchange", () => {
    if (served && !reloading) {
      reloading = true;
      reload();
    }
  });
}

/**
 * Asks a version that is waiting to take over. True when one was: the page is
 * about to be loaded again and should show nothing in the meantime.
 */
export async function takeUpWaitingVersion(container: WorkerContainer): Promise<boolean> {
  const registration = await container.getRegistration();
  // With nothing serving this page yet there is no old version to replace.
  if (!registration?.waiting || container.controller === null) {
    return false;
  }
  registration.waiting.postMessage(TAKE_OVER);
  return true;
}

/** How long after the page loads a new version may still take over by itself. */
export const EARLY_MS = 15_000;

/**
 * True when a version that has just become ready may take over now: the page
 * is newly loaded and nobody has touched it. After that, it waits for the next load.
 */
export function mayTakeOverNow(page: { touched: boolean; sinceLoadMs: number }): boolean {
  return !page.touched && page.sinceLoadMs < EARLY_MS;
}

/** Calls `ready` with each new version of the service worker once it is installed and waiting. */
function onVersionReady(
  registration: ServiceWorkerRegistration,
  ready: (worker: ServiceWorker) => void,
): void {
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed") {
        ready(worker);
      }
    });
  });
}

/** How long the app waits to hear whether a new version is taking over before it shows itself. */
const WAIT_MS = 1000;
/** How long it then waits for that version's reload, before carrying on as it is. */
const RELOAD_WAIT_MS = 4000;

/**
 * Sets the app up for offline use and brings it up to date, then calls
 * `start` to show it. Only in a built app: in development the files change
 * under a service worker all the time.
 */
export function startWithServiceWorker(start: () => void): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    start();
    return;
  }
  const container = navigator.serviceWorker;
  const loaded = Date.now();
  let touched = false;
  const touch = () => {
    touched = true;
  };
  for (const type of ["pointerdown", "keydown", "touchstart", "wheel"]) {
    window.addEventListener(type, touch, { capture: true, once: true, passive: true });
  }
  window.addEventListener("load", () => {
    container
      .register("/sw.js")
      .then((registration) =>
        onVersionReady(registration, (worker) => {
          // Only a change of version: on a first visit there is nothing to take over from.
          if (
            container.controller !== null &&
            mayTakeOverNow({ touched, sinceLoadMs: Date.now() - loaded })
          ) {
            worker.postMessage(TAKE_OVER);
          }
        }),
      )
      .catch((error) => {
        // The app works without it; it only will not open offline.
        console.warn("The app could not be set up for offline use", error);
      });
  });
  reloadOnNewVersion(container, () => window.location.reload());

  let started = false;
  const once = () => {
    if (!started) {
      started = true;
      start();
    }
  };
  const slow = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), WAIT_MS));
  Promise.race([takeUpWaitingVersion(container), slow])
    // If the reload does not come, the version that is here is still a working app.
    .then((takingOver) => (takingOver ? setTimeout(once, RELOAD_WAIT_MS) : once()))
    .catch(once);
}
