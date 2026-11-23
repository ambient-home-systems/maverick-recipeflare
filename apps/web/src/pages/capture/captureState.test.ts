import { describe, expect, it } from "vitest";
import {
  addCards,
  addSide,
  type CaptureCard,
  cardCount,
  joinTarget,
  joinToPrevious,
  removeCard,
  removeSide,
  retakeSide,
  sideName,
  sidesSummary,
  swapSides,
} from "./captureState";

const side = (id: string) => ({ id, url: `blob:${id}` });
const card = (id: string, ...sides: string[]): CaptureCard => ({ id, sides: sides.map(side) });
const shape = (cards: CaptureCard[]) =>
  cards.map((each) => `${each.id}:${each.sides.map((s) => s.id).join("+")}`);

describe("a sitting of cards", () => {
  it("names a card's sides by their place, and sums them up", () => {
    expect([0, 1, 2, 3].map(sideName)).toEqual(["Front", "Back", "Third side", "Fourth side"]);
    expect(sidesSummary(card("a", "f"))).toBe("Front only");
    expect(sidesSummary(card("a", "f", "b"))).toBe("Front and back");
    expect(sidesSummary(card("a", "f", "b", "c"))).toBe("3 sides");
    expect(cardCount(1)).toBe("1 card");
    expect(cardCount(12)).toBe("12 cards");
  });

  it("takes each new photo as a card of its own, at the end of the pile", () => {
    const pile = addCards([card("a", "f1")], [card("b", "f2"), card("c", "f3")]);

    expect(shape(pile)).toEqual(["a:f1", "b:f2", "c:f3"]);
  });

  it("stops at the most a sitting holds, and never drops a card already there", () => {
    const pile = addCards(
      [card("a", "f1"), card("b", "f2")],
      [card("c", "f3"), card("d", "f4")],
      3,
    );

    expect(shape(pile)).toEqual(["a:f1", "b:f2", "c:f3"]);
    expect(shape(addCards(pile, [card("e", "f5")], 2))).toEqual(["a:f1", "b:f2", "c:f3"]);
  });

  it("adds the back to the card it belongs to, and stops at four sides", () => {
    let pile = [card("a", "f1"), card("b", "f2")];
    pile = addSide(pile, "a", side("b1"));
    expect(shape(pile)).toEqual(["a:f1+b1", "b:f2"]);

    pile = addSide(addSide(pile, "a", side("c1")), "a", side("d1"));
    expect(shape(addSide(pile, "a", side("e1")))[0]).toBe("a:f1+b1+c1+d1");
  });

  it("puts a retaken photo in the old one's place", () => {
    const pile = retakeSide([card("a", "f1", "b1")], "a", "f1", side("f1-again"));

    expect(shape(pile)).toEqual(["a:f1-again+b1"]);
  });

  it("takes a wrong photo off: the back becomes the front, and a card with nothing left goes", () => {
    const pile = [card("a", "f1", "b1"), card("b", "f2")];

    expect(shape(removeSide(pile, "a", "f1"))).toEqual(["a:b1", "b:f2"]);
    expect(shape(removeSide(pile, "b", "f2"))).toEqual(["a:f1+b1"]);
  });

  it("swaps the sides of a card that has two, and leaves any other alone", () => {
    const pile = [card("a", "f1", "b1"), card("b", "f2"), card("c", "f3", "b3", "c3")];

    expect(shape(swapSides(pile, "a"))).toEqual(["a:b1+f1", "b:f2", "c:f3+b3+c3"]);
    expect(swapSides(pile, "b")).toEqual(pile);
    expect(swapSides(pile, "c")).toEqual(pile);
  });

  it("removes a card and keeps the rest in order", () => {
    expect(shape(removeCard([card("a", "f1"), card("b", "f2"), card("c", "f3")], "b"))).toEqual([
      "a:f1",
      "c:f3",
    ]);
  });

  it("joins a one-sided card to the one before it, as its back", () => {
    const pile = [card("a", "f1"), card("b", "f2"), card("c", "f3")];

    expect(joinTarget(pile, "b")?.id).toBe("a");
    expect(shape(joinToPrevious(pile, "b"))).toEqual(["a:f1+f2", "c:f3"]);
  });

  it("offers no join to the first card, to a card with two sides, or onto a full card", () => {
    const pile = [card("a", "1", "2", "3", "4"), card("b", "f2"), card("c", "f3", "b3")];

    expect(joinTarget(pile, "a")).toBeNull();
    expect(joinTarget(pile, "b")).toBeNull();
    expect(joinTarget(pile, "c")).toBeNull();
    expect(joinToPrevious(pile, "b")).toEqual(pile);
  });
});
