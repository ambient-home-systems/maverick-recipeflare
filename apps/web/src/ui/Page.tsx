import type { ReactNode } from "react";

/**
 * A page's card stack: the heading sits on the red rule, the way a title sits
 * on the top line of an index card, and the content follows on card white.
 */
export function Page({
  title,
  aside,
  children,
  id,
  labelledBy,
  joined = false,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  id?: string;
  /** For a stack that is a tab panel: the id of the tab that labels it. */
  labelledBy?: string;
  /** True when divider tabs sit directly above and the stack joins them. */
  joined?: boolean;
}) {
  return (
    <section
      id={id}
      role={labelledBy ? "tabpanel" : undefined}
      aria-labelledby={labelledBy}
      className={`mx-3 mb-6 border border-rule bg-surface md:mx-6 ${joined ? "border-t-0" : "mt-3 md:mt-6"}`}
    >
      <div className="flex items-baseline justify-between gap-4 border-b-2 border-red-line px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold md:text-2xl">{title}</h1>
        {aside ? <div className="text-sm text-ink-soft">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}
