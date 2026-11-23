/**
 * Installs the service worker, which is what lets the app open offline. Only
 * in a built app: in development the files change under it all the time.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      // The app works without it; it only will not open offline.
      console.warn("The app could not be set up for offline use", error);
    });
  });
}
