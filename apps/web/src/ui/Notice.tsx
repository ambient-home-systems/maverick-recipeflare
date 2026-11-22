import type { ReactNode } from "react";

/** A line across the top of the page for a standing condition, such as being offline. */
export function Notice({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p
      role="status"
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
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-2 max-w-[38ch] text-ink-soft">{children}</p>
      {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
