import { LIMITS } from "@recipeflare/schema";
import {
  ArrowLeftRight,
  Camera,
  Check,
  CloudOff,
  CopyPlus,
  Images,
  LoaderCircle,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { DividerBack } from "../../ui/DividerTabs";
import { EmptyState, Notice } from "../../ui/Notice";
import { Page } from "../../ui/Page";
import { Sheet } from "../../ui/Sheet";
import { PhotoViewer } from "../recipe/PhotoViewer";
import {
  type CaptureCard,
  cardCount,
  joinTarget,
  MAX_SIDES,
  sideName,
  sidesSummary,
} from "./captureState";

const SMALL =
  "transition-rf inline-flex min-h-touch items-center justify-center gap-1.5 rounded-md border border-rule-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-sunk disabled:cursor-not-allowed disabled:opacity-55";

/** What the next photo is for. */
type Wanted =
  | { for: "cards" }
  | { for: "side"; cardId: string }
  | { for: "retake"; cardId: string; sideId: string };

type CaptureScreenProps = {
  /** The pile so far, in the order the cards were taken. */
  cards: CaptureCard[];
  /**
   * The number of the first card in the pile. One, until cards of this sitting
   * have been sent: those that are left then keep the numbers they had.
   */
  numberFrom?: number;
  /** Where the divider-shaped back button leads, in its own words. */
  backLabel: string;
  /** Leaves the screen. Called once the cook has agreed to lose the pile, when there is one. */
  onLeave: () => void;
  /**
   * True when the cook has tried to leave some other way, by the navigation or
   * the back button, and the page is holding them here: the screen then asks
   * the question its own back button asks.
   */
  asked?: boolean;
  /** The cook chose to stay. */
  onStay?: () => void;
  /** New photos, each a card of its own: one from the camera, or several chosen from the device. */
  onAddCards?: (photos: File[]) => void;
  /** A photo for the next side of a card. */
  onAddSide?: (cardId: string, photo: File) => void;
  /** A photo to take the place of one side. */
  onRetake?: (cardId: string, sideId: string, photo: File) => void;
  onRemoveSide?: (cardId: string, sideId: string) => void;
  onSwapSides?: (cardId: string) => void;
  onRemoveCard?: (cardId: string) => void;
  /** Makes a one-sided card the back of the card before it. */
  onJoin?: (cardId: string) => void;
  /** Sends the pile. Without it, importing is not offered. */
  onImport?: () => void;
  /** How far sending has got. While it is set, nothing in the pile can be changed. */
  sending?: { sent: number; total: number };
  /** Why sending stopped, in a sentence or two. What was not sent is still in the pile. */
  problem?: string;
  offline?: boolean;
  /** The most cards one sitting holds. */
  most?: number;
};

/**
 * Photographing a sitting of paper cards: front, back if there is one, next
 * card. The pile on the table is the list on the screen, and the two buttons
 * that carry the rhythm stay under the thumb. Nothing is sent until Import.
 *
 * The camera is the device's own, opened by a file input, so each photo
 * leaves this page and comes back to it.
 */
export function CaptureScreen({
  cards,
  numberFrom = 1,
  backLabel,
  onLeave,
  asked = false,
  onStay,
  onAddCards,
  onAddSide,
  onRetake,
  onRemoveSide,
  onSwapSides,
  onRemoveCard,
  onJoin,
  onImport,
  sending,
  problem,
  offline = false,
  most = LIMITS.sittingCards,
}: CaptureScreenProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [viewing, setViewing] = useState<{ cardId: string; index: number } | null>(null);
  // A photo taken off is gone for good, so taking one off asks first, in the row.
  const [removing, setRemoving] = useState<{ cardId: string; sideId?: string } | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const chooser = useRef<HTMLInputElement>(null);
  const wanted = useRef<Wanted>({ for: "cards" });
  const newest = useRef<HTMLLIElement>(null);

  const busy = sending !== undefined;
  const latest = cards.at(-1);
  const full = cards.length >= most;
  const number = (cardId: string) => cards.findIndex((card) => card.id === cardId) + numberFrom;

  // A card that has just joined the pile is brought into view, above the buttons
  // that follow it, and rests on the sunk ground for a moment so the eye finds it.
  const count = cards.length;
  const newestId = latest?.id ?? null;
  const seen = useRef(count);
  useEffect(() => {
    const grew = count > seen.current;
    seen.current = count;
    if (!grew) {
      return;
    }
    newest.current?.scrollIntoView?.({ block: "nearest" });
    setArrived(newestId);
    const settle = setTimeout(() => setArrived(null), 1400);
    return () => clearTimeout(settle);
  }, [count, newestId]);

  const ask = (input: HTMLInputElement | null, next: Wanted) => {
    wanted.current = next;
    // Going on to a new card closes the one being mended, so that the pile is
    // whole again and the newest card's back is offered when the photo arrives.
    if (next.for === "cards") {
      setRemoving(null);
      setOpenId(null);
    }
    input?.click();
  };
  const took = (input: HTMLInputElement) => {
    const photos = [...(input.files ?? [])];
    // Cleared, so that the same photo chosen twice is still noticed.
    input.value = "";
    const [first] = photos;
    if (!first) {
      return;
    }
    const next = wanted.current;
    if (next.for === "side") {
      onAddSide?.(next.cardId, first);
    } else if (next.for === "retake") {
      onRetake?.(next.cardId, next.sideId, first);
    } else {
      onAddCards?.(photos);
    }
  };

  const leave = () => (cards.length > 0 ? setAsking(true) : onLeave());
  const stay = () => {
    setAsking(false);
    onStay?.();
  };
  const viewed = viewing ? cards.find((card) => card.id === viewing.cardId) : undefined;

  return (
    <>
      <DividerBack label={backLabel} onBack={leave} />
      <Page
        joined
        title="Photograph cards"
        aside={cards.length > 0 ? cardCount(cards.length) : null}
      >
        {offline ? (
          <Notice icon={<CloudOff aria-hidden="true" size="1.125rem" className="flex-none" />}>
            You are offline. You can go on photographing; importing needs a connection.
          </Notice>
        ) : null}
        {full && !busy ? (
          <Notice>
            That is {cardCount(most)}, the most for one sitting. Import these, then start another.
          </Notice>
        ) : null}

        {cards.length === 0 ? (
          <EmptyState
            title="No cards yet"
            actions={
              <>
                <Button
                  icon={<Camera aria-hidden="true" size="1.25rem" />}
                  onClick={() => ask(camera.current, { for: "cards" })}
                >
                  Photograph a card
                </Button>
                <Button
                  variant="quiet"
                  icon={<Images aria-hidden="true" size="1.25rem" />}
                  onClick={() => ask(chooser.current, { for: "cards" })}
                >
                  Choose photos
                </Button>
              </>
            }
          >
            Take the front of a card, then its back if it has one, then the next card. Nothing is
            sent until you press Import.
          </EmptyState>
        ) : (
          <>
            <ol aria-label="Cards">
              {cards.map((card, index) => {
                const name = `Card ${index + numberFrom}`;
                const last = index === cards.length - 1;
                const before = joinTarget(cards, card.id);
                return (
                  <li
                    key={card.id}
                    ref={last ? newest : undefined}
                    // Clear of the navigation and the capture bar, on any phone and when the bar wraps.
                    className={`transition-rf scroll-mb-[calc(var(--rf-nav-height)+8.5rem)] border-b border-rule ${arrived === card.id ? "bg-surface-sunk" : ""}`}
                  >
                    {openId === card.id && !busy ? (
                      <div className="px-4 py-3">
                        <h2 className="text-lg font-bold leading-tight">{name}</h2>
                        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                          {card.sides.map((side, at) => (
                            <li key={side.id} className="min-w-0">
                              <button
                                type="button"
                                onClick={() => setViewing({ cardId: card.id, index: at })}
                                aria-label={`${sideName(at)} of ${name.toLowerCase()}. Open it full screen`}
                                className="block w-full rounded-sm"
                              >
                                <img
                                  src={side.url}
                                  alt=""
                                  className="transition-rf aspect-[4/3] w-full rounded-sm border border-rule bg-skeleton object-cover hover:border-rule-strong"
                                />
                              </button>
                              <p className="mt-1.5 font-semibold">{sideName(at)}</p>
                              <div className="mt-1.5 flex flex-wrap gap-2">
                                {onRetake ? (
                                  <button
                                    type="button"
                                    className={SMALL}
                                    onClick={() =>
                                      ask(camera.current, {
                                        for: "retake",
                                        cardId: card.id,
                                        sideId: side.id,
                                      })
                                    }
                                  >
                                    <Camera aria-hidden="true" size="1.125rem" />
                                    Retake
                                    <span className="sr-only">
                                      {" "}
                                      the {sideName(at).toLowerCase()}
                                    </span>
                                  </button>
                                ) : null}
                                {onRemoveSide ? (
                                  <button
                                    type="button"
                                    className={SMALL}
                                    onClick={() =>
                                      setRemoving({ cardId: card.id, sideId: side.id })
                                    }
                                  >
                                    <Trash2 aria-hidden="true" size="1.125rem" />
                                    Remove
                                    <span className="sr-only">
                                      {" "}
                                      the {sideName(at).toLowerCase()}
                                    </span>
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                        {removing?.cardId === card.id ? (
                          <div className="mt-4 border-t border-rule pt-3">
                            <p role="alert" className="max-w-[38ch]">
                              {removing.sideId && card.sides.length > 1
                                ? `Remove the ${sideName(
                                    card.sides.findIndex((side) => side.id === removing.sideId),
                                  ).toLowerCase()} of ${name.toLowerCase()}? The photo is only on this device, so it cannot be put back.`
                                : `Remove ${name.toLowerCase()}? ${
                                    card.sides.length > 1
                                      ? "Its photos are only on this device, so they cannot be put back."
                                      : "The photo is only on this device, so it cannot be put back."
                                  }`}
                            </p>
                            {/* "Keep it" comes first and takes the whole line, so that it is
                                under the finger that asked wherever that finger was. */}
                            <div className="mt-3 grid justify-items-start gap-2">
                              <button
                                type="button"
                                onClick={() => setRemoving(null)}
                                className="transition-rf inline-flex min-h-touch w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-press"
                              >
                                Keep it
                              </button>
                              <button
                                type="button"
                                className={SMALL}
                                onClick={() => {
                                  const { sideId } = removing;
                                  setRemoving(null);
                                  if (sideId && card.sides.length > 1) {
                                    onRemoveSide?.(card.id, sideId);
                                  } else {
                                    setOpenId(null);
                                    onRemoveCard?.(card.id);
                                  }
                                }}
                              >
                                <Trash2 aria-hidden="true" size="1.125rem" />
                                Remove it
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-3">
                            {card.sides.length === 2 && onSwapSides ? (
                              <button
                                type="button"
                                className={SMALL}
                                onClick={() => onSwapSides(card.id)}
                              >
                                <ArrowLeftRight aria-hidden="true" size="1.125rem" />
                                Swap sides
                              </button>
                            ) : null}
                            {card.sides.length < MAX_SIDES && onAddSide ? (
                              <button
                                type="button"
                                className={SMALL}
                                onClick={() =>
                                  ask(camera.current, { for: "side", cardId: card.id })
                                }
                              >
                                <Camera aria-hidden="true" size="1.125rem" />
                                {card.sides.length === 1 ? "Add the back" : "Add a side"}
                              </button>
                            ) : null}
                            {before && onJoin ? (
                              <button
                                type="button"
                                className={SMALL}
                                onClick={() => {
                                  setOpenId(before.id);
                                  onJoin(card.id);
                                }}
                              >
                                <CopyPlus aria-hidden="true" size="1.125rem" />
                                It is the back of card {number(before.id)}
                              </button>
                            ) : null}
                            {onRemoveCard ? (
                              <button
                                type="button"
                                className={SMALL}
                                onClick={() => setRemoving({ cardId: card.id })}
                              >
                                <Trash2 aria-hidden="true" size="1.125rem" />
                                Remove card
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setOpenId(null)}
                              className="transition-rf inline-flex min-h-touch items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-press"
                            >
                              <Check aria-hidden="true" size="1.125rem" strokeWidth={2.5} />
                              Done
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setRemoving(null);
                          setOpenId(card.id);
                        }}
                        className="transition-rf flex min-h-[4.25rem] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-sunk disabled:cursor-not-allowed disabled:hover:bg-surface"
                      >
                        <span className="flex flex-none gap-1.5">
                          {card.sides.map((side) => (
                            <img
                              key={side.id}
                              src={side.url}
                              alt=""
                              className="size-12 rounded-sm border border-rule bg-skeleton object-cover"
                            />
                          ))}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="sr-only">Change </span>
                          <span className="block text-lg font-semibold leading-tight">{name}</span>
                          <span className="block text-sm">{sidesSummary(card)}</span>
                        </span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>

            {problem ? <Notice problem>{problem}</Notice> : null}
            {sending ? (
              <Notice
                icon={
                  <LoaderCircle
                    aria-hidden="true"
                    size="1.125rem"
                    className="flex-none animate-spin motion-reduce:animate-none"
                  />
                }
              >
                {sending.sent} of {sending.total} sent. Keep this page open.
              </Notice>
            ) : null}
            <div className="px-4 pt-4 pb-6">
              <p className="max-w-[38ch]">
                {busy
                  ? "Each card leaves this list as it is sent."
                  : // After a stop some have gone, and the notice above says how many.
                    `${problem ? "" : "Nothing has been sent yet. "}Press a card to retake, swap or remove a photo. Each card becomes a recipe to check against its photos.`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {onImport ? (
                  <Button
                    icon={<Send aria-hidden="true" size="1.25rem" />}
                    disabled={offline}
                    busy={busy}
                    onClick={onImport}
                  >
                    Import {cardCount(cards.length)}
                  </Button>
                ) : null}
                {onAddCards && !full ? (
                  <Button
                    variant="quiet"
                    icon={<Images aria-hidden="true" size="1.25rem" />}
                    disabled={busy}
                    onClick={() => ask(chooser.current, { for: "cards" })}
                  >
                    Choose photos
                  </Button>
                ) : null}
              </div>
            </div>

            {/* The two buttons pressed for every card. They sit where the thumb already is. */}
            {/* A computer has no camera to open: there, "Choose photos" above is the way in. */}
            {onAddCards || onAddSide ? (
              <div className="bottom-[var(--rf-nav-height)] z-[5] flex flex-wrap gap-2 border-t border-rule-strong bg-surface px-4 py-2.5 md:pointer-fine:hidden [@media(min-height:36rem)]:sticky">
                {/* While a card is open its own buttons speak for it; this one would mean another card. */}
                {latest && latest.sides.length === 1 && onAddSide && openId === null ? (
                  <Button
                    variant="quiet"
                    className="flex-1 whitespace-nowrap"
                    disabled={busy}
                    onClick={() => ask(camera.current, { for: "side", cardId: latest.id })}
                  >
                    Add the back
                  </Button>
                ) : null}
                {onAddCards ? (
                  <Button
                    className="flex-1 whitespace-nowrap md:flex-none md:px-10"
                    icon={<Camera aria-hidden="true" size="1.25rem" />}
                    disabled={busy || full}
                    onClick={() => ask(camera.current, { for: "cards" })}
                  >
                    Next card
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {/* The device's own camera and its photo chooser. A positioned parent keeps them with the page. */}
        <div className="relative">
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            tabIndex={-1}
            aria-hidden="true"
            data-capture="camera"
            className="sr-only"
            onChange={(event) => took(event.currentTarget)}
          />
          <input
            ref={chooser}
            type="file"
            accept="image/*"
            multiple
            tabIndex={-1}
            aria-hidden="true"
            data-capture="chooser"
            className="sr-only"
            onChange={(event) => took(event.currentTarget)}
          />
        </div>
      </Page>

      <Sheet
        open={asking || asked}
        onClose={stay}
        title="Leave these cards?"
        footer={
          <>
            <Button
              variant="quiet"
              onClick={() => {
                setAsking(false);
                onLeave();
              }}
            >
              Leave
            </Button>
            <Button onClick={stay}>Keep going</Button>
          </>
        }
      >
        <p className="px-4 py-4">
          {cards.length === 1
            ? "The card you photographed is only on this device. Leaving loses it."
            : `The ${cardCount(cards.length)} you photographed are only on this device. Leaving loses them.`}
        </p>
      </Sheet>

      <PhotoViewer
        title={viewed ? `Card ${number(viewed.id)}` : "Card"}
        photos={(viewed?.sides ?? []).map((side, at) => ({
          id: side.id,
          url: side.url,
          alt: `The ${sideName(at).toLowerCase()} of card ${viewed ? number(viewed.id) : ""}`,
        }))}
        index={viewed && viewing ? viewing.index : null}
        onIndex={(index) => setViewing((now) => (now ? { ...now, index } : now))}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
