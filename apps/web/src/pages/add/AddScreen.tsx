import { UrlImportRequest } from "@recipeflare/schema";
import { CloudOff, Link2, PencilLine, Plus } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "../../ui/Button";
import { FIELD } from "../../ui/field";
import { Notice } from "../../ui/Notice";
import { Page } from "../../ui/Page";

/**
 * Where a recipe starts: typed in, or brought in from a link. Photographing a
 * card joins these in Phase 2.
 */
export function AddScreen({
  onType,
  onImport,
  offline = false,
}: {
  /** Opens the editor on a new recipe. */
  onType?: () => void;
  /** Starts an import from a link that has passed the shared schema's check. Without it, importing is not offered. */
  onImport?: (url: string) => void;
  offline?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const urlId = useId();
  const problemId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const request = UrlImportRequest.safeParse({ kind: "url", url: url.trim() });
    if (!request.success) {
      setProblem(
        url.trim() === ""
          ? "Paste the address of a recipe page first."
          : "That does not look like a web address. It should start with https://",
      );
      return;
    }
    setProblem(null);
    onImport?.(request.data.url);
  };

  return (
    <Page title="Add a recipe">
      {offline ? (
        <Notice icon={<CloudOff aria-hidden="true" size="1.125rem" className="flex-none" />}>
          You are offline. Adding and importing need a connection.
        </Notice>
      ) : null}

      <section className="border-b border-rule px-4 py-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <PencilLine aria-hidden="true" size="1.25rem" />
          Type it in
        </h2>
        <p className="mt-1 max-w-[38ch]">
          Enter a recipe from a card or from memory, with the lines written the way the card writes
          them.
        </p>
        <Button
          variant="add"
          className="mt-4"
          icon={<Plus aria-hidden="true" size="1.25rem" />}
          disabled={offline}
          onClick={onType}
        >
          Type a recipe
        </Button>
      </section>

      {onImport ? (
        <form noValidate onSubmit={submit} className="px-4 py-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Link2 aria-hidden="true" size="1.25rem" />
            From a link
          </h2>
          <p className="mt-1 max-w-[38ch]">
            Paste the address of a recipe page. The app reads it and shows you what it found to
            check before anything is saved.
          </p>
          <label htmlFor={urlId} className="mt-4 mb-1 block text-sm font-semibold">
            Recipe page address
          </label>
          <input
            id={urlId}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={url}
            disabled={offline}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? problemId : undefined}
            onChange={(event) => setUrl(event.target.value)}
            className={`${FIELD} max-w-[34rem]`}
          />
          {problem ? (
            <div id={problemId} className="mt-2 max-w-[34rem]">
              <Notice problem>{problem}</Notice>
            </div>
          ) : null}
          <Button type="submit" className="mt-4" disabled={offline}>
            Import
          </Button>
        </form>
      ) : null}
    </Page>
  );
}
