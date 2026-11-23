import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CaptureScreen } from "../pages/capture/CaptureScreen";
import {
  addCards,
  addSide,
  type CaptureCard,
  type CardSide,
  joinToPrevious,
  removeCard,
  removeSide,
  retakeSide,
  swapSides,
} from "../pages/capture/captureState";
import cardBack from "./placeholders/card-back.svg";
import cardFront from "./placeholders/card-front.svg";
import { CAPTURE_SCENE_LABELS, CAPTURE_SCENES, type CaptureScene } from "./scenes";

const route = getRouteApi("/mock/capture");

const LINK = "inline-flex min-h-touch min-w-touch items-center font-semibold";
const SCENE =
  "transition-rf inline-flex min-h-touch items-center rounded-md border border-rule-strong px-4 text-sm font-semibold no-underline";
const sceneClass = (on: boolean) =>
  `${SCENE} ${on ? "bg-primary text-on-primary" : "bg-surface text-ink hover:bg-surface-sunk"}`;

let made = 0;
const nextId = () => `mock-${++made}`;

/** A pile of placeholder cards: every third has no back, as a real tin's do. */
function pile(count: number): CaptureCard[] {
  return Array.from({ length: count }, (_, index) => ({
    id: nextId(),
    sides:
      index % 3 === 2
        ? [{ id: nextId(), url: cardFront }]
        : [
            { id: nextId(), url: cardFront },
            { id: nextId(), url: cardBack },
          ],
  }));
}

const START: Record<CaptureScene, number> = {
  sitting: 7,
  empty: 0,
  twelve: 12,
  // Two of twelve have gone, and have left the pile.
  sending: 10,
  stopped: 7,
  offline: 4,
};

/**
 * Photographing a sitting of cards. On a phone the buttons open the camera,
 * and what is taken is shown from the device: nothing is sent anywhere. The
 * cards already in the pile are placeholder drawings.
 */
export function MockCapture() {
  const { scene = "sitting" } = route.useSearch();
  return <Sitting key={scene} scene={scene} />;
}

function Sitting({ scene }: { scene: CaptureScene }) {
  const navigate = route.useNavigate();
  const [cards, setCards] = useState(() => {
    const start = pile(START[scene] ?? 0);
    // Mid-sitting, the newest card has just had its front taken.
    const newest = start.at(-1);
    return scene === "sitting" && newest
      ? [...start.slice(0, -1), { ...newest, sides: newest.sides.slice(0, 1) }]
      : start;
  });

  // Photos taken here are shown from the device, and let go when the screen is left.
  const urls = useRef<string[]>([]);
  useEffect(() => {
    const kept = urls.current;
    return () => {
      for (const url of kept) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);
  const sideOf = (photo: File): CardSide => {
    const url = URL.createObjectURL(photo);
    urls.current.push(url);
    return { id: nextId(), url };
  };

  return (
    <>
      <CaptureScreen
        cards={cards}
        backLabel="Add a recipe"
        onLeave={() => navigate({ to: "/mock/add", search: {} })}
        onAddCards={(photos) =>
          setCards((now) =>
            addCards(
              now,
              photos.map((photo) => ({ id: nextId(), sides: [sideOf(photo)] })),
            ),
          )
        }
        onAddSide={(cardId, photo) => setCards((now) => addSide(now, cardId, sideOf(photo)))}
        onRetake={(cardId, sideId, photo) =>
          setCards((now) => retakeSide(now, cardId, sideId, sideOf(photo)))
        }
        onRemoveSide={(cardId, sideId) => setCards((now) => removeSide(now, cardId, sideId))}
        onSwapSides={(cardId) => setCards((now) => swapSides(now, cardId))}
        onRemoveCard={(cardId) => setCards((now) => removeCard(now, cardId))}
        onJoin={(cardId) => setCards((now) => joinToPrevious(now, cardId))}
        onImport={() => navigate({ to: "/mock/list", search: { scene: "cards" } })}
        sending={scene === "sending" ? { sent: 2, total: 12 } : undefined}
        problem={
          scene === "stopped"
            ? "5 cards were sent and 7 are still here: the connection dropped. Press Import to send the rest."
            : undefined
        }
        offline={scene === "offline"}
      />
      <aside
        aria-label="Mock controls"
        className="mx-3 mb-6 border border-dashed border-rule-strong px-4 py-3 md:mx-6"
      >
        <h2 className="text-base font-bold">Mock controls</h2>
        <p className="mt-1 text-sm">
          Not part of the screen. On a phone, “Next card” and “Add the back” open the camera; a
          photo you take stays on this device and is sent nowhere. The cards already here are
          placeholder drawings, not photographs. Import leads to the list with sample cards on their
          way in.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CAPTURE_SCENES.map((option: CaptureScene) => (
            <li key={option}>
              <Link
                to="/mock/capture"
                search={option === "sitting" ? {} : { scene: option }}
                aria-current={option === scene ? "true" : undefined}
                className={sceneClass(option === scene)}
              >
                {CAPTURE_SCENE_LABELS[option]}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-sm">
          <Link to="/mock" className={LINK}>
            All mock screens
          </Link>
        </p>
      </aside>
    </>
  );
}
