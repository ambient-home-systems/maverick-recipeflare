import { ArrowDown, ArrowUp, Check, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { FieldProblem, Mark, TextField } from "../../ui/Field";
import type { DividerRow } from "./editorState";

const SMALL =
  "transition-rf inline-flex min-h-touch items-center justify-center gap-1.5 rounded-md border border-rule-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-sunk disabled:cursor-not-allowed disabled:opacity-55";

/**
 * What can be done to the row that is open: move it one place, delete it, or
 * close it. Moving by button does what dragging does, for a keyboard or a
 * screen reader, or for a row that is a long way from where it should go.
 */
export function RowActions({
  first,
  last,
  onUp,
  onDown,
  onDelete,
  onDone,
  deleteLabel = "Delete",
  children,
}: {
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  onDone: () => void;
  deleteLabel?: string;
  /** Actions that belong to this kind of row, shown before the common ones. */
  children?: ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {children}
      <button type="button" className={SMALL} disabled={first} onClick={onUp}>
        <ArrowUp aria-hidden="true" size="1.125rem" />
        Up
      </button>
      <button type="button" className={SMALL} disabled={last} onClick={onDown}>
        <ArrowDown aria-hidden="true" size="1.125rem" />
        Down
      </button>
      <button type="button" className={SMALL} onClick={onDelete}>
        <Trash2 aria-hidden="true" size="1.125rem" />
        {deleteLabel}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="transition-rf inline-flex min-h-touch items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-press"
      >
        <Check aria-hidden="true" size="1.125rem" strokeWidth={2.5} />
        Done
      </button>
    </div>
  );
}

export const SMALL_BUTTON = SMALL;

/** A row that is closed: the whole of it is one button that opens it for editing. */
export function ClosedRow({
  onOpen,
  label,
  error,
  flagged,
  children,
}: {
  onOpen: () => void;
  /**
   * What pressing the row does, said before the row's own text to someone who
   * cannot see it: "Edit", "Edit step 2:". The row's text follows, so what is
   * heard includes everything that is shown.
   */
  label: string;
  error?: string;
  flagged?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        data-jump
        onClick={onOpen}
        className="transition-rf flex min-h-touch w-full items-center gap-2 py-2 pr-4 pl-1 text-left hover:bg-surface-sunk"
      >
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span className="sr-only">{label} </span>
          {children}
        </span>
        {flagged ? <Mark>check</Mark> : null}
      </button>
      {error ? (
        <div className="pr-4 pb-2 pl-1">
          <FieldProblem>{error}</FieldProblem>
        </div>
      ) : null}
    </>
  );
}

/** A section divider, closed: its title, set like a sub-head on the recipe. */
export function DividerClosed({ row }: { row: DividerRow }) {
  return row.title.trim() ? (
    <span className="block font-bold">{row.title}</span>
  ) : (
    <span className="block font-bold">Section with no title yet</span>
  );
}

/** A section divider, open: its title, and what can be done to it. */
export function DividerOpen({
  row,
  error,
  onTitle,
  actions,
}: {
  row: DividerRow;
  error?: string;
  onTitle: (title: string) => void;
  actions: ReactNode;
}) {
  return (
    <div className="py-3 pr-4 pl-1">
      <TextField
        label="Section title"
        value={row.title}
        onChange={onTitle}
        error={error}
        hint="Rows under this title, down to the next one, belong to the section."
      />
      {actions}
    </div>
  );
}
