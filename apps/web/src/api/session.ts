import { useSyncExternalStore } from "react";

/**
 * Whether the API last said the person is signed in. It is not asked up front:
 * every answer from the API updates it, so a session that runs out is noticed
 * by whichever request meets it first, and one that comes back is noticed too.
 */
let signedOut = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (signedOut !== next) {
    signedOut = next;
    for (const listener of listeners) {
      listener();
    }
  }
}

export const markSignedOut = () => set(true);
export const markSignedIn = () => set(false);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True once a request has found the session run out, until one succeeds again. */
export function useSignedOut(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => signedOut,
    () => false,
  );
}
