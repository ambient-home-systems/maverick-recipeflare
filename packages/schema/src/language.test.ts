import { describe, expect, it } from "vitest";
import { RecipeDraft } from "./draft";
import { pastedLemonBars } from "./fixtures";
import { draftText, looksEnglish } from "./language";

// Invented recipes, a few lines each, in the languages a household's old cards might be in.
const GERMAN = `Kartoffelsuppe
500 g Kartoffeln, geschält
1 Zwiebel, fein gehackt
1 l Gemüsebrühe
Die Zwiebel in Butter anschwitzen. Kartoffeln und Brühe dazugeben und 20 Minuten kochen lassen.
Mit Salz und Pfeffer abschmecken.`;
const FRENCH = `Soupe de poireaux
3 poireaux émincés
2 pommes de terre en dés
1 l de bouillon de légumes
Faire revenir les poireaux dans le beurre. Ajouter les pommes de terre et le bouillon, puis laisser mijoter 25 minutes.`;
const SPANISH = `Sopa de lentejas
250 g de lentejas
1 cebolla picada
2 zanahorias en rodajas
Sofreír la cebolla en una olla con aceite. Añadir las lentejas y el agua y cocer durante 40 minutos.`;
const ITALIAN = `Minestra di ceci
300 g di ceci cotti
2 spicchi di aglio
1 rametto di rosmarino
Soffriggere l'aglio con il rosmarino nell'olio. Aggiungere i ceci e il brodo e cuocere per 15 minuti.`;

describe("telling English from another language", () => {
  it("takes an English recipe for English", () => {
    expect(looksEnglish(pastedLemonBars)).toBe(true);
    expect(
      looksEnglish(
        "Rub the butter into the flour and sugar. Press into a pan and bake until pale gold.",
      ),
    ).toBe(true);
  });

  it.each([
    ["German", GERMAN],
    ["French", FRENCH],
    ["Spanish", SPANISH],
    ["Italian", ITALIAN],
  ])("takes a %s recipe for another language", (_language, text) => {
    expect(looksEnglish(text)).toBe(false);
  });

  it("calls too little text English, so translation is not offered on a guess", () => {
    expect(looksEnglish("Kartoffelsuppe")).toBe(true);
    expect(looksEnglish("2 Eier, 1 Zwiebel")).toBe(true);
    expect(looksEnglish("")).toBe(true);
  });

  it("is not fooled by a few foreign words in an English recipe", () => {
    expect(
      looksEnglish(
        "Crème fraîche tart. Mix the crème fraîche with the eggs and pour into the tart case. Bake until set, then serve with a little more crème fraîche.",
      ),
    ).toBe(true);
  });
});

describe("a draft's own words", () => {
  it("are its title, lines, steps and notes, one piece to a line", () => {
    const draft = RecipeDraft.parse({
      title: "Kartoffelsuppe",
      ingredientSections: [
        { title: "Suppe", items: [{ originalText: "500 g Kartoffeln" }, { originalText: " " }] },
      ],
      stepSections: [{ title: null, steps: [{ text: "20 Minuten kochen." }] }],
      notes: [{ title: "", text: "Schmeckt aufgewärmt noch besser." }],
    });

    expect(draftText(draft)).toBe(
      "Kartoffelsuppe\nSuppe\n500 g Kartoffeln\n20 Minuten kochen.\nSchmeckt aufgewärmt noch besser.",
    );
  });
});
