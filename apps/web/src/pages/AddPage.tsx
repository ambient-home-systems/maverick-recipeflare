import { useNavigate } from "@tanstack/react-router";
import { SignedOutError, UnreachableError } from "../api/client";
import { useStartImport } from "../api/queries";
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
 * Where a recipe starts. Typing one in opens the editor. A link is handed to
 * the server, and the list then shows the import as a row with its progress.
 */
export function AddPage() {
  const navigate = useNavigate();
  const online = useOnline();
  const start = useStartImport();
  return (
    <AddScreen
      offline={!online}
      onType={() => navigate({ to: "/recipes/new" })}
      onImport={(url) =>
        start.mutate(url, { onSuccess: () => void navigate({ to: "/", search: {} }) })
      }
      importing={start.isPending}
      importProblem={start.isError ? startProblem(start.error) : undefined}
    />
  );
}
