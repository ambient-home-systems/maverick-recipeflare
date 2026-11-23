import { useRouterState } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { signInAgainUrl } from "../api/client";
import { useSignedOut } from "../api/session";

/**
 * Shown across the top of every page once a request has found the sign-in
 * session run out. What is already on screen stays; signing in again comes
 * back to this page.
 */
export function SessionNotice() {
  const signedOut = useSignedOut();
  const here = useRouterState({ select: (state) => state.location.href });
  if (!signedOut) {
    return null;
  }
  return (
    <div
      role="status"
      // First on the page, so on a phone it is the part that clears the notch.
      className="session-notice flex flex-wrap items-center gap-x-4 gap-y-1 bg-notice px-4 pt-[max(0.375rem,env(safe-area-inset-top))] pb-1.5 text-sm font-semibold text-on-notice md:pt-1.5"
    >
      <p className="flex min-w-0 flex-1 basis-56 items-start gap-2 py-1">
        <LogIn aria-hidden="true" size="1.125rem" className="mt-px flex-none" />
        <span>You have been signed out. What is on screen may be out of date.</span>
      </p>
      {/* A plain link, not the router's: it must leave the app for the sign-in page. */}
      <a
        href={signInAgainUrl(here)}
        className="transition-rf inline-flex min-h-touch flex-none items-center rounded-md border border-rule-strong bg-surface px-4 font-semibold text-ink no-underline hover:bg-surface-sunk"
      >
        Sign in again
      </a>
    </div>
  );
}
