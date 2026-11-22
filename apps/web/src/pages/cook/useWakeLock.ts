import { useEffect, useState } from "react";

/** "on": the screen is being kept on. "unavailable": this browser cannot, or would not. */
export type WakeState = "on" | "unavailable";

type Sentinel = { release: () => Promise<void> };
type WakeLockApi = { request: (type: "screen") => Promise<Sentinel> };

/**
 * Keeps the screen on while cook mode is open, where the browser allows it.
 * The browser drops the lock whenever the page is hidden, so it is asked for
 * again each time the page comes back.
 */
export function useWakeLock(): WakeState {
  const [state, setState] = useState<WakeState>("unavailable");

  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!api) {
      return;
    }
    let sentinel: Sentinel | null = null;
    let closed = false;

    const ask = async () => {
      try {
        const next = await api.request("screen");
        if (closed) {
          await next.release();
          return;
        }
        sentinel = next;
        setState("on");
      } catch {
        // Refused: low battery, a power-saving mode, or a page that is not in front.
        setState("unavailable");
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void ask();
      }
    };

    void ask();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  return state;
}
