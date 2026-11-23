import { TriangleAlert } from "lucide-react";
import { type ReactNode, useId } from "react";
import { FIELD } from "./field";

/** What is wrong with one field, in the notice colours and with a warning icon: never red text. */
export function FieldProblem({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p
      id={id}
      className="mt-1.5 flex items-start gap-2 rounded-sm bg-notice px-3 py-2 text-sm font-semibold text-on-notice"
    >
      <TriangleAlert aria-hidden="true" size="1.125rem" className="mt-px flex-none" />
      <span>{children}</span>
    </p>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** A problem with what was entered. It is tied to the box for assistive technology. */
  error?: string;
  /** A line of help under the box. */
  hint?: string;
  /** Marks a field the cook should look at, without saying it is wrong: used in review. */
  flagged?: boolean;
  className?: string;
  /** Hides the label from sight while keeping it for assistive technology. */
  hideLabel?: boolean;
  /** Marks the box as wrong when its problem is shown somewhere else, such as under a row of boxes. */
  invalid?: boolean;
  /** The key a summary of problems uses to find this field and go to it. */
  anchor?: string;
  /** Shows the value without letting it be changed, when the change could not be saved anyway. */
  readOnly?: boolean;
};

/** A small outlined word beside a label or a row: "check", "new", "as written". */
export function Mark({ children, large = false }: { children: ReactNode; large?: boolean }) {
  return (
    <span
      className={`rounded-sm border border-rule-strong px-1.5 py-0.5 font-semibold ${large ? "text-base" : "text-sm"}`}
    >
      {children}
    </span>
  );
}

function Shell({
  id,
  label,
  error,
  hint,
  className = "",
  hideLabel = false,
  children,
  flagged = false,
  anchor,
}: Pick<
  FieldProps,
  "label" | "error" | "hint" | "className" | "hideLabel" | "flagged" | "anchor"
> & {
  id: string;
  children: ReactNode;
}) {
  return (
    <div className={className} data-field={anchor}>
      <div className={hideLabel && !flagged ? "sr-only" : "mb-1 flex flex-wrap items-center gap-2"}>
        <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-semibold"}>
          {label}
        </label>
        {flagged ? <Mark>check</Mark> : null}
      </div>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 text-sm">
          {hint}
        </p>
      ) : null}
      {error ? <FieldProblem id={`${id}-problem`}>{error}</FieldProblem> : null}
    </div>
  );
}

const described = (id: string, error?: string, hint?: string) =>
  error ? `${id}-problem` : hint ? `${id}-hint` : undefined;

/** A labelled text box. The label is always visible; there is no placeholder to stand in for it. */
export function TextField({
  type = "text",
  inputMode,
  autoComplete = "off",
  enterKeyHint,
  onEnter,
  verbatim = false,
  ...props
}: FieldProps & {
  /** For text that must stay exactly as typed: the device does not correct, capitalise or check it. */
  verbatim?: boolean;
  type?: "text" | "url";
  inputMode?: "text" | "decimal" | "numeric" | "url";
  autoComplete?: string;
  enterKeyHint?: "next" | "done" | "enter";
  onEnter?: () => void;
}) {
  const id = useId();
  return (
    <Shell id={id} {...props}>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize={type === "url" || verbatim ? "off" : undefined}
        autoCorrect={verbatim ? "off" : undefined}
        spellCheck={type === "url" || verbatim ? false : undefined}
        enterKeyHint={enterKeyHint}
        value={props.value}
        readOnly={props.readOnly}
        aria-invalid={props.error || props.invalid ? true : undefined}
        aria-describedby={described(id, props.error, props.hint)}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
        className={FIELD}
      />
    </Shell>
  );
}

/** A labelled box for a few lines of text. It grows with what is typed, where the browser allows. */
export function TextArea({ rows = 3, ...props }: FieldProps & { rows?: number }) {
  const id = useId();
  return (
    <Shell id={id} {...props}>
      <textarea
        id={id}
        rows={rows}
        value={props.value}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={described(id, props.error, props.hint)}
        onChange={(event) => props.onChange(event.target.value)}
        className={`${FIELD} block py-2 leading-normal [field-sizing:content]`}
      />
    </Shell>
  );
}
