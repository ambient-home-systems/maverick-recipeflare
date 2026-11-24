import { formatDuration, readStatedDuration } from "@recipeflare/schema";
import { Plus, Rows3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { RemovableChip } from "../../ui/Chip";
import { TextArea, TextField } from "../../ui/Field";
import { FIELD } from "../../ui/field";
import { Picker } from "../../ui/Picker";
import {
  type FieldErrors,
  moveRow,
  newDivider,
  newStep,
  retextStep,
  type StepListRow,
  type StepReader,
  type StepRow,
  splitEntries,
} from "./editorState";
import { ClosedRow, DividerClosed, DividerOpen, RowActions, SMALL_BUTTON } from "./rowParts";
import { SortableRows } from "./SortableRows";

/** A step's number within its section: numbering starts again after each section title. */
function stepNumbers(rows: readonly StepListRow[]): Map<string, number> {
  const numbers = new Map<string, number>();
  let count = 0;
  for (const row of rows) {
    if (row.kind === "divider") {
      count = 0;
    } else {
      count += 1;
      numbers.set(row.id, count);
    }
  }
  return numbers;
}

/** One of the recipe's ingredient lines, as a step names it. */
export type StepLine = {
  id: string;
  /** Its food, or failing that its own words. */
  label: string;
  /** The line as written, to tell two lines of the same food apart. */
  text: string;
};

/** A time as typed for a step: "20 min", "1 hr 30 min", or a bare number of minutes. */
function readTime(text: string): number | null {
  const typed = text.trim();
  return /^\d+$/.test(typed) ? Number(typed) * 60 || null : readStatedDuration(typed);
}

/** How many ingredients a closed step names before it counts the rest. */
const NAMED = 3;

/**
 * A step's time and its ingredients, in a few words: "15 min · butter, flour".
 * It is a note under the step, so it stays shorter than the step: past three
 * ingredients it names three and counts the rest.
 */
function detailsLine(row: StepRow, lines: readonly StepLine[]): string {
  const names = row.ingredientIds.flatMap(
    (id) => lines.find((line) => line.id === id)?.label ?? [],
  );
  const named =
    names.length > NAMED
      ? `${names.slice(0, NAMED).join(", ")} and ${names.length - NAMED} more`
      : names.join(", ");
  return [
    ...(row.durationSeconds === null ? [] : [formatDuration(row.durationSeconds)]),
    ...(named === "" ? [] : [named]),
  ].join(" · ");
}

/**
 * What a step says about itself, for the cook to correct: its time, and which
 * ingredient lines it uses. Both are read from the step's words to begin
 * with; what is set here is kept when the words change.
 */
function StepDetailFields({
  row,
  lines,
  onChange,
}: {
  row: StepRow;
  lines: readonly StepLine[];
  onChange: (row: StepRow) => void;
}) {
  const shown = row.durationSeconds === null ? "" : formatDuration(row.durationSeconds);
  const [time, setTime] = useState(shown);
  const [picking, setPicking] = useState(false);
  // A time half typed is not yet a wrong one: the problem is said once the box is left.
  const [left, setLeft] = useState(false);
  // The step's words can set the time too. What was typed stays as typed while it says the same.
  useEffect(() => {
    setTime((typed) => (readTime(typed) === row.durationSeconds ? typed : shown));
  }, [row.durationSeconds, shown]);
  const timeBad = left && time.trim() !== "" && readTime(time) === null;
  const used = row.ingredientIds.flatMap((id) => lines.find((line) => line.id === id) ?? []);
  const toggle = (id: string) =>
    onChange({
      ...row,
      ingredientIds: row.ingredientIds.includes(id)
        ? row.ingredientIds.filter((other) => other !== id)
        : // Kept in the recipe's order, whatever order they were picked in.
          lines.flatMap((line) =>
            line.id === id || row.ingredientIds.includes(line.id) ? [line.id] : [],
          ),
    });

  return (
    <fieldset className="mt-4">
      {/* A sentence, not a third label over two labelled fields. */}
      <legend className="mb-3 text-sm">Cook mode shows these with the step.</legend>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: it only notes that the box inside was left */}
      <div onBlur={() => setLeft(true)}>
        <TextField
          boxClassName="max-w-[9.5rem]"
          label="Time"
          value={time}
          error={timeBad ? "Use a time such as 20 min or 1 hr 30 min." : undefined}
          onChange={(text) => {
            setTime(text);
            setLeft(false);
            if (text.trim() === "") {
              onChange({ ...row, durationSeconds: null });
            } else if (readTime(text) !== null) {
              onChange({ ...row, durationSeconds: readTime(text) });
            }
          }}
        />
      </div>
      <h4 className="mt-3 mb-1.5 text-sm font-semibold">Ingredients</h4>
      {lines.length === 0 ? (
        <p className="text-sm">Add the ingredients above, then say which this step uses.</p>
      ) : (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Ingredients this step uses">
          {used.map((line) => (
            <li key={line.id}>
              <RemovableChip
                label={line.label}
                removeLabel={`Take ${line.label} off this step`}
                onRemove={() => toggle(line.id)}
              />
            </li>
          ))}
          <li>
            <button type="button" className={SMALL_BUTTON} onClick={() => setPicking(true)}>
              <Plus aria-hidden="true" size="1.125rem" />
              Choose ingredients
            </button>
          </li>
        </ul>
      )}
      <Picker
        open={picking}
        onClose={() => setPicking(false)}
        title="Used in this step"
        searchLabel="Find an ingredient"
        options={lines.map((line) => ({
          id: line.id,
          name: line.label,
          detail: line.text !== line.label ? line.text : undefined,
        }))}
        selected={row.ingredientIds}
        onPick={toggle}
        multiple
      />
    </fieldset>
  );
}

