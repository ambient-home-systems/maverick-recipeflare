import type { Recipe } from "@recipeflare/schema";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ApiError, SignedOutError, signInAgainUrl } from "../api/client";
import { useOrganizers, useRecipe } from "../api/queries";
import { useSignedOut } from "../api/session";
import { useOnline } from "../api/useOnline";
import { Button } from "../ui/Button";
import { EmptyState, Notice } from "../ui/Notice";
import { Page } from "../ui/Page";
import { CookScreen } from "./cook/CookScreen";
import { useCookSession, useWakeNote } from "./cook/cookSession";
import { useWakeLock } from "./cook/useWakeLock";
import { parseScale } from "./recipe/recipeFacts";

const route = getRouteApi("/recipes/$slug/cook");

const BACK =
  "transition-rf inline-flex min-h-touch items-center rounded-md border border-rule-strong bg-surface px-5 font-semibold text-ink no-underline hover:bg-surface-sunk";

/** Cook mode on a recipe that has arrived. The ticks and the scale are kept on this device. */
function Cooking({ recipe, startScale }: { recipe: Recipe; startScale: number }) {
  const navigate = route.useNavigate();
  const organizers = useOrganizers();
  const online = useOnline();
  const signedOut = useSignedOut();
  const cook = useCookSession(recipe.id, startScale);
  const wake = useWakeLock();
  const [wakeNoteSeen, markWakeNoteSeen] = useWakeNote();

  const category = recipe.categories[0];
  const stock =
    organizers.data?.find((entry) => entry.kind === "category" && entry.id === category?.id)
      ?.color ?? "plain";

  return (
    <CookScreen
      recipe={recipe}
      session={cook.session}
      onToggleStep={cook.toggleStep}
      onToggleIngredient={cook.toggleIngredient}
      onScale={cook.setScale}
      onDone={() => {
        cook.finish();
        void navigate({ to: "/recipes/$slug", params: { slug: recipe.slug }, search: {} });
      }}
      wake={wake}
      wakeNoteSeen={wakeNoteSeen}
      onWakeNoteSeen={markWakeNoteSeen}
      stock={stock}
      offline={!online}
      signedOut={signedOut}
      // Cook mode has no shell around it, so it carries its own way back in.
      onSignIn={() => {
        window.location.assign(signInAgainUrl(window.location.pathname + window.location.search));
      }}
    />
  );
}

/**
 * Cook mode on one of the household's recipes. It fills the screen, so what it
 * shows while there is no recipe has its own way back to the list.
 */
export function CookPage() {
  const { slug } = route.useParams();
  const search = route.useSearch();
  const recipe = useRecipe(slug);

  if (recipe.data) {
    // A different recipe is a different session.
    return (
      <Cooking key={recipe.data.id} recipe={recipe.data} startScale={parseScale(search.scale)} />
    );
  }

  const missing = recipe.error instanceof ApiError && recipe.error.status === 404;
  const signedOut = recipe.error instanceof SignedOutError;
  return (
    <div className="mx-auto max-w-[54rem] pt-[max(0.25rem,env(safe-area-inset-top))]">
      {missing ? (
        <Page title="Not found">
          <EmptyState
            title="This recipe is not here"
            actions={
              <Link to="/" className={BACK}>
                All recipes
              </Link>
            }
          >
            It may have been renamed or deleted. Its address changes when its title does.
          </EmptyState>
        </Page>
      ) : signedOut ? (
        <Page title="Cook">
          <EmptyState
            title="Sign in to cook from this recipe"
            actions={
              <>
                <a href={signInAgainUrl(`/recipes/${slug}/cook`)} className={BACK}>
                  Sign in again
                </a>
                <Link to="/" className={BACK}>
                  All recipes
                </Link>
              </>
            }
          >
            This device has no copy of it to show until you sign in again.
          </EmptyState>
        </Page>
      ) : recipe.isError ? (
        <Page title="Cook">
          <Notice problem>The recipe could not be loaded.</Notice>
          <EmptyState
            title="Could not load the recipe"
            actions={
              <>
                <Button variant="quiet" onClick={() => void recipe.refetch()}>
                  Try again
                </Button>
                <Link to="/" className={BACK}>
                  All recipes
                </Link>
              </>
            }
          >
            Check the connection and try again. Your recipes are not affected.
          </EmptyState>
        </Page>
      ) : (
        <Page title="Loading">
          <p className="sr-only" role="status">
            Loading the recipe
          </p>
          <div aria-hidden="true" className="grid gap-3 px-4 py-5">
            <span className="skeleton h-6 w-3/5" />
            <span className="skeleton h-16 w-full" />
            <span className="skeleton h-16 w-full" />
          </div>
        </Page>
      )}
    </div>
  );
}
