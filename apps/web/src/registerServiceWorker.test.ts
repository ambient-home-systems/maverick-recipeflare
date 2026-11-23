import { describe, expect, it, vi } from "vitest";
import {
  EARLY_MS,
  mayTakeOverNow,
  reloadOnNewVersion,
  takeUpWaitingVersion,
  type WorkerContainer,
} from "./registerServiceWorker";
import { TAKE_OVER } from "./sw/rules";

/** A stand-in for `navigator.serviceWorker`: who serves the page, and what is waiting. */
function container(options: { serving: boolean; waiting?: boolean; registered?: boolean }) {
  const waiting = { postMessage: vi.fn() };
  const listeners: (() => void)[] = [];
  const fake = {
    controller: options.serving ? ({} as ServiceWorker) : null,
    getRegistration: async () =>
      options.registered === false
        ? undefined
        : ({ waiting: options.waiting ? waiting : null } as unknown as ServiceWorkerRegistration),
    addEventListener: (_type: string, listener: () => void) => {
      listeners.push(listener);
    },
  } as unknown as WorkerContainer;
  return {
    fake,
    waiting,
    changeController: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

describe("taking up a new version of the app when the page loads", () => {
  it("asks a waiting version to take over", async () => {
    const { fake, waiting } = container({ serving: true, waiting: true });

    expect(await takeUpWaitingVersion(fake)).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith(TAKE_OVER);
  });

  it("does nothing when no version is waiting", async () => {
    const { fake, waiting } = container({ serving: true });

    expect(await takeUpWaitingVersion(fake)).toBe(false);
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });

  it("does nothing on a first visit, when nothing is serving the page yet", async () => {
    const first = container({ serving: false, waiting: true });
    const never = container({ serving: false, registered: false });

    expect(await takeUpWaitingVersion(first.fake)).toBe(false);
    expect(first.waiting.postMessage).not.toHaveBeenCalled();
    expect(await takeUpWaitingVersion(never.fake)).toBe(false);
  });
});

describe("loading the page again under a new version", () => {
  it("reloads once when a new version takes over from the one serving the page", () => {
    const { fake, changeController } = container({ serving: true });
    const reload = vi.fn();
    reloadOnNewVersion(fake, reload);

    changeController();
    changeController();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when the app is installed for the first time", () => {
    const { fake, changeController } = container({ serving: false });
    const reload = vi.fn();
    reloadOnNewVersion(fake, reload);

    changeController();

    expect(reload).not.toHaveBeenCalled();
  });
});

describe("a new version that becomes ready while the page is open", () => {
  it("may take over when the page has just loaded and nobody has touched it", () => {
    expect(mayTakeOverNow({ touched: false, sinceLoadMs: 2000 })).toBe(true);
  });

  it("waits for the next load once someone is using the page", () => {
    expect(mayTakeOverNow({ touched: true, sinceLoadMs: 2000 })).toBe(false);
  });

  it("waits for the next load once the page has been open a while, touched or not", () => {
    expect(mayTakeOverNow({ touched: false, sinceLoadMs: EARLY_MS })).toBe(false);
    expect(mayTakeOverNow({ touched: false, sinceLoadMs: 10 * 60_000 })).toBe(false);
  });
});
