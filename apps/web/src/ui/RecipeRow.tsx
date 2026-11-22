import { formatDuration, type RecipeSummary } from "@recipeflare/schema";
import { LetterTile } from "./LetterTile";
import type { Stock } from "./stock";

type MetaPart = { text: string; strong: boolean };

/** How many tags a row names before it counts the rest. */
const TAGS_SHOWN = 2;

/**
 * The parts of the line under a title: how long, what kind, who it is from, and
 * how it is tagged. Tags are the strong part, set in a heavier weight.
 *
 * Behind a category's divider the category is left out: the divider says it.
 */
export function recipeMetaParts(
  recipe: RecipeSummary,
  { showCategory = true }: { showCategory?: boolean } = {},
): MetaPart[] {
  const hasParts = recipe.prepTimeSeconds !== null || recipe.cookTimeSeconds !== null;
  const seconds =
    recipe.totalTimeSeconds ??
    (hasParts ? (recipe.prepTimeSeconds ?? 0) + (recipe.cookTimeSeconds ?? 0) : null);
  const parts: MetaPart[] = [];
  if (seconds !== null) {
    parts.push({ text: formatDuration(seconds), strong: false });
  }
  const category = recipe.categories[0]?.name;
  if (showCategory && category) {
    parts.push({ text: category, strong: false });
  }
  if (recipe.sourceName) {
    parts.push({ text: `From ${recipe.sourceName}`, strong: false });
  }
  if (recipe.tags.length > 0) {
    const names = recipe.tags.slice(0, TAGS_SHOWN).map((tag) => tag.name);
    const more = recipe.tags.length - names.length;
    parts.push({
      text: more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", "),
      strong: true,
    });
  }
  return parts;
}

/** The meta line as plain text. */
export function recipeMeta(recipe: RecipeSummary, options?: { showCategory?: boolean }): string {
  return recipeMetaParts(recipe, options)
    .map((part) => part.text)
    .join(" · ");
}

type RecipeRowProps = {
  recipe: RecipeSummary;
  stock: Stock;
  /** Where the row leads. Without it the row is plain content, not a link. */
  href?: string;
  /** The address of the recipe's photo at thumbnail size. Without it the row shows a letter tile. */
  thumbnailUrl?: string;
  /** False behind a category's divider, where naming the category again adds nothing. */
  showCategory?: boolean;
};

const ROW = "flex min-h-[4.25rem] items-center gap-3 px-4 py-2.5";

/** One recipe in the index: a ruled row, not a card. */
export function RecipeRow({
  recipe,
  stock,
  href,
  thumbnailUrl,
  showCategory = true,
}: RecipeRowProps) {
  const meta = recipeMetaParts(recipe, { showCategory });
  const content = (
    <>
      {thumbnailUrl ? (
        // Decorative: the title beside it names the recipe.
        <img
          src={thumbnailUrl}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          className="size-12 flex-none rounded-sm bg-skeleton object-cover"
        />
      ) : (
        <LetterTile title={recipe.title} stock={stock} />
      )}
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
