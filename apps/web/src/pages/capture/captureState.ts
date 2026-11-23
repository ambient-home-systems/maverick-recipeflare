import { LIMITS } from "@recipeflare/schema";

/**
 * A sitting of paper cards being photographed, before any of them is sent.
 * A card is its sides in order: the front, then the back, then anything
 * stapled to it. These are plain functions over that list; the page that
 * holds the sitting decides where the pictures come from.
 */

/** One photograph of one side of a card. `url` shows it: from the device until it is sent. */
export type CardSide = { id: string; url: string };
export type CaptureCard = { id: string; sides: CardSide[] };

export const MAX_SIDES = LIMITS.cardPhotos;

const SIDE_NAMES = ["Front", "Back", "Third side", "Fourth side"];

/** What a side is called, by its place on the card. */
export const sideName = (index: number): string => SIDE_NAMES[index] ?? `Side ${index + 1}`;

/** A card's sides in a few words: "Front only", "Front and back", "3 sides". */
export function sidesSummary(card: CaptureCard): string {
  switch (card.sides.length) {
    case 0:
      return "No photo";
    case 1:
      return "Front only";
    case 2:
      return "Front and back";
    default:
      return `${card.sides.length} sides`;
  }
}

/** How many cards, in words for a title's note or a button. */
export const cardCount = (count: number): string => `${count} ${count === 1 ? "card" : "cards"}`;

const change = (
  cards: readonly CaptureCard[],
  cardId: string,
  to: (card: CaptureCard) => CaptureCard,
): CaptureCard[] => cards.map((card) => (card.id === cardId ? to(card) : card));

/** Each photo joins the pile as a card of its own, up to the most a sitting holds. */
export function addCards(
  cards: readonly CaptureCard[],
  added: readonly CaptureCard[],
  most: number = LIMITS.sittingCards,
): CaptureCard[] {
  return [...cards, ...added].slice(0, Math.max(most, cards.length));
}

/** Adds a side to the end of a card that has room for one. */
export function addSide(
  cards: readonly CaptureCard[],
  cardId: string,
  side: CardSide,
): CaptureCard[] {
  return change(cards, cardId, (card) =>
    card.sides.length < MAX_SIDES ? { ...card, sides: [...card.sides, side] } : card,
  );
}

/** Puts a new photo in a side's place. */
export function retakeSide(
  cards: readonly CaptureCard[],
  cardId: string,
  sideId: string,
  side: CardSide,
): CaptureCard[] {
  return change(cards, cardId, (card) => ({
    ...card,
    sides: card.sides.map((existing) => (existing.id === sideId ? side : existing)),
  }));
}

/** Takes one side off a card. The sides after it move up; a card left with none goes too. */
export function removeSide(
  cards: readonly CaptureCard[],
  cardId: string,
  sideId: string,
): CaptureCard[] {
  return change(cards, cardId, (card) => ({
    ...card,
    sides: card.sides.filter((side) => side.id !== sideId),
  })).filter((card) => card.sides.length > 0);
}

/** Turns a two-sided card over: its back becomes its front. Other cards are left as they are. */
export function swapSides(cards: readonly CaptureCard[], cardId: string): CaptureCard[] {
  return change(cards, cardId, (card) => {
    const [front, back] = card.sides;
    return card.sides.length === 2 && front && back ? { ...card, sides: [back, front] } : card;
  });
}

export function removeCard(cards: readonly CaptureCard[], cardId: string): CaptureCard[] {
  return cards.filter((card) => card.id !== cardId);
}

/**
 * The card a one-sided card could be the back of: the one before it, when
 * that has room. Null when there is none, or the card has more than one side.
 */
export function joinTarget(cards: readonly CaptureCard[], cardId: string): CaptureCard | null {
  const index = cards.findIndex((card) => card.id === cardId);
  const card = cards[index];
  const before = cards[index - 1];
  return card && before && card.sides.length === 1 && before.sides.length < MAX_SIDES
    ? before
    : null;
}

/** Makes a one-sided card the next side of the card before it. */
export function joinToPrevious(cards: readonly CaptureCard[], cardId: string): CaptureCard[] {
  const target = joinTarget(cards, cardId);
  const side = cards.find((card) => card.id === cardId)?.sides[0];
  if (!target || !side) {
    return [...cards];
  }
  return removeCard(addSide(cards, target.id, side), cardId);
}
