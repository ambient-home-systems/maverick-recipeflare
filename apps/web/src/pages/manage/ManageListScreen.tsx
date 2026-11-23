import { ArrowDown, ArrowUp, CloudOff, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "../../ui/Button";
import { DividerLinks } from "../../ui/DividerTabs";
import { FieldProblem, TextField } from "../../ui/Field";
import { FIELD } from "../../ui/field";
import { EmptyState, Notice } from "../../ui/Notice";
import { Page } from "../../ui/Page";
import { Sheet } from "../../ui/Sheet";
import { STOCK_BG, type Stock } from "../../ui/stock";

/** What an entry's boxes hold while it is being changed. A list of names is typed with commas between. */
export type ManageValues = Record<string, string | boolean>;

/** One box of an entry, beyond its name. Each list says which it has. */
export type ManageField =
  | { key: string; label: string; kind: "text"; hint?: string; verbatim?: boolean }
  | { key: string; label: string; kind: "toggle"; hint?: string }
  | {
      key: string;
      label: string;
      kind: "select";
      /** The first option is "none". */
      none: string;
      options: { value: string; label: string }[];
    };

export type ManageEntry = {
  id: string;
  name: string;
  /** How many recipes use it, or for a label how many foods. */
  use: number;
  /** A few words shown beside the use: a unit's abbreviation, a food's label. */
  detail?: string;
  /** A category's own colour. */
  stock?: Stock;
  values: ManageValues;
};

/** What happened to a change. A refusal may belong to the name box. */
export type ManageOutcome = { ok: true } | { ok: false; message: string; field?: "name" };

/** What the six lists call themselves and what uses them. */
export type ManageWords = {
  /** "Tags". */
  title: string;
  /** "tag". */
  one: string;
  /** What an entry is counted in: "recipe" or "food". */
  usedBy: "recipe" | "food";
  /** One sentence on what the list is for, shown when it is empty. */
  purpose: string;
};

type ManageListScreenProps = {
  words: ManageWords;
  /** The entries, in the order to show them. Null while they load. */
  entries: ManageEntry[] | null;
  /** The boxes an entry has besides its name. */
  fields: ManageField[];
  /** True when an entry that is in use cannot be deleted: foods and units. */
  keepIfUsed: boolean;
  /** True when the entries have an order of their own that can be changed: labels. */
  ordered?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  signedOut?: boolean;
  offline?: boolean;
  onAdd: (name: string) => Promise<ManageOutcome>;
  onSave: (entry: ManageEntry, values: ManageValues) => Promise<ManageOutcome>;
  onDelete: (entry: ManageEntry) => Promise<ManageOutcome>;
  onMove?: (entry: ManageEntry, by: -1 | 1) => Promise<ManageOutcome>;
};

/** How many foods a list holds before it offers a box to find one. */
const FIND_FROM = 12;
const SKELETON_ROWS = ["a", "b", "c", "d", "e"];

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function usedLine(entry: ManageEntry, words: ManageWords): string {
  const used = entry.use === 0 ? "Not used" : `Used in ${count(entry.use, words.usedBy)}`;
  return entry.detail ? `${entry.detail} · ${used}` : used;
}

/**
 * One of the household's lists: its entries with how much each is used, a box
 * to add one, and a sheet to change or delete one. All six lists use this
 * screen; they differ in the boxes an entry has. It is given its data and told
 * what to do with a change; it fetches nothing itself.
 */
export function ManageListScreen({
  words,
  entries,
  fields,
  keepIfUsed,
  ordered = false,
  failed = false,
  onRetry,
  signedOut = false,
  offline = false,
  onAdd,
  onSave,
  onDelete,
  onMove,
}: ManageListScreenProps) {
  const [adding, setAdding] = useState("");
  const [addProblem, setAddProblem] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [values, setValues] = useState<ManageValues>({});
  const [problem, setProblem] = useState<{ message: string; field?: "name" } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"add" | "save" | "delete" | "move" | null>(null);
  const addId = useId();
  const addProblemId = useId();
  const findId = useId();

  const open = entries?.find((entry) => entry.id === openId) ?? null;
  const readOnly = offline || signedOut;
  const shown =
    entries && find.trim() !== ""
      ? entries.filter((entry) => fold(entry.name).includes(fold(find.trim())))
      : entries;

  const openEntry = (entry: ManageEntry) => {
    setOpenId(entry.id);
    setValues({ name: entry.name, ...entry.values });
    setProblem(null);
    setConfirming(false);
  };
  const close = () => {
    setOpenId(null);
    setConfirming(false);
    setProblem(null);
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const name = adding.trim();
    if (name === "") {
      setAddProblem(`Type a name for the ${words.one} first.`);
      return;
    }
    setBusy("add");
    const outcome = await onAdd(name);
    setBusy(null);
    if (outcome.ok) {
      setAdding("");
      setAddProblem(null);
    } else {
      setAddProblem(outcome.message);
    }
  };

  /** Runs a change on the open entry, and closes the sheet if it went through. */
  const run = async (kind: "save" | "delete", change: () => Promise<ManageOutcome>) => {
    setBusy(kind);
    const outcome = await change();
    setBusy(null);
    if (outcome.ok) {
      close();
    } else {
      setConfirming(false);
      setProblem(outcome);
    }
  };

  const save = () => {
    if (!open) {
      return;
    }
    if (String(values.name ?? "").trim() === "") {
      setProblem({ field: "name", message: `A ${words.one} needs a name.` });
      return;
    }
    void run("save", () => onSave(open, values));
  };

  const move = async (by: -1 | 1) => {
    if (!open || !onMove) {
      return;
    }
    setBusy("move");
    const outcome = await onMove(open, by);
    setBusy(null);
    setProblem(outcome.ok ? null : outcome);
  };

  const position = open && entries ? entries.findIndex((entry) => entry.id === open.id) : -1;
  const cannotDelete = open !== null && keepIfUsed && open.use > 0;

  return (
    <>
      <DividerLinks
        label="Back to"
        to="/manage"
        links={[{ key: "manage", label: "Manage", stock: "plain" }]}
      />
      <Page joined title={words.title} aside={entries ? count(entries.length, words.one) : null}>
        {offline ? (
          <Notice icon={<CloudOff aria-hidden="true" size="1.125rem" className="flex-none" />}>
            You are offline. The lists can be read; changing them needs a connection.
          </Notice>
        ) : null}
        {failed && entries !== null ? (
          <Notice problem>The list could not be brought up to date.</Notice>
        ) : null}

        {entries === null && signedOut ? (
          <EmptyState title={`Sign in to see your ${words.title.toLowerCase()}`}>
            This needs the server, and you have been signed out.
          </EmptyState>
        ) : entries === null && failed ? (
          <>
            <Notice problem>The list could not be loaded.</Notice>
            <EmptyState
              title={`Could not load the ${words.title.toLowerCase()}`}
              actions={
                onRetry ? (
                  <Button variant="quiet" onClick={onRetry}>
                    Try again
                  </Button>
                ) : null
              }
            >
              Something went wrong between here and the server. Nothing has been changed.
            </EmptyState>
          </>
        ) : entries === null ? (
          <>
            <p className="sr-only" role="status">
              Loading the {words.title.toLowerCase()}
            </p>
            <ul aria-hidden="true">
              {SKELETON_ROWS.map((row) => (
                <li key={row} className="grid gap-2 border-b border-rule px-4 py-3.5">
                  <span className="skeleton h-4 w-2/5" />
                  <span className="skeleton h-3 w-1/4" />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <form noValidate onSubmit={add} className="border-b border-rule px-4 py-3">
              <label htmlFor={addId} className="mb-1 block text-sm font-semibold">
                Add a {words.one}
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id={addId}
                  type="text"
                  autoComplete="off"
                  enterKeyHint="done"
                  value={adding}
                  disabled={readOnly}
                  aria-invalid={addProblem ? true : undefined}
                  aria-describedby={addProblem ? addProblemId : undefined}
                  onChange={(event) => {
                    setAdding(event.target.value);
                    setAddProblem(null);
                  }}
                  className={`${FIELD} min-w-[min(12rem,100%)] flex-1`}
                />
                <Button
                  type="submit"
                  className="flex-none"
                  icon={<Plus aria-hidden="true" size="1.25rem" />}
                  busy={busy === "add"}
                  disabled={readOnly}
                >
                  Add
                </Button>
              </div>
              {addProblem ? <FieldProblem id={addProblemId}>{addProblem}</FieldProblem> : null}
            </form>

            {entries.length > FIND_FROM ? (
              <div className="border-b border-rule px-4 py-3">
                <label htmlFor={findId} className="mb-1 block text-sm font-semibold">
                  Find a {words.one}
                </label>
                <input
                  id={findId}
                  type="search"
                  autoComplete="off"
                  value={find}
                  onChange={(event) => setFind(event.target.value)}
                  className={FIELD}
                />
              </div>
            ) : null}

            {entries.length === 0 ? (
              <EmptyState title={`No ${words.title.toLowerCase()} yet`}>{words.purpose}</EmptyState>
            ) : shown?.length === 0 ? (
              <EmptyState
                title={`No ${words.one} matches`}
                actions={
                  <Button variant="quiet" onClick={() => setFind("")}>
                    Show them all
                  </Button>
                }
              >
                Nothing in this list has “{find.trim()}” in its name.
              </EmptyState>
            ) : (
              <ul aria-label={words.title}>
                {shown?.map((entry) => (
                  <li key={entry.id} className="border-b border-rule last:border-b-0">
                    <button
                      type="button"
                      onClick={() => openEntry(entry)}
                      className="transition-rf flex min-h-touch w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-sunk"
                    >
                      {entry.stock ? (
                        <span
                          aria-hidden="true"
                          className={`size-8 flex-none rounded-sm border border-rule ${STOCK_BG[entry.stock]}`}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold [overflow-wrap:anywhere]">
                          {entry.name}
                        </span>
                        <span className="block text-sm">{usedLine(entry, words)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Page>

      <Sheet
        open={open !== null}
        onClose={close}
        title={confirming ? `Delete this ${words.one}?` : `Change ${words.one}`}
        footer={
          confirming ? (
            <>
              <Button variant="quiet" disabled={busy !== null} onClick={() => setConfirming(false)}>
                Keep it
              </Button>
              <Button
                icon={<Trash2 aria-hidden="true" size="1.25rem" />}
                busy={busy === "delete"}
                onClick={() => open && void run("delete", () => onDelete(open))}
              >
                Delete {words.one}
              </Button>
            </>
          ) : (
            <>
              {cannotDelete ? null : (
                <Button
                  variant="quiet"
                  icon={<Trash2 aria-hidden="true" size="1.25rem" />}
                  disabled={readOnly || busy !== null}
                  onClick={() => setConfirming(true)}
                >
                  Delete
                </Button>
              )}
              <Button busy={busy === "save"} disabled={readOnly} onClick={save}>
                Save
              </Button>
            </>
          )
        }
      >
        {open && confirming ? (
          <p className="px-4 py-4">
            <span className="font-semibold">{open.name}</span>{" "}
            {open.use === 0
              ? `is not used by any ${words.usedBy}. It will be deleted for everyone in the household.`
              : `will be taken off ${count(open.use, words.usedBy)} and deleted for everyone in the household. The ${words.usedBy}s stay.`}
          </p>
        ) : open ? (
          <div className="grid gap-4 px-4 py-4">
            {problem && !problem.field ? <Notice problem>{problem.message}</Notice> : null}
            <TextField
              label="Name"
              value={String(values.name ?? "")}
              error={problem?.field === "name" ? problem.message : undefined}
              onChange={(name) => {
                setValues((now) => ({ ...now, name }));
                setProblem(null);
              }}
              onEnter={save}
            />
            {fields.map((field) =>
              field.kind === "text" ? (
                <TextField
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  verbatim={field.verbatim}
                  value={String(values[field.key] ?? "")}
                  onChange={(text) => setValues((now) => ({ ...now, [field.key]: text }))}
                />
              ) : field.kind === "toggle" ? (
                <label key={field.key} className="relative flex min-h-touch items-start gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={values[field.key] === true}
                    onChange={(event) =>
                      setValues((now) => ({ ...now, [field.key]: event.target.checked }))
                    }
                    className="mt-0.5 size-6 flex-none accent-[var(--rf-primary)]"
                  />
                  <span>
                    <span className="block font-semibold">{field.label}</span>
                    {field.hint ? <span className="block text-sm">{field.hint}</span> : null}
                  </span>
                </label>
              ) : (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-sm font-semibold">{field.label}</span>
                  <select
                    value={String(values[field.key] ?? "")}
                    onChange={(event) =>
                      setValues((now) => ({ ...now, [field.key]: event.target.value }))
                    }
                    className={`${FIELD} font-semibold`}
                  >
                    <option value="">{field.none}</option>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ),
            )}

            {ordered && onMove && entries ? (
              <div>
                <p className="mb-1 text-sm font-semibold">
                  Place in the list: {position + 1} of {entries.length}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="quiet"
                    icon={<ArrowUp aria-hidden="true" size="1.125rem" />}
                    disabled={readOnly || busy !== null || position <= 0}
                    onClick={() => void move(-1)}
                  >
                    Move up
                  </Button>
                  <Button
                    variant="quiet"
                    icon={<ArrowDown aria-hidden="true" size="1.125rem" />}
                    disabled={readOnly || busy !== null || position >= entries.length - 1}
                    onClick={() => void move(1)}
                  >
                    Move down
                  </Button>
                </div>
              </div>
            ) : null}

            <p className="text-sm">
              {open.use === 0
                ? `Not used by any ${words.usedBy}.`
                : `Used in ${count(open.use, words.usedBy)}.`}{" "}
              {cannotDelete
                ? `A ${words.one} that recipes use cannot be deleted. It can always be renamed.`
                : open.use > 0
                  ? `A new name shows on ${open.use === 1 ? "it" : "all of them"} at once.`
                  : ""}
            </p>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
