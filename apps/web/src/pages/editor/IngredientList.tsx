import { formatQuantity } from "@recipeflare/schema";
import { ChevronDown, Plus, Rows3, ScanText } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { Mark, TextField } from "../../ui/Field";
import { FIELD } from "../../ui/field";
import { Notice } from "../../ui/Notice";
import { Picker } from "../../ui/Picker";
import {
  type EditorLists,
  type FieldErrors,
  type IngredientListRow,
  isAsWritten,
  type LineParser,
  type LineReader,
  type LineRow,
  lineSummary,
  moveRow,
  newDivider,
  newLine,
  readQuantity,
  splitEntries,
} from "./editorState";
import { ClosedRow, DividerClosed, DividerOpen, RowActions, SMALL_BUTTON } from "./rowParts";
import { SortableRows } from "./SortableRows";

/** What the panel says after a model was asked to read the line. */
const READING_SAID: Record<string, { text: string; problem?: boolean }> = {
  read: { text: "Read by AI. Check it against the line. Keep as written undoes it." },
  nothing: { text: "AI could not read any more from this line. It stays as written." },
  offline: { text: "Reading with AI needs a connection.", problem: true },
  "signed-out": { text: "Sign in again to read this line with AI.", problem: true },
  busy: { text: "The AI could not be reached. Try again later.", problem: true },
  limit: { text: "The allowance for AI is used up for now. Try again later.", problem: true },
  failed: { text: "The line could not be read with AI.", problem: true },
};

const PICK =
  "transition-rf flex min-h-touch w-full items-center justify-between gap-2 rounded-md border border-rule-strong bg-surface px-3 text-left text-base hover:bg-surface-sunk";

