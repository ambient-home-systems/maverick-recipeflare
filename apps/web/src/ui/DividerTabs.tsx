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
      className="flex items-end gap-0.5 overflow-x-auto px-3 pt-3 [scrollbar-width:none] md:px-6 md:pt-6"
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
                : `h-touch ${STOCK_BG[tab.stock]} ${STOCK_TEXT[tab.stock]} hover:brightness-105`
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