/**
 * The steps as one list in which a section is a titled divider row. A closed
 * step shows its number and text, and under them its time and the ingredients
 * it uses; pressing it opens it for editing.
 */
export function StepList({
  rows,
  onChange,
  errors,
  flagged = [],
  lines,
  readStep,
}: {
  rows: StepListRow[];
  onChange: (rows: StepListRow[]) => void;
  errors: FieldErrors;
  /** The recipe's ingredient lines, for a step to say which it uses. */
  lines: readonly StepLine[];
  /** Reads a step's time and ingredients from its words, for the recipe as it stands. */
  readStep: StepReader;
  /** Steps to look at, by ID: each is marked "check". */
  flagged?: readonly string[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const entryRef = useRef<HTMLTextAreaElement>(null);
  const numbers = stepNumbers(rows);

  const replace = (next: StepListRow) =>
    onChange(rows.map((row) => (row.id === next.id ? next : row)));
  const add = (text: string) => {
    const steps = splitEntries(text).map((step) => newStep(step, readStep));
    if (steps.length > 0) {
      onChange([...rows, ...steps]);
    }
    setEntry("");
    entryRef.current?.focus();
    requestAnimationFrame(() => entryRef.current?.scrollIntoView?.({ block: "nearest" }));
  };

  return (
    <>
      <SortableRows
        label="Steps"
        rows={rows}
        onMove={(from, to) => onChange(moveRow(rows, from, to))}
        nameOf={(row) =>
          row.kind === "divider" ? `the section ${row.title}` : `step ${numbers.get(row.id)}`
        }
        renderRow={(row, index) => {
          const error = errors[`row:${row.id}`];
          const actions = (
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
            />
          );
          if (row.kind === "divider") {
            return openId === row.id ? (
              <DividerOpen
                row={row}
                error={error}
                onTitle={(title) => replace({ ...row, title })}
                actions={actions}
              />
            ) : (
              <ClosedRow onOpen={() => setOpenId(row.id)} label="Edit the section" error={error}>
                <DividerClosed row={row} />
              </ClosedRow>
            );
          }
          const number = numbers.get(row.id);
          if (openId === row.id) {
            return (
              <div className="py-3 pr-4 pl-1">
                <TextArea
                  label={`Step ${number}`}
                  rows={3}
                  value={row.text}
                  error={error}
                  onChange={(text) => replace(retextStep(row, text, readStep))}
                />
                <StepDetailFields row={row} lines={lines} onChange={replace} />
                {actions}
              </div>
            );
          }
          return (
            <ClosedRow
              onOpen={() => setOpenId(row.id)}
              label={`Edit step ${number}:`}
              error={error}
              flagged={flagged.includes(row.id)}
            >
              <span className="flex gap-3">
                <span aria-hidden="true" className="w-6 flex-none text-lg font-bold leading-snug">
                  {number}
                </span>
                <span className="min-w-0 leading-normal">
                  <span className="block">{row.text}</span>
                  {detailsLine(row, lines) ? (
                    <span data-testid="step-details" className="mt-1 block text-sm font-semibold">
                      {detailsLine(row, lines)}
                    </span>
                  ) : null}
                </span>
              </span>
            </ClosedRow>
          );
        }}
      />

      <div className="border-t border-rule px-4 py-3">
        <label htmlFor="step-entry" className="mb-1 block text-sm font-semibold">
          Add a step
        </label>
        <div className="flex items-start gap-2">
          <textarea
            id="step-entry"
            ref={entryRef}
            rows={2}
            enterKeyHint="enter"
            value={entry}
            aria-describedby={rows.length === 0 ? "step-entry-hint" : undefined}
            onChange={(event) => setEntry(event.target.value)}
            onKeyDown={(event) => {
              // Enter goes on to the next step, as it does for ingredients; Shift+Enter breaks the line.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                add(entry);
              }
            }}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text");
              if (/\r?\n/.test(pasted.trim())) {
                event.preventDefault();
                add(`${entry}${pasted}`);
              }
            }}
            className={`${FIELD} block min-w-0 flex-1 scroll-mb-[calc(var(--rf-nav-height)+6rem)] py-2 leading-normal [field-sizing:content]`}
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
        {rows.length === 0 ? (
          <p id="step-entry-hint" className="mt-1 text-sm">
            Press Enter for the next step. They are numbered for you.
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
