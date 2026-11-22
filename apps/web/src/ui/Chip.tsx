import { Check, X } from "lucide-react";

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

/** A filter that is on, shown above the list. Pressing it takes the filter off. */
export function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter: ${label}`}
      className={`${CHIP} border-rule-strong bg-surface-sunk pr-3 text-ink hover:bg-surface`}
    >
      {label}
      <X aria-hidden="true" size="1.125rem" />
    </button>
  );
}
