import { fixtureCardImports, fixtureImportJobs } from "@recipeflare/schema/fixtures";
import { getRouteApi, Link } from "@tanstack/react-router";
import {
  EMPTY_LIST_STATE,
  type ListState,
  parseListSearch,
  toListSearch,
} from "../pages/recipes/listState";
import { RecipeListScreen } from "../pages/recipes/RecipeListScreen";
import {
  mockCategories,
  mockFoods,
  mockLibraryCount,
  mockTags,
  mockTools,
  placeholderThumbnail,
  queryLibrary,
} from "./mockLibrary";
import { LIST_SCENES, type ListScene, parseScene, SCENE_LABELS } from "./scenes";

const route = getRouteApi("/mock/list");

const SCENE_NOTES: Record<ListScene, string> = {
  library: "Nine sample recipes. Search, the dividers, the filters and the sort all work.",
  imports: "Three imports from a link above the recipes: one being read, one ready, one refused.",
  cards:
    "A sitting of four cards on its way in: one being read, one being written up, one ready, and one whose photo could not be read.",
  loading: "What the list shows while recipes are on their way.",
  "first-run": "A household that has not added a recipe yet.",
  offline: "No connection: the recipes saved on the device, read-only.",
};

/** The recipe list and search, drawn from the fixture recipes. */
export function MockList() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const scene = parseScene(search.scene);
  const state = parseListSearch(search);

  const change = (next: ListState) =>
    navigate({
      search: { ...toListSearch(next), ...(scene === "library" ? {} : { scene }) },
      replace: true,
    });

  const loading = scene === "loading";
  const firstRun = scene === "first-run";

  return (
    <>
      <RecipeListScreen
        state={firstRun ? EMPTY_LIST_STATE : state}
        onChange={change}
        categories={firstRun ? [] : mockCategories}
        tags={firstRun ? [] : mockTags}
        tools={firstRun ? [] : mockTools}
        foods={firstRun ? [] : mockFoods}
        recipes={loading ? null : firstRun ? [] : queryLibrary(state)}
        libraryCount={loading ? null : firstRun ? 0 : mockLibraryCount}
        imports={
          scene === "imports" ? fixtureImportJobs : scene === "cards" ? fixtureCardImports : []
        }
        offline={scene === "offline"}
        links={{ newRecipe: "/mock/new", importLink: "/mock/add" }}
        thumbnailFor={placeholderThumbnail}
        onReviewImport={() => navigate({ to: "/mock/review", search: {} })}
        // Drawn so the failed row can be judged whole. They do nothing here, as the note below says.
        onRetryImport={() => {}}
        onRemoveImport={() => {}}
        recipeLink={(recipe) => ({ to: "/mock/recipe/$slug", params: { slug: recipe.slug } })}
      />

      <aside
        aria-label="Mock controls"
        className="mx-3 mb-6 border border-dashed border-rule-strong px-4 py-3 md:mx-6"
      >
        <h2 className="text-base font-bold">Mock controls</h2>
        <p className="mt-1 text-sm">
          Not part of the screen. Sample data only; the four photos are placeholder drawings. Try
          again and Remove do nothing here.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {LIST_SCENES.map((option) => (
            <li key={option}>
              <Link
                to="/mock/list"
                search={option === "library" ? {} : { scene: option }}
                aria-current={option === scene ? "true" : undefined}
                className={`transition-rf inline-flex min-h-touch items-center rounded-md border border-rule-strong px-4 text-sm font-semibold no-underline ${
                  option === scene
                    ? "bg-primary text-on-primary"
                    : "bg-surface text-ink hover:bg-surface-sunk"
                }`}
              >
                {SCENE_LABELS[option]}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm" data-testid="scene-note">
          {SCENE_NOTES[scene]}
        </p>
        <p className="mt-1 text-sm">
          <Link
            to="/mock/list"
            search={{ q: "zucchini" }}
            className="inline-flex min-h-touch items-center font-semibold"
          >
            A search that finds nothing
          </Link>
          {" · "}
          <Link to="/mock" className="inline-flex min-h-touch items-center font-semibold">
            All mock screens
          </Link>
        </p>
      </aside>
    </>
  );
}
