import { Plus, Rows3 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { TextArea } from "../../ui/Field";
import { FIELD } from "../../ui/field";
import {
  type FieldErrors,
  moveRow,
  newDivider,
  newStep,
  type StepListRow,
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

/**
 * The steps as one list in which a section is a titled divider row. A closed
 * step shows its number and text; pressing it opens it for editing.
 */
export function StepList({
  rows,
  onChange,
  errors,
}: {
  rows: StepListRow[];
  onChange: (rows: StepListRow[]) => void;
  errors: FieldErrors;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const entryRef = useRef<HTMLTextAreaElement>(null);
  const numbers = stepNumbers(rows);

  const replace = (next: StepListRow) =>
    onChange(rows.map((row) => (row.id === next.id ? next : row)));
  const add = (text: string) => {
    const steps = splitEntries(text).map(newStep);
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
                  onChange={(text) => replace({ ...row, text })}
                />
                {actions}
              </div>
            );
          }
          return (
            <ClosedRow
              onOpen={() => setOpenId(row.id)}
              label={`Edit step ${number}:`}
              error={error}
            >
              <span className="flex gap-3">
                <span aria-hidden="true" className="w-6 flex-none text-lg font-bold leading-snug">
                  {number}
                </span>
                <span className="min-w-0 leading-normal">{row.text}</span>
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
