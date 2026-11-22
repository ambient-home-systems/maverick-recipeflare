import { formatDuration, type RecipeSummary } from "@recipeflare/schema";
import { LetterTile } from "./LetterTile";
import type { Stock } from "./stock";

/** The one line under a title: how long, what kind, and who it is from. */
export function recipeMeta(recipe: RecipeSummary): string {
  const hasParts = recipe.prepTimeSeconds !== null || recipe.cookTimeSeconds !== null;
  const seconds =
    recipe.totalTimeSeconds ??
    (hasParts ? (recipe.prepTimeSeconds ?? 0) + (recipe.cookTimeSeconds ?? 0) : null);
  const parts = [
    seconds === null ? null : formatDuration(seconds),
    recipe.categories[0]?.name ?? null,
    recipe.sourceName ? `From ${recipe.sourceName}` : (recipe.tags[0]?.name ?? null),
  ];
  return parts.filter((part): part is string => part !== null).join(" · ");
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
  const meta = recipeMeta(recipe);
  const content = (
    <>
      <LetterTile title={recipe.title} stock={stock} />
      <span className="min-w-0">
        <span className="block text-lg font-semibold leading-tight text-ink">{recipe.title}</span>
        {meta ? <span className="mt-0.5 block text-sm text-ink-soft">{meta}</span> : null}
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
