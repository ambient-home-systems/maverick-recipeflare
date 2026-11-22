import { getRouteApi, Link } from "@tanstack/react-router";
import { RecipeViewScreen } from "../pages/recipe/RecipeViewScreen";
import { parseScale, type Scale } from "../pages/recipe/recipeFacts";
import { mockRecipe, mockStockFor, placeholderPhoto } from "./mockLibrary";
import { RECIPE_SCENE_LABELS, RECIPE_SCENES, type RecipeScene } from "./scenes";

const route = getRouteApi("/mock/recipe/$slug");

/** Recipes that between them show everything the view has to handle. */
const SAMPLES = [
  {
    slug: "sunday-beef-and-bean-chili",
    name: "Long",
    detail: "25 ingredients, 15 steps, nutrition",
  },
  { slug: "cinnamon-toast", name: "Title only", detail: "nothing else entered" },
  { slug: "roast-chicken-with-lemon-and-thyme", name: "Sections", detail: "two parts, two photos" },
  { slug: "cardamom-sugar-cookies", name: "Original card", detail: "front and back, From" },
  { slug: "lemony-red-lentil-soup", name: "From a link", detail: "source link, lines as written" },
] as const;

const LINK = "inline-flex min-h-touch min-w-touch items-center";

/** One fixture recipe on the recipe view. */
export function MockRecipe() {
  const { slug } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const scene: RecipeScene = search.scene ?? "view";
  const scale = parseScale(search.scale);
  const found = mockRecipe(slug);
  const waiting = scene === "loading" || scene === "error";

  const setScale = (next: Scale) =>
    navigate({
      params: { slug },
      search: { ...search, scale: next === 1 ? undefined : next },
      replace: true,
    });

  return (
    <>
      <RecipeViewScreen
        recipe={waiting ? null : (found ?? null)}
        problem={scene === "error" ? "error" : !waiting && !found ? "missing" : undefined}
        onRetry={() => navigate({ params: { slug }, search: {} })}
        scale={scale}
        onScale={setScale}
        stockFor={mockStockFor}
        photoUrl={(asset) => (found ? placeholderPhoto(found, asset) : undefined)}
        offline={scene === "offline"}
        listTo="/mock/list"
        onEdit={(recipe) =>
          navigate({ to: "/mock/edit/$slug", params: { slug: recipe.slug }, search: {} })
        }
        onDelete={() => navigate({ to: "/mock/list" })}
      />

      <aside
        aria-label="Mock controls"
        className="mx-3 mb-6 border border-dashed border-rule-strong px-4 py-3 md:mx-6"
      >
        <h2 className="text-base font-bold">Mock controls</h2>
        <p className="mt-1 text-sm">
          Not part of the screen. Sample data only; every photo and card is a placeholder drawing.
          Cook leads to a screen that is not drawn yet, and Delete only returns to the list.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {RECIPE_SCENES.map((option) => (
            <li key={option}>
              <Link
                to="/mock/recipe/$slug"
                params={{ slug }}
                search={option === "view" ? {} : { scene: option }}
                aria-current={option === scene ? "true" : undefined}
                className={`transition-rf inline-flex min-h-touch items-center rounded-md border border-rule-strong px-4 text-sm font-semibold no-underline ${
                  option === scene
                    ? "bg-primary text-on-primary"
                    : "bg-surface text-ink hover:bg-surface-sunk"
                }`}
              >
                {RECIPE_SCENE_LABELS[option]}
              </Link>
            </li>
          ))}
        </ul>
        <h3 className="mt-3 text-sm font-bold">Other sample recipes</h3>
        <ul className="text-sm">
          {SAMPLES.map((sample) => (
            <li key={sample.slug}>
              <Link to="/mock/recipe/$slug" params={{ slug: sample.slug }} className={LINK}>
                <span>
                  <span className="font-semibold">{sample.name}:</span> {sample.detail}
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link to="/mock/recipe/$slug" params={{ slug: "no-such-recipe" }} className={LINK}>
              <span>
                <span className="font-semibold">Not found:</span> an address that leads nowhere
              </span>
            </Link>
          </li>
        </ul>
        <p className="mt-1 text-sm">
          <Link to="/mock" className={`${LINK} font-semibold`}>
            All mock screens
          </Link>
        </p>
      </aside>
    </>
  );
}
