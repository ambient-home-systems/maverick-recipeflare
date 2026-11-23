import { LIMITS, TextImportRequest, UrlImportRequest } from "@recipeflare/schema";
import {
  Bookmark,
  ClipboardPaste,
  CloudOff,
  Link2,
  MonitorUp,
  PencilLine,
  Plus,
} from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { FIELD } from "../../ui/field";
import { Notice } from "../../ui/Notice";
import { Page } from "../../ui/Page";

/** A recipe page the cook's own browser sent, or why what it sent cannot be used. */
export type SentRecipe = { host: string; recipeName: string | null } | { problem: string };

/**
 * Where a recipe starts: typed in, brought in from a link, written up from
 * text pasted in, or sent from the cook's own browser with a bookmark.
 * Photographing a card joins these later in Phase 2.
 */
export function AddScreen({
  onType,
  onImport,
  onPaste,
  importing = false,
  importProblem,
  sent,
  onImportSent,
  onDismissSent,
  bookmarklet,
  offline = false,
}: {
  /** Opens the editor on a new recipe. */
  onType?: () => void;
  /** Starts an import from a link that has passed the shared schema's check. Without it, importing is not offered. */
  onImport?: (url: string) => void;
  /**
   * Starts an import from text pasted in, which an AI model writes up as a
   * recipe. Without it, pasting is not offered.
   */
  onPaste?: (text: string) => void;
  /** True while the import is being handed over. */
  importing?: boolean;
  /** Why the import could not be started, in a sentence. The link is still in the box. */
  importProblem?: string;
  /** A recipe page that arrived from the browser's bookmark, waiting to be imported or let go. */
  sent?: SentRecipe;
  onImportSent?: () => void;
  onDismissSent?: () => void;
  /**
   * The bookmark's script, for the bookmarks bar. It holds this install's own
   * address, so the page makes it. Without it the bookmark is not offered.
   */
  bookmarklet?: string;
  offline?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [typed, setTyped] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pasted, setPasted] = useState<string | null>(null);
  // Which way in was used last: its button shows the work, and its form what the server said.
  const [used, setUsed] = useState<"link" | "text" | null>(null);
  const sentRecipe = sent && !("problem" in sent) ? sent : null;
  // What is wrong with what was typed comes first; then what the server said,
  // which belongs to the sent page when that is what was being imported.
  const said = (form: "link" | "text") =>
    sentRecipe || (used !== null && used !== form) ? null : (importProblem ?? null);
  const problem = typed ?? (used === "text" ? null : said("link"));
  const textProblem = pasted ?? (used === "text" ? said("text") : null);
  const [pressedHere, setPressedHere] = useState(false);
  // React does not write a script into a link's address. A bookmark has to be one, so it is set by hand.
  const bookmark = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (bookmarklet) {
      bookmark.current?.setAttribute("href", bookmarklet);
    }
  }, [bookmarklet]);
  const urlId = useId();
  const problemId = useId();
  const textId = useId();
  const textProblemId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const request = UrlImportRequest.safeParse({ kind: "url", url: url.trim() });
    if (!request.success) {
      setTyped(
        url.trim() === ""
          ? "Paste the address of a recipe page first."
          : "That does not look like a web address. It should start with https://",
      );
      return;
    }
    setTyped(null);
    setUsed("link");
    onImport?.(request.data.url);
  };

  const submitText = (event: FormEvent) => {
    event.preventDefault();
    const request = TextImportRequest.safeParse({ kind: "text", text });
    if (!request.success) {
      setPasted(
        text.trim() === ""
          ? "Paste a recipe's text first."
          : `That is more text than can be read at once. Paste the recipe by itself: up to ${LIMITS.pastedText.toLocaleString("en")} characters.`,
      );
      return;
    }
    setPasted(null);
    setUsed("text");
    onPaste?.(request.data.text);
  };

  return (
    <Page title="Add a recipe">
      {offline ? (
        <Notice icon={<CloudOff aria-hidden="true" size="1.125rem" className="flex-none" />}>
          You are offline. Adding and importing need a connection.
        </Notice>
      ) : null}

      {sent && "problem" in sent ? (
        <div className="border-b border-rule">
          <Notice problem>{sent.problem}</Notice>
          <div className="px-4 py-3">
            <Button variant="quiet" onClick={onDismissSent}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {sentRecipe ? (
        <section aria-labelledby="sent-heading" className="border-b border-rule px-4 py-5">
          <h2 id="sent-heading" className="flex items-center gap-2 text-lg font-bold">
            <MonitorUp aria-hidden="true" size="1.25rem" />
            Sent from your browser
          </h2>
          <p className="mt-1 max-w-[38ch] [overflow-wrap:anywhere]">
            {sentRecipe.recipeName ? (
              <>
                <span className="font-semibold">{sentRecipe.recipeName}</span>, from{" "}
              </>
            ) : (
              "A recipe from "
            )}
            <span className="font-semibold">{sentRecipe.host}</span>. Nothing is saved until you
            have checked it.
          </p>
          {importProblem ? (
            <div className="mt-2 max-w-[34rem]">
              <Notice problem>{importProblem}</Notice>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onImportSent} disabled={offline} busy={importing}>
              Import this recipe
            </Button>
            <Button variant="quiet" onClick={onDismissSent} disabled={importing}>
              Not now
            </Button>
          </div>
        </section>
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
          <Button
            type="submit"
            className="mt-4"
            disabled={offline || (importing && used === "text")}
            busy={importing && used !== "text"}
          >
            Import
          </Button>
        </form>
      ) : null}

      {onPaste ? (
        <form noValidate onSubmit={submitText} className="border-t border-rule px-4 py-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <ClipboardPaste aria-hidden="true" size="1.25rem" />
            Paste text
          </h2>
          <p className="mt-1 max-w-[38ch]">
            Paste a recipe copied from a message, a document or a web page. An AI model writes it up
            as a recipe, and you check it against what you pasted before anything is saved.
          </p>
          <label htmlFor={textId} className="mt-4 mb-1 block text-sm font-semibold">
            Recipe text
          </label>
          <textarea
            id={textId}
            rows={6}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={text}
            disabled={offline}
            aria-invalid={textProblem ? true : undefined}
            aria-describedby={textProblem ? textProblemId : undefined}
            onChange={(event) => setText(event.target.value)}
            className={`${FIELD} max-w-[34rem] py-2`}
          />
          {textProblem ? (
            <div id={textProblemId} className="mt-2 max-w-[34rem]">
              <Notice problem>{textProblem}</Notice>
            </div>
          ) : null}
          <Button
            type="submit"
            className="mt-4"
            disabled={offline || (importing && used !== "text")}
            busy={importing && used === "text"}
          >
            Import text
          </Button>
        </form>
      ) : null}

      {/* A bookmarks bar belongs to a computer: a wide screen with a mouse. A phone is not offered what it cannot do. */}
      {bookmarklet ? (
        <section
          aria-labelledby="bookmark-heading"
          className="hidden border-t border-rule px-4 py-5 md:pointer-fine:block"
        >
          <h2 id="bookmark-heading" className="flex items-center gap-2 text-lg font-bold">
            <Bookmark aria-hidden="true" size="1.25rem" />
            From your browser
          </h2>
          <p className="mt-1 max-w-[46ch]">
            Some sites do not let apps read their pages. For those, keep this bookmark in your
            browser's bookmarks bar. Open the recipe's page, press the bookmark, and the app opens
            with what the page says.
          </p>
          {/* biome-ignore lint/a11y/useValidAnchor: a bookmark is made by dragging a link, so this has to be one; pressing it here only explains that */}
          <a
            ref={bookmark}
            // The address is set when the page is shown. Until then the link leads nowhere.
            href="#bookmark"
            draggable
            onClick={(event) => {
              event.preventDefault();
              setPressedHere(true);
            }}
            className="transition-rf mt-4 inline-flex min-h-touch cursor-grab items-center gap-2 rounded-md border border-rule-strong bg-surface px-5 font-semibold text-ink no-underline hover:bg-surface-sunk"
          >
            <Bookmark aria-hidden="true" size="1.125rem" />
            Send to Recipeflare
          </a>
          <p className="mt-2 max-w-[46ch] text-sm" role={pressedHere ? "status" : undefined}>
            {pressedHere
              ? "It does nothing here. Drag it up to the bookmarks bar, then press it on a recipe's page."
              : "Drag it up to the bookmarks bar. If the bar is hidden, Ctrl+Shift+B shows it (⌘+Shift+B on a Mac)."}
          </p>
        </section>
      ) : null}
    </Page>
  );
}
