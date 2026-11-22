import { Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { STOCK_BG, STOCK_TEXT, type Stock } from "./stock";

const CHIP =
  "transition-rf inline-flex min-h-touch items-center gap-1.5 rounded-pill border px-4 text-sm font-semibold";

/**
 * A filter that can be switched on and off. On, it is filled like a primary
 * button and carries a tick, so the state never rests on colour alone.
 */
export function ToggleChip({
  label,
  pressed,
  onToggle,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={`${CHIP} ${
        pressed
          ? "border-primary bg-primary pl-3 text-on-primary hover:bg-primary-press"
          : "border-rule-strong bg-surface text-ink hover:bg-surface-sunk"
      }`}
    >
      {pressed ? <Check aria-hidden="true" size="1.125rem" strokeWidth={2.5} /> : null}
      {label}
    </button>
  );
}

/**
 * Something that is on and can be taken off by pressing it: a filter above the
 * list, or a category, tag or tool chosen in the editor. A category's chip
 * takes its divider stock.
 */
export function RemovableChip({
  label,
  onRemove,
  removeLabel = `Remove filter: ${label}`,
  stock,
}: {
  label: string;
  onRemove: () => void;
  /** What pressing it does, read out in place of the label. */
  removeLabel?: string;
  stock?: Stock;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={removeLabel}
      className={`${CHIP} pr-3 ${
        stock
          ? `border-transparent ${STOCK_BG[stock]} ${STOCK_TEXT[stock]} hover:brightness-105`
          : "border-rule-strong bg-surface-sunk text-ink hover:bg-surface"
      }`}
    >
      {label}
      <X aria-hidden="true" size="1.125rem" />
    </button>
  );
}

/**
 * A tag or a tool on a recipe. It is a filter too: pressing it opens the list
 * narrowed to that tag or tool.
 */
export function LinkChip({
  label,
  to,
  search,
}: {
  label: string;
  to: "/mock/list";
  search: { tags?: string; tools?: string };
}) {
  return (
    <Link
      to={to}
      search={search}
      className={`${CHIP} border-rule-strong bg-surface text-ink no-underline hover:bg-surface-sunk`}
    >
      {label}
    </Link>
  );
}
