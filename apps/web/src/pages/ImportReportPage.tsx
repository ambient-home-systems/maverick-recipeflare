import { useState } from "react";
import { ApiError } from "../api/client";
import { useCompare, useImportReport } from "../api/queries";
import { useSignedOut } from "../api/session";
import { useOnline } from "../api/useOnline";
import { type CompareSaid, ImportReportScreen } from "./report/ImportReportScreen";

/** What a press of a compare button came to, in words. */
function startedWords(profile: string, started: number, waiting: number): string {
  if (started === 0) {
    return `Nothing to start: every saved card already has a run with ${profile}.`;
  }
  const runs = started === 1 ? "1 run" : `${started} runs`;
  return waiting > 0
    ? `Started ${runs} with ${profile}. ${waiting} more can be started once these are done.`
    : `Started ${runs} with ${profile}. Each appears under its import as it finishes.`;
}

/**
 * The import report at `/manage/import-report`. It fetches the report and
 * hands it to the screen; the screen is offered a way to compare only when
 * the report says there are profiles to compare with.
 */
export function ImportReportPage() {
  const report = useImportReport();
  const compare = useCompare();
  const online = useOnline();
  const signedOut = useSignedOut();
  const [said, setSaid] = useState<CompareSaid | null>(null);

  const start = (profile: string) => {
    setSaid(null);
    compare.mutate(profile, {
      onSuccess: ({ started, waiting }) =>
        setSaid({ problem: false, words: startedWords(profile, started, waiting) }),
      onError: (error) =>
        setSaid({
          problem: true,
          words:
            error instanceof ApiError
              ? `The runs could not be started. ${error.message}.`
              : "The runs could not be started. Check the connection and try again.",
        }),
    });
  };

  return (
    <ImportReportScreen
      cards={report.data?.cards ?? null}
      compareWith={report.data?.compareWith ?? []}
      onCompare={start}
      comparing={compare.isPending ? (compare.variables ?? null) : null}
      compareSaid={said}
      failed={report.isError && !report.data}
      onRetry={() => void report.refetch()}
      signedOut={signedOut}
      offline={!online}
    />
  );
}
