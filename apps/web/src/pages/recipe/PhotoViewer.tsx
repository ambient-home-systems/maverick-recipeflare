import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

export type ViewerPhoto = { id: string; url: string; alt: string };

const BAR_BUTTON =
  "transition-rf inline-flex min-h-touch min-w-touch items-center justify-center gap-1.5 rounded-md px-3 text-base font-semibold text-on-shell";
const LIVE = "hover:bg-shell-raised";
// At the first or last photo the button stays focusable, so the arrow keys go on working.
const SPENT = "cursor-not-allowed opacity-55";

/**
 * A photo, or the original card, filling the screen. The browser's own pinch
 * and double-tap zoom work on it, so handwriting can be read up close.
 */
export function PhotoViewer({
  title,
  photos,
  index,
  onIndex,
  onClose,
}: {
  /** What is being looked at, for example "Original card". */
  title: string;
  photos: ViewerPhoto[];
  /** Which photo is showing. Null keeps the viewer closed. */
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = index !== null && photos.length > 0;
  const current = open ? Math.min(index, photos.length - 1) : 0;
  const photo = photos[current];
  const atStart = current === 0;
  const atEnd = current === photos.length - 1;

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
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" && current < photos.length - 1) {
          onIndex(current + 1);
        } else if (event.key === "ArrowLeft" && current > 0) {
          onIndex(current - 1);
        }
      }}
      className="on-shell fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-shell p-0 text-on-shell"
    >
      {open && photo ? (
        <div className="flex h-full flex-col">
          <div className="flex flex-none items-center justify-between gap-3 py-1 pr-1 pl-4 pt-[max(0.25rem,env(safe-area-inset-top))]">
            <h2 id={titleId} className="text-lg font-bold">
              {title}
              {photos.length > 1 ? (
                <span className="font-normal">
                  {" "}
                  · {current + 1} of {photos.length}
                </span>
              ) : null}
            </h2>
            <button type="button" onClick={onClose} className={`${BAR_BUTTON} ${LIVE}`}>
              <X aria-hidden="true" size="1.25rem" />
              Close
            </button>
          </div>
          <div className="grid min-h-0 flex-1 place-items-center overflow-auto px-2">
            <img src={photo.url} alt={photo.alt} className="max-h-full max-w-full object-contain" />
          </div>
          {photos.length > 1 ? (
            <div className="flex flex-none items-center justify-between gap-3 px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                aria-disabled={atStart}
                onClick={() => (atStart ? undefined : onIndex(current - 1))}
                className={`${BAR_BUTTON} ${atStart ? SPENT : LIVE}`}
              >
                <ChevronLeft aria-hidden="true" size="1.25rem" />
                Previous
              </button>
              <button
                type="button"
                aria-disabled={atEnd}
                onClick={() => (atEnd ? undefined : onIndex(current + 1))}
                className={`${BAR_BUTTON} ${atEnd ? SPENT : LIVE}`}
              >
                Next
                <ChevronRight aria-hidden="true" size="1.25rem" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
