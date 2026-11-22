/**
 * Divider stock: the five card-stock colours a category can own. A category
 * keeps its colour wherever it appears: its tab, its tiles, its chips.
 */
export const STOCKS = ["buff", "salmon", "sky", "mint", "lilac"] as const;
export type Stock = (typeof STOCKS)[number] | "plain";

/** Tailwind classes for each stock, written out so the compiler can see them. */
export const STOCK_BG: Record<Stock, string> = {
  buff: "bg-stock-buff",
  salmon: "bg-stock-salmon",
  sky: "bg-stock-sky",
  mint: "bg-stock-mint",
  lilac: "bg-stock-lilac",
  plain: "bg-stock-plain",
};

/** The colour of each stock as a CSS value, for the band on a selected divider. */
export const STOCK_VAR: Record<Stock, string> = {
  buff: "var(--rf-stock-buff)",
  salmon: "var(--rf-stock-salmon)",
  sky: "var(--rf-stock-sky)",
  mint: "var(--rf-stock-mint)",
  lilac: "var(--rf-stock-lilac)",
  plain: "var(--rf-stock-plain)",
};

/** Text on each stock. The five colours take dark ink in both themes; plain follows the theme. */
export const STOCK_TEXT: Record<Stock, string> = {
  buff: "text-on-stock",
  salmon: "text-on-stock",
  sky: "text-on-stock",
  mint: "text-on-stock",
  lilac: "text-on-stock",
  plain: "text-ink",
};

/**
 * The stock for each category, by its position in the household's list.
 * Colours repeat after five categories.
 */
export function assignStocks(categoryIds: readonly string[]): Map<string, Stock> {
  const stocks = new Map<string, Stock>();
  categoryIds.forEach((id, index) => {
    stocks.set(id, STOCKS[index % STOCKS.length] ?? "plain");
  });
  return stocks;
}
