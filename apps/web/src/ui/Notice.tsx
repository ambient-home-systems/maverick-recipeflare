import type { ReactNode } from "react";

/**
 * A band for something the cook should know: a standing condition such as being
 * offline, or a problem such as a save that failed. A problem is announced at
 * once; a condition is not. Both use the same band: red is kept for the title
 * rule and for adding a recipe.
 */
export function Notice({
  icon,
  children,
  problem = false,
}: {
  icon?: ReactNode;
  children: ReactNode;
  problem?: boolean;
}) {
  return (
    <p
      role={problem ? "alert" : "status"}
      className="flex items-center gap-2 bg-notice px-4 py-2.5 text-sm font-semibold text-on-notice"
    >
      {icon}
      <span>{children}</span>
    </p>
  );
}

/** What a page shows when there is nothing to list yet: what goes here, and how to start. */
export function EmptyState({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="px-4 py-10">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 max-w-[38ch]">{children}</p>
      {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
