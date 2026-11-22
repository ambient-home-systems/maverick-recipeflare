import type { ReactNode } from "react";

/**
 * A band that opens a part of a recipe: Ingredients, Steps, Notes. A control
 * that belongs to the part sits at the band's right.
 */
export function SectionHead({
  title,
  id,
  children,
  className = "",
}: {
  title: string;
  /** For a section that is labelled by its heading. */
  id?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-rule bg-surface-sunk px-4 py-2 ${className}`}
    >
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      {children}
    </div>
  );
}
