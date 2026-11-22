import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * A panel over the page for one short job, such as choosing filters. It rises
 * from the bottom edge on a phone, where a thumb reaches it, and sits in the
 * middle from tablet width. It is a modal dialog: Escape, the close button and
 * a tap outside all close it, and focus returns to what opened it.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  tall = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Keeps the sheet at its full height whatever it holds. For a sheet with a
   * search box: the box then stays near the top, clear of the on-screen keyboard.
   */
  tall?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click is for the backdrop; a dialog closes on Escape by itself
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click that lands on the dialog itself, not on its content, is on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className={`${tall ? "h-[88dvh] md:h-[80dvh]" : ""} sheet fixed inset-x-0 top-auto bottom-0 m-0 max-h-[88dvh] w-full max-w-full overflow-hidden rounded-t-md border border-rule bg-surface p-0 text-ink shadow-overlay md:inset-0 md:m-auto md:max-h-[80dvh] md:w-[34rem] md:rounded-md`}
    >
      {open ? (
        <div className={`flex max-h-[inherit] flex-col ${tall ? "h-full" : ""}`}>
          <div className="flex flex-none items-center justify-between gap-3 border-b-2 border-red-line py-1 pr-1 pl-4">
            <h2 id={titleId} className="text-xl font-bold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="transition-rf inline-flex min-h-touch min-w-touch items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold hover:bg-surface-sunk"
            >
              <X aria-hidden="true" size="1.25rem" />
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer ? (
            <div className="flex flex-none flex-wrap justify-end gap-3 border-t border-rule px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
