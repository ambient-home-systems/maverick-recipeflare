import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

type Variant = "primary" | "add" | "quiet";

const VARIANTS: Record<Variant, string> = {
  // Ink: save, cook, confirm.
  primary: "bg-primary text-on-primary hover:bg-primary-press active:bg-primary-press",
  // Rule red: reserved for adding a recipe.
  add: "bg-red-fill text-on-red hover:bg-red-fill-press active:bg-red-fill-press",
  // Everything else, delete included: an ink outline. Delete is told apart by its icon and its words.
  quiet:
    "bg-surface text-ink border border-rule-strong hover:bg-surface-sunk active:bg-surface-sunk",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: ReactNode;
  /** Shows a working state and blocks further presses. */
  busy?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant = "primary",
  icon,
  busy = false,
  disabled,
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`transition-rf inline-flex min-h-touch items-center justify-center gap-2 rounded-md px-5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon}
      <span>{busy ? "Working…" : children}</span>
    </button>
  );
}
