import { newId } from "@recipeflare/schema";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { uploadAsset } from "../api/assets";
import { ApiError, SignedOutError, UnreachableError } from "../api/client";
import { useStartImport } from "../api/queries";
import { useOnline } from "../api/useOnline";
import { CaptureScreen } from "./capture/CaptureScreen";
import {
  addCards,
  addSide,
  type CaptureCard,
  type CardSide,
  cardCount,
  joinToPrevious,
  removeCard,
  removeSide,
  retakeSide,
  swapSides,
} from "./capture/captureState";

/** Why sending stopped, as the end of a sentence that says how far it got. */
function stopReason(error: unknown): string {
  if (error instanceof SignedOutError) {
    return "you have been signed out. Sign in again in another tab, then press Import";
  }
  if (error instanceof UnreachableError) {
    return "the connection dropped. Press Import to try again";
  }
  if (error instanceof ApiError && error.code === "too_large") {
    return "one of its photos is larger than 15 MB. Retake it, then press Import";
  }
  if (error instanceof ApiError && error.code === "not_a_picture") {
    return "one of its photos is not a picture the app can keep. Retake it, then press Import";
  }
  return "something went wrong. Press Import to try again";
}

/** How far sending got and why it stopped. What was not sent is still in the pile. */
export function stopText(sent: number, left: number, error: unknown): string {
  const reason = stopReason(error);
  if (sent === 0) {
    return `Nothing was sent: ${reason}. ${left === 1 ? "The card is" : `All ${left} cards are`} still here.`;
  }
  return `${cardCount(sent)} ${sent === 1 ? "was" : "were"} sent and ${left} ${left === 1 ? "is" : "are"} still here: ${reason}.`;
}

/**
 * Photographing a sitting of paper cards. The pile lives on this page, on the
 * device, until Import: then each card's photos are sent and the card is
 * handed to the server as an import of its own, one card at a time, so that a
 * dropped connection loses nothing that was already sent.
 */
export function CapturePage() {
  const navigate = useNavigate();
  const online = useOnline();
  const start = useStartImport();
  const [cards, setCards] = useState<CaptureCard[]>([]);
  const [sending, setSending] = useState<{ sent: number; total: number }>();
  const [problem, setProblem] = useState<string>();

  // The photos themselves, by side, shown from the device until they are sent.
  const photos = useRef(new Map<string, { file: File; url: string }>());
  // A side that reached the server keeps its asset, so a second try does not send it twice.
  const sentSides = useRef(new Map<string, string>());
  // How many cards of this sitting have gone, so that the rest keep their numbers.
  const [gone, setGone] = useState(0);
  useEffect(() => {
    const kept = photos.current;
    return () => {
      for (const photo of kept.values()) {
        URL.revokeObjectURL(photo.url);
      }
    };
  }, []);
  const sideOf = (file: File): CardSide => {
    const id = newId();
    const url = URL.createObjectURL(file);
    photos.current.set(id, { file, url });
    return { id, url };
  };

  // Read at the moment someone tries to leave, so they are refs: they must never lag a render behind.
  const pile = useRef(cards);
  pile.current = cards;
  const leavingOnPurpose = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () => pile.current.length > 0 && !leavingOnPurpose.current,
    withResolver: true,
    enableBeforeUnload: () => pile.current.length > 0 && !leavingOnPurpose.current,
  });

  const send = async () => {
    const waiting = pile.current;
    const total = waiting.length;
    let sent = 0;
    setProblem(undefined);
    setSending({ sent, total });
    try {
      for (const [index, card] of waiting.entries()) {
        const sides: string[] = [];
        for (const side of card.sides) {
          let asset = sentSides.current.get(side.id);
          const photo = photos.current.get(side.id);
          if (!asset && photo) {
            asset = (await uploadAsset(photo.file, "original")).id;
            sentSides.current.set(side.id, asset);
          }
          if (asset) {
            sides.push(asset);
          }
        }
        // The list will call it by its place in the sitting, as the pile does.
        await start.mutateAsync({ kind: "photo", photos: sides, card: gone + index + 1 });
        sent += 1;
        // A card that has been sent leaves the pile: it is the server's now.
        setCards((now) => removeCard(now, card.id));
        setGone((count) => count + 1);
        setSending({ sent, total });
      }
      leavingOnPurpose.current = true;
      void navigate({ to: "/", search: {} });
    } catch (error) {
      setProblem(stopText(sent, total - sent, error));
    } finally {
      setSending(undefined);
    }
  };

  return (
    <CaptureScreen
      cards={cards}
      numberFrom={gone + 1}
      backLabel="Add a recipe"
      offline={!online}
      sending={sending}
      problem={problem}
      asked={blocker.status === "blocked"}
      onStay={() => {
        if (blocker.status === "blocked") {
          blocker.reset();
        }
      }}
      onLeave={() => {
        leavingOnPurpose.current = true;
        if (blocker.status === "blocked") {
          blocker.proceed();
        } else {
          void navigate({ to: "/add" });
        }
      }}
      onAddCards={(files) =>
        setCards((now) =>
          addCards(
            now,
            files.map((file) => ({ id: newId(), sides: [sideOf(file)] })),
          ),
        )
      }
      onAddSide={(cardId, file) => setCards((now) => addSide(now, cardId, sideOf(file)))}
      onRetake={(cardId, sideId, file) =>
        setCards((now) => retakeSide(now, cardId, sideId, sideOf(file)))
      }
      onRemoveSide={(cardId, sideId) => setCards((now) => removeSide(now, cardId, sideId))}
      onSwapSides={(cardId) => setCards((now) => swapSides(now, cardId))}
      onRemoveCard={(cardId) => setCards((now) => removeCard(now, cardId))}
      onJoin={(cardId) => setCards((now) => joinToPrevious(now, cardId))}
      onImport={() => void send()}
    />
  );
}
