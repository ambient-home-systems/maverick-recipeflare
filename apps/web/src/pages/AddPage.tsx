import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SignedOutError, UnreachableError } from "../api/client";
import { useStartImport } from "../api/queries";
import { bookmarkletFor, readSentPage } from "../api/sentPage";
import { useOnline } from "../api/useOnline";
import { AddScreen } from "./add/AddScreen";

/** Why an import could not be started, in words for the cook. */
function startProblem(error: unknown): string {
  if (error instanceof SignedOutError) {
    return "The import was not started: you have been signed out. Sign in again, then press Import.";
  }
  if (error instanceof UnreachableError) {
    return "The import was not started: the server could not be reached. Try again when there is a connection.";
  }
  return "The import could not be started. Try again.";
}

/**
 * Where a recipe starts. Typing one in opens the editor, and photographing
 * cards opens the capture page. A link, or text pasted in, is handed to the server, and the list then shows the import as a
 * row with its progress.
 * A page sent by the browser's bookmark arrives in the address and is offered
 * for import; it is not imported unasked, because any site could open such an address.
 */
export function AddPage() {
  const navigate = useNavigate();
  const online = useOnline();
  const start = useStartImport();
  const [sent, setSent] = useState(() => readSentPage(window.location.hash));
  const bookmarklet = useMemo(() => bookmarkletFor(window.location.origin), []);
  const toList = () => void navigate({ to: "/", search: {} });

  return (
    <AddScreen
      offline={!online}
      onType={() => navigate({ to: "/recipes/new" })}
      onPhotograph={() => navigate({ to: "/add/photos" })}
      onImport={(url) => start.mutate({ kind: "url", url }, { onSuccess: toList })}
      onPaste={(text) => start.mutate({ kind: "text", text }, { onSuccess: toList })}
      importing={start.isPending}
      importProblem={start.isError ? startProblem(start.error) : undefined}
      sent={
        sent === null
          ? undefined
          : sent.ok
            ? { host: sent.host, recipeName: sent.recipeName, fromText: sent.fromText }
            : { problem: sent.problem }
      }
      onImportSent={() => {
        if (sent?.ok) {
          const { url, siteName, blocks, text } = sent.page;
          start.mutate(
            { kind: "url", url, page: { siteName, blocks, text } },
            { onSuccess: toList },
          );
        }
      }}
      onDismissSent={() => {
        setSent(null);
        start.reset();
        // The page goes out of the address too, so a refresh does not bring it back.
        void navigate({ to: "/add", replace: true });
      }}
      bookmarklet={bookmarklet}
    />
  );
}