/** The fields the app read out of one line, each of which the cook can correct. */
function LinePanel({
  row,
  lists,
  parse,
  error,
  onChange,
  onCreateUnit,
  readLine,
  actions,
}: {
  row: LineRow;
  lists: EditorLists;
  parse: LineParser;
  /** Asks a model to read the line. Without it the panel does not offer to. */
  readLine?: LineReader;
  error?: string;
  onChange: (row: LineRow) => void;
  onCreateUnit: (name: string) => string;
  actions: (keepAsWritten: React.ReactNode) => React.ReactNode;
}) {
  const [amount, setAmount] = useState(row.quantity === null ? "" : formatQuantity(row.quantity));
  const [picking, setPicking] = useState<"unit" | "food" | null>(null);
  const unit = lists.units.find((u) => u.id === row.unitId);
  const food = lists.foods.find((f) => f.id === row.foodId);
  const amountRead = amount.trim() === "" ? null : readQuantity(amount);
  const amountBad = amount.trim() !== "" && amountRead?.rest.trim() !== "";
  const asWritten = isAsWritten(row);
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState<keyof typeof READING_SAID | null>(null);
  // The line as it is now, so that an answer about an earlier wording is let go.
  const text = useRef(row.text);
  text.current = row.text;
  const askAi = async () => {
    if (!readLine) {
      return;
    }
    const asked = row.text;
    setAsking(true);
    setSaid(null);
    const answer = await readLine(asked.trim());
    setAsking(false);
    if (text.current !== asked) {
      return;
    }
    if (answer.read) {
      onChange({ ...row, ...answer.read });
      setAmount(answer.read.quantity ? formatQuantity(answer.read.quantity) : "");
      setSaid("read");
    } else {
      setSaid(answer.why);
    }
  };

  return (
    <div className="py-3 pr-4 pl-1">
      <TextField
        label="Line as written"
        verbatim
        value={row.text}
        error={error}
        hint="Kept exactly as you type it. Changing it reads the line again."
        onChange={(text) => {
          // The words changed, so what was read from them is read afresh.
          setSaid(null);
          const next = parse(text.trim());
          onChange({
            ...row,
            text,
            quantity: next?.quantity ?? null,
            unitId: next?.unitId ?? null,
            foodId: next?.foodId ?? null,
            newFood: next?.newFood ?? null,
            note: next?.note ?? "",
          });
          setAmount(next?.quantity ? formatQuantity(next.quantity) : "");
        }}
      />

      <fieldset className="mt-4">
        <legend className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
          What the app read
          {asWritten ? <Mark>as written</Mark> : null}
        </legend>
        {asWritten && readLine && row.text.trim() !== "" ? (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="min-w-0 flex-1 basis-48 text-sm">
              The app could not read this line. An AI model can try, when you ask.
            </p>
            <button
              type="button"
              className={SMALL_BUTTON}
              disabled={asking}
              onClick={() => void askAi()}
            >
              <ScanText aria-hidden="true" size="1.125rem" />
              {asking ? "Reading…" : "Read with AI"}
            </button>
          </div>
        ) : null}
        {said ? (
          <div className="mb-3">
            <Notice problem={READING_SAID[said]?.problem}>{READING_SAID[said]?.text}</Notice>
          </div>
        ) : null}
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-3">
          <TextField
            label="Amount"
            value={amount}
            inputMode="text"
            error={amountBad ? "Use a number such as 2 or 1 1/2." : undefined}
            onChange={(text) => {
              setAmount(text);
              const read = text.trim() === "" ? null : readQuantity(text);
              if (text.trim() === "") {
                onChange({ ...row, quantity: null });
              } else if (read && read.rest.trim() === "") {
                onChange({ ...row, quantity: read.quantity });
              }
            }}
          />
          <div>
            <span className="mb-1 block text-sm font-semibold" id={`${row.id}-unit`}>
              Unit
            </span>
            <button
              type="button"
              aria-labelledby={`${row.id}-unit`}
              aria-describedby={`${row.id}-unit-value`}
              className={PICK}
              onClick={() => setPicking("unit")}
            >
              <span id={`${row.id}-unit-value`} className="truncate">
                {unit ? unit.name : "None"}
              </span>
              <ChevronDown aria-hidden="true" size="1.25rem" className="flex-none" />
            </button>
          </div>
          <div className="col-span-2">
            <span className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span id={`${row.id}-food`}>Food</span>
              {row.newFood && !food ? <Mark>new</Mark> : null}
            </span>
            <button
              type="button"
              aria-labelledby={`${row.id}-food`}
              aria-describedby={`${row.id}-food-value`}
              className={PICK}
              onClick={() => setPicking("food")}
            >
              <span id={`${row.id}-food-value`} className="truncate">
                {food ? food.name : (row.newFood ?? "None")}
              </span>
              <ChevronDown aria-hidden="true" size="1.25rem" className="flex-none" />
            </button>
            {row.newFood && !food ? (
              <p className="mt-1 text-sm">
                Not one of your foods yet. It is added when you save, after you have confirmed it.
              </p>
            ) : null}
          </div>
          <TextField
            className="col-span-2"
            label="Note"
            value={row.note}
            onChange={(note) => onChange({ ...row, note })}
          />
        </div>
      </fieldset>

      {actions(
        <button
          type="button"
          className={SMALL_BUTTON}
          disabled={asWritten}
          onClick={() => {
            setAmount("");
            setSaid(null);
            onChange({
              ...row,
              quantity: null,
              unitId: null,
              foodId: null,
              newFood: null,
              note: "",
            });
          }}
        >
          Keep as written
        </button>,
      )}

      <Picker
        open={picking === "unit"}
        onClose={() => setPicking(null)}
        title="Unit"
        searchLabel="Find a unit"
        options={lists.units.map((u) => ({
          id: u.id,
          name: u.name,
          detail: u.abbreviation ? `Written ${u.abbreviation}` : undefined,
        }))}
        selected={row.unitId ? [row.unitId] : []}
        onPick={(unitId) => onChange({ ...row, unitId })}
        onClear={() => onChange({ ...row, unitId: null })}
        onCreate={(name) => onChange({ ...row, unitId: onCreateUnit(name) })}
        createNoun="unit"
      />
      <Picker
        open={picking === "food"}
        onClose={() => setPicking(null)}
        title="Food"
        searchLabel="Find a food"
        options={lists.foods.map((f) => ({ id: f.id, name: f.name }))}
        selected={row.foodId ? [row.foodId] : []}
        onPick={(foodId) => onChange({ ...row, foodId, newFood: null })}
        onClear={() => onChange({ ...row, foodId: null, newFood: null })}
        // A new food is only a name on the line until the recipe is saved.
        onCreate={(name) => onChange({ ...row, foodId: null, newFood: name })}
        createNoun="food"
      />
    </div>
  );
}

/**
 * The ingredients as one list in which a section is a titled divider row.
 * Lines are typed as the card writes them; under each is what the app read.
 * A closed row opens for editing when it is pressed, one at a time.
 */
