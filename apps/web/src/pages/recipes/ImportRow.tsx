import type { ImportJob } from "@recipeflare/schema";
import { Link2, LoaderCircle, RotateCw, Trash2 } from "lucide-react";
import { Button } from "../../ui/Button";

/** What went wrong, in plain words, and what to try. Anything else shows the job's own message. */
const FAILURES: Record<string, string> = {
  retries_exhausted: "The site could not be reached. Check the link, or try again later.",
  blocked: "The site blocked the request. Trying again sometimes works.",
  no_recipe:
    "No recipe was found on that page. Pasting a recipe's text will be possible in a later version.",
};

/** The site a link points at, without the "www". */
export function importHost(job: Pick<ImportJob, "sourceUrl">): string {
  try {
    return new URL(job.sourceUrl ?? "").hostname.replace(/^www\./, "");
  } catch {
    return "a link";
  }
}

/** One line saying where an import has got to. */
export function importStatus(job: ImportJob): string {
  switch (job.status) {
    case "queued":
      return "Waiting to start";
    case "running":
      return "Reading the page";
    case "needs_review":
      return "Ready to review";
    case "failed":
      return FAILURES[job.error?.code ?? ""] ?? job.error?.message ?? "The import did not work.";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Saved";
  }
}

/**
 * An import from a link, shown above the recipes until a person has dealt with
 * it. It is not a recipe yet: it has no category colour and does not open one.
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
  const host = importHost(job);
  const title = job.result?.draft.title.trim() || host;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-4 py-2.5">
      <span
        aria-hidden="true"
        className="grid size-12 flex-none place-items-center rounded-sm bg-stock-plain text-ink"
      >
        <Link2 size="1.375rem" />
      </span>
      <span className="min-w-[8rem] flex-1">
        <span className="block text-lg font-semibold leading-tight">{title}</span>
        <span className="mt-0.5 block text-sm">
          {working ? (
            <LoaderCircle
              aria-hidden="true"
              size="1rem"
              className="mr-1.5 inline-block animate-spin align-[-0.15em] motion-reduce:animate-none"
            />
          ) : null}
          <span className={job.status === "failed" ? undefined : "font-semibold"}>
            {importStatus(job)}
            {working ? "…" : ""}
          </span>
          {title === host ? null : ` · ${host}`}
        </span>
      </span>
      {job.status === "needs_review" ? (
        <Button onClick={() => onReview?.(job)}>Review</Button>
      ) : null}
      {job.status === "failed" ? (
        <span className="flex flex-wrap gap-2">
          <Button
            variant="quiet"
            icon={<RotateCw aria-hidden="true" size="1.125rem" />}
            onClick={() => onRetry?.(job)}
          >
            Try again
          </Button>
          <Button
            variant="quiet"
            icon={<Trash2 aria-hidden="true" size="1.125rem" />}
            onClick={() => onRemove?.(job)}
          >
            Remove
          </Button>
        </span>
      ) : null}
    </li>
  );
}
