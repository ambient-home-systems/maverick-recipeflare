import { Check } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A row that is ticked off: a step that is done, or an ingredient that is out
 * on the counter. The whole row is the target, for a floury knuckle.
 *
 * A ticked row steps back by taking the sunk ground. Its words stay in the one
 * ink and stay readable, because a cook often looks back at the last step.
 */
export function CheckRow({
  checked,
  onChange,
  children,
  className = "",
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      // "relative" keeps the hidden checkbox inside its row, so it scrolls with the list it is in.
      className={`transition-rf relative flex min-h-touch cursor-pointer items-start gap-3 border-b border-rule px-4 py-3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus has-[:focus-visible]:[outline-offset:-3px] ${
        checked ? "bg-surface-sunk" : "bg-surface hover:bg-surface-sunk"
      } ${className}`}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-7 flex-none place-items-center rounded-sm border-2 ${
          checked ? "border-primary bg-primary text-on-primary" : "border-rule-strong bg-surface"
        }`}
      >
        {checked ? <Check size="1.25rem" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</span>
    </label>
  );
}