export function IngredientList({
  rows,
  onChange,
  lists,
  parse,
  errors,
  flagged = [],
  onCreateUnit,
  readLine,
}: {
  rows: IngredientListRow[];
  onChange: (rows: IngredientListRow[]) => void;
  lists: EditorLists;
  parse: LineParser;
  /** Asks a model to read a line the rules could not. Without it no line offers to. */
  readLine?: LineReader;
  errors: FieldErrors;
  /** Rows the cook should look at, by ID: used in review. */
  flagged?: readonly string[];
  onCreateUnit: (name: string) => string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const entryRef = useRef<HTMLInputElement>(null);

  const replace = (next: IngredientListRow) =>
    onChange(rows.map((row) => (row.id === next.id ? next : row)));
  const add = (text: string) => {
    const lines = splitEntries(text).map((line) => newLine(line, parse));
    if (lines.length > 0) {
      onChange([...rows, ...lines]);
    }
    setEntry("");
    entryRef.current?.focus();
    // Each added line pushes the box down. Keep it clear of the action bar.
    requestAnimationFrame(() => entryRef.current?.scrollIntoView?.({ block: "nearest" }));
  };

  return (
    <>
      <SortableRows
        label="Ingredient lines"
        rows={rows}
        onMove={(from, to) => onChange(moveRow(rows, from, to))}
        nameOf={(row) => (row.kind === "divider" ? `the section ${row.title}` : row.text)}
        renderRow={(row, index) => {
          const error = errors[`row:${row.id}`];
          const actions = (extra?: React.ReactNode) => (
            <RowActions
              first={index === 0}
              last={index === rows.length - 1}
              onUp={() => onChange(moveRow(rows, index, index - 1))}
              onDown={() => onChange(moveRow(rows, index, index + 1))}
              onDelete={() => {
                onChange(rows.filter((other) => other.id !== row.id));
                setOpenId(null);
              }}
              onDone={() => setOpenId(null)}
              deleteLabel={row.kind === "divider" ? "Remove title" : "Delete"}
            >
              {extra}
            </RowActions>
          );
          if (row.kind === "divider") {
            return openId === row.id ? (
              <DividerOpen
                row={row}
                error={error}
                onTitle={(title) => replace({ ...row, title })}
                actions={actions()}
              />
            ) : (
              <ClosedRow onOpen={() => setOpenId(row.id)} label="Edit the section" error={error}>
                <DividerClosed row={row} />
              </ClosedRow>
            );
          }
          if (openId === row.id) {
            return (
              <LinePanel
                row={row}
                lists={lists}
                parse={parse}
                error={error}
                onChange={replace}
                onCreateUnit={onCreateUnit}
                readLine={readLine}
                actions={actions}
              />
            );
          }
          const summary = lineSummary(row, lists);
          return (
            <ClosedRow
              onOpen={() => setOpenId(row.id)}
              label="Edit"
              error={error}
              flagged={flagged.includes(row.id)}
            >
              <span className="block">{row.text}</span>
              <span
                className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm"
                data-testid="line-read"
              >
                {summary.length === 0 ? (
                  <Mark>as written</Mark>
                ) : (
                  summary.map((part, at) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one line never reorder
                    <span key={at} className="inline-flex max-w-full items-center gap-1.5">
                      {at > 0 ? <span aria-hidden="true">·</span> : null}
                      <span className="min-w-0 font-semibold">{part.text}</span>
                      {part.isNew ? <Mark>new</Mark> : null}
                    </span>
                  ))
                )}
              </span>
            </ClosedRow>
          );
        }}
      />

      <div className="border-t border-rule px-4 py-3">
        <label htmlFor="ingredient-entry" className="mb-1 block text-sm font-semibold">
          Add an ingredient
        </label>
        <div className="flex gap-2">
          <input
            id="ingredient-entry"
            ref={entryRef}
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            // A card's "C." and "t." must reach the list as typed.
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="enter"
            value={entry}
            aria-describedby={rows.length === 0 ? "ingredient-entry-hint" : undefined}
            onChange={(event) => setEntry(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(entry);
              }
            }}
            onPaste={(event) => {
              // Several lines pasted at once become one ingredient each.
              const pasted = event.clipboardData.getData("text");
              if (/\r?\n/.test(pasted.trim())) {
                event.preventDefault();
                add(`${entry}${pasted}`);
              }
            }}
            className={`${FIELD} min-w-0 flex-1 scroll-mb-[calc(var(--rf-nav-height)+6rem)]`}
          />
          <Button
            variant="quiet"
            className="flex-none"
            icon={<Plus aria-hidden="true" size="1.25rem" />}
            onClick={() => add(entry)}
          >
            Add
          </Button>
        </div>
        {/* The hint is for the first line. Once there is one, the list itself shows how it works. */}
        {rows.length === 0 ? (
          <p id="ingredient-entry-hint" className="mt-1 text-sm">
            Type it the way the card writes it, such as 2 1/4 C. flour, and press Enter for the
            next.
          </p>
        ) : null}
        <button
          type="button"
          className={`${SMALL_BUTTON} mt-3`}
          onClick={() => {
            const divider = newDivider();
            onChange([...rows, divider]);
            setOpenId(divider.id);
          }}
        >
          <Rows3 aria-hidden="true" size="1.125rem" />
          Add a section title
        </button>
      </div>
    </>
  );
}
