import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { STOCK_BG, STOCK_TEXT, STOCK_VAR, type Stock } from "./stock";

export type DividerTab = { id: string; label: string; stock: Stock };

type DividerTabsProps = {
  label: string;
  tabs: readonly DividerTab[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** The id of the panel the tabs control. */
  panelId: string;
};

/**
 * The index dividers that stand over the card stack: one per category, each in
 * its own stock. The selected divider is taller and joins the stack below it.
 *
 * Arrow keys move between tabs, as the tab pattern expects.
 */
export function DividerTabs({ label, tabs, selectedId, onSelect, panelId }: DividerTabsProps) {
  const move = (from: number, step: number) => {
    const next = tabs[(from + step + tabs.length) % tabs.length];
    if (next) {
      onSelect(next.id);
      document.getElementById(`divider-${next.id}`)?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      // The whole row sits one pixel over the stack's top rule. The selected
      // divider has no bottom edge, so it breaks the rule and joins the stack;
      // the others draw the rule along their own bottom edge.
      className="relative z-[1] -mb-px flex items-end gap-0.5 overflow-x-auto px-3 pt-3 [scrollbar-width:none] md:px-6 md:pt-6"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === selectedId;
        return (
          <button
            key={tab.id}
            id={`divider-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            // The selected divider turns card white to join the stack, and keeps a band
            // of its own stock along the top so its colour is never lost.
            style={selected ? { boxShadow: `inset 0 5px 0 ${STOCK_VAR[tab.stock]}` } : undefined}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                move(index, -1);
              }
            }}
            className={`transition-rf min-w-touch shrink-0 grow basis-auto whitespace-nowrap rounded-t-md px-3 text-sm font-semibold md:grow-0 md:px-5 ${
              selected
                ? "h-[3.25rem] border border-b-0 border-rule bg-surface text-ink"
                : `h-touch border-b border-rule ${STOCK_BG[tab.stock]} ${STOCK_TEXT[tab.stock]} hover:brightness-105`
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export type DividerLink = { key: string; label: string; stock: Stock; category?: string };

/**
 * The dividers a recipe is filed behind, standing over its card. Each leads
 * back to the list at that category; the first leads to every recipe.
 */
export function DividerLinks({
  label,
  to,
  links,
}: {
  label: string;
  to: "/" | "/mock/list";
  links: readonly DividerLink[];
}) {
  return (
    <nav
      aria-label={label}
      className="relative z-[1] -mb-px flex items-end gap-0.5 overflow-x-auto px-3 pt-3 [scrollbar-width:none] md:px-6 md:pt-6"
    >
      {links.map((link, index) => (
        <Link
          key={link.key}
          to={to}
          search={link.category ? { category: link.category } : {}}
          className={`transition-rf inline-flex h-touch min-w-touch shrink-0 items-center gap-1 whitespace-nowrap rounded-t-md border-b border-rule px-3 text-sm font-semibold no-underline hover:brightness-105 md:px-5 ${STOCK_BG[link.stock]} ${STOCK_TEXT[link.stock]}`}
        >
          {index === 0 ? (
            <ChevronLeft aria-hidden="true" size="1.125rem" className="-ml-1" />
          ) : null}
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The way back from a screen that may hold unsaved work: a divider-shaped
 * button, so the screen can ask before it lets go.
 */
export function DividerBack({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="relative z-[1] -mb-px flex items-end px-3 pt-3 md:px-6 md:pt-6">
      <button
        type="button"
        onClick={onBack}
        className={`transition-rf inline-flex h-touch min-w-touch max-w-full items-center gap-1 rounded-t-md border-b border-rule px-3 text-sm font-semibold hover:brightness-105 md:px-5 ${STOCK_BG.plain} ${STOCK_TEXT.plain}`}
      >
        <ChevronLeft aria-hidden="true" size="1.125rem" className="-ml-1 flex-none" />
        <span className="truncate">{label}</span>
      </button>
    </div>
  );
}
