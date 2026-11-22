import { STOCK_BG, STOCK_TEXT, type Stock } from "./stock";

/**
 * Stands in for a photo: the recipe's first letter on its category's stock.
 * Most of the household's recipes come from paper and have no photo.
 */
export function LetterTile({ title, stock }: { title: string; stock: Stock }) {
  const letter = title.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={`grid size-12 flex-none place-items-center rounded-sm text-lg font-bold ${STOCK_BG[stock]} ${STOCK_TEXT[stock]}`}
    >
      {letter}
    </span>
  );
}
