import type { ImportJob } from "@recipeflare/schema";
import { ClipboardPaste, Link2, LoaderCircle, RotateCw, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "../../ui/Button";

/** What went wrong, in plain words, and what to try. Anything else shows the job's own message. */
const FAILURES: Record<string, string> = {
  retries_exhausted: "The site could not be reached. Check the link, or try again later.",
  blocked:
    "The site does not let apps read its pages. On a computer, the bookmark on the Add page sends it from your browser. Otherwise it is best typed in.",
  no_recipe:
    "No recipe was found on that page. If the page shows one, copy its text and use Paste text on the Add page.",
  too_thin: "There was not enough there to make a recipe from.",
  not_queued: "The import could not be started. Try again.",
  ai_limit: "Today's allowance for importing with AI is used up. Try again tomorrow.",
  ai_unavailable: "The AI that reads recipes could not be reached. Try again later.",
  ai_answer: "The AI could not make a recipe of this. Trying again sometimes works.",
  ai_setup: "Importing with AI is not working. Whoever looks after the app can check it.",
  unsupported: "This kind of import is not available yet.",
};

/** Where an import came from, in a word or two: the site a link points at, without the "www", or "pasted text". */
export function importHost(job: Pick<ImportJob, "sourceUrl" | "kind">): string {
  if (job.kind === "text") {
    return "pasted text";
  }
  try {
    return new URL(job.sourceUrl ?? "").hostname.replace(/^www\./, "");
  } catch {
    return "a link";
  }
}

/** Why a failed import failed, and what to try. */
export function importFailure(job: ImportJob): string {
  return FAILURES[job.error?.code ?? ""] ?? job.error?.message ?? "The import did not work.";
}

/** A few words saying where an import has got to. */
export function importStatus(job: ImportJob): string {
  switch (job.status) {
    case "queued":
      return "Waiting to start";
    case "running":
      // A link is read as the page states it. Text is written up by a model.
      return job.kind === "text" || job.stage === "build" ? "Writing it up" : "Reading the page";
    case "needs_review":
      return "Ready to review";
    case "failed":
      return "Could not import";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Saved";
  }
}

/**
 * An import, from a link or from pasted text, shown above the recipes until a
 * person has dealt with it. It is not a recipe yet: it has no category colour
 * and does not open one.
 */
export function ImportRow({
  job,
  onReview,
  onRetry,
  onRemove,
}: {
  job: ImportJob;
  onReview?: (job: ImportJob) => void;
  onRetry?: (job: ImportJob) => void;
  onRemove?: (job: ImportJob) => void;
}) {
  const working = job.status === "queued" || job.status === "running";
  const failed = job.status === "failed";
  const fromText = job.kind === "text";
  const host = fromText ? "Pasted text" : importHost(job);
  const title = job.result?.draft.title.trim() || host;
  const Icon = fromText ? ClipboardPaste : Link2;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-4 py-2.5">
      <span
        aria-hidden="true"
        className="grid size-12 flex-none place-items-center rounded-sm bg-stock-plain text-ink"
      >
        <Icon size="1.375rem" />
      </span>
      {/* A failure's reason needs room: its text is wide enough to push the actions onto their own line. */}
      <span className={`flex-1 ${failed ? "min-w-[16rem]" : "min-w-[8rem]"}`}>
        <span className="block text-lg font-semibold leading-tight">{title}</span>
        <span className="mt-0.5 block text-sm">
          {working ? (
            <LoaderCircle
              aria-hidden="true"
              size="1rem"
              className="mr-1.5 inline-block animate-spin align-[-0.15em] motion-reduce:animate-none"
            />
          ) : null}
          {failed ? (
            <TriangleAlert
              aria-hidden="true"
              size="1rem"
              className="mr-1.5 inline-block align-[-0.15em]"
            />
          ) : null}
          <span className="font-semibold">
            {importStatus(job)}
            {working ? "…" : failed ? "." : ""}
          </span>
          {failed ? ` ${importFailure(job)}` : null}
          {/* On a phone the site takes its own line, so a line never ends on the dot. */}
          {failed || title === host ? null : (
            <span className="block md:inline">
              <span className="hidden md:inline"> · </span>
              {host}
            </span>
          )}
        </span>
      </span>
      {/* An action is offered only when there is something to do it. */}
      {job.status === "needs_review" && onReview ? (
        <Button onClick={() => onReview(job)}>Review</Button>
      ) : null}
      {failed && (onRetry || onRemove) ? (
        <span className="flex flex-wrap gap-2">
          {onRetry ? (
            <Button
              variant="quiet"
              icon={<RotateCw aria-hidden="true" size="1.125rem" />}
              onClick={() => onRetry(job)}
            >
              Try again
            </Button>
          ) : null}
          {onRemove ? (
            <Button
              variant="quiet"
              icon={<Trash2 aria-hidden="true" size="1.125rem" />}
              onClick={() => onRemove(job)}
            >
              Remove
            </Button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}
