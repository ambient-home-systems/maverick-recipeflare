import { formatDuration, type RecipeSummary } from "@recipeflare/schema";
import { LetterTile } from "./LetterTile";
import type { Stock } from "./stock";

type MetaPart = { text: string; strong: boolean };

/**
 * The parts of the one line under a title: how long, what kind, and who it is
 * from or how it is tagged. The tag is the strong part, set in a heavier weight.
 */
export function recipeMetaParts(recipe: RecipeSummary): MetaPart[] {
  const hasParts = recipe.prepTimeSeconds !== null || recipe.cookTimeSeconds !== null;
  const seconds =
    recipe.totalTimeSeconds ??
    (hasParts ? (recipe.prepTimeSeconds ?? 0) + (recipe.cookTimeSeconds ?? 0) : null);
  const parts: MetaPart[] = [];
  if (seconds !== null) {
    parts.push({ text: formatDuration(seconds), strong: false });
  }
  const category = recipe.categories[0]?.name;
  if (category) {
    parts.push({ text: category, strong: false });
  }
  const tag = recipe.tags[0]?.name;
  if (recipe.sourceName) {
    parts.push({ text: `From ${recipe.sourceName}`, strong: false });
  } else if (tag) {
    parts.push({ text: tag, strong: true });
  }
  return parts;
}

/** The meta line as plain text. */
export function recipeMeta(recipe: RecipeSummary): string {
  return recipeMetaParts(recipe)
    .map((part) => part.text)
    .join(" · ");
}

type RecipeRowProps = {
  recipe: RecipeSummary;
  stock: Stock;
  /** Where the row leads. Without it the row is plain content, not a link. */
  href?: string;
};

const ROW = "flex min-h-[4.25rem] items-center gap-3 px-4 py-2.5";

/** One recipe in the index: a ruled row, not a card. */
export function RecipeRow({ recipe, stock, href }: RecipeRowProps) {
  const meta = recipeMetaParts(recipe);
  const content = (
    <>
      <LetterTile title={recipe.title} stock={stock} />
      <span className="min-w-0">
        <span className="block text-lg font-semibold leading-tight text-ink">{recipe.title}</span>
        {meta.length > 0 ? (
          <span className="mt-0.5 block text-sm" data-testid="recipe-meta">
            {meta.map((part, index) => (
              <span key={part.text} className={part.strong ? "font-semibold" : undefined}>
                {index > 0 ? " · " : ""}
                {part.text}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <li className="border-b border-rule last:border-b-0">
      {href ? (
        <a
          href={href}
          className={`transition-rf ${ROW} no-underline hover:bg-surface-sunk active:bg-surface-sunk`}
        >
          {content}
        </a>
      ) : (
        <div className={ROW}>{content}</div>
      )}
    </li>
  );
}

/** A row's shape while recipes load. */
export function RecipeRowSkeleton() {
  return (
    <li
      className={`${ROW} border-b border-rule last:border-b-0`}
      aria-hidden="true"
      data-testid="recipe-row-skeleton"
    >
      <span className="skeleton size-12 flex-none" />
      <span className="grid flex-1 gap-2">
        <span className="skeleton h-4 w-3/5" />
        <span className="skeleton h-3 w-2/5" />
      </span>
    </li>
  );
}
