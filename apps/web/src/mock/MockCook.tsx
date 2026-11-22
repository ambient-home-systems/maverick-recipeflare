import { getRouteApi, Link } from "@tanstack/react-router";
import { CookScreen } from "../pages/cook/CookScreen";
import { useCookSession, useWakeNote } from "../pages/cook/cookSession";
import { useWakeLock } from "../pages/cook/useWakeLock";
import { parseScale } from "../pages/recipe/recipeFacts";
import { EmptyState } from "../ui/Notice";
import { Page } from "../ui/Page";
import { mockRecipe } from "./mockLibrary";
import { COOK_SCENE_LABELS, COOK_SCENES, type CookScene } from "./scenes";

const route = getRouteApi("/mock/cook/$slug");

const SAMPLES = [
  {
    slug: "sunday-beef-and-bean-chili",
    name: "Long",
    detail: "15 steps, 25 ingredients in two parts",
  },
  {
    slug: "roast-chicken-with-lemon-and-thyme",
    name: "Sections",
    detail: "two parts to tick through",
  },
  { slug: "lemony-red-lentil-soup", name: "Lines as written", detail: "try it doubled" },
  { slug: "meat-loaf", name: "A card", detail: "the card's own abbreviations" },
] as const;

const LINK = "inline-flex min-h-touch min-w-touch items-center";

/** One fixture recipe in cook mode. The ticks and the scale are kept on this device, as in the real app. */
export function MockCook() {
  const { slug } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const recipe = mockRecipe(slug);

  if (!recipe) {
    return (
      <Page title="Not found">
        <EmptyState title="There is no sample recipe at this address">
          Open one from the mock list and press Cook.
        </EmptyState>
      </Page>
    );
  }
  return (
    <Cooking
      // A different recipe is a different session.
      key={recipe.id}
      slug={slug}
      scene={search.scene ?? "cooking"}
      startScale={parseScale(search.scale)}
      onDone={() => navigate({ to: "/mock/recipe/$slug", params: { slug }, search: {} })}
    />
  );
}

function Cooking({
  slug,
  scene,
  startScale,
  onDone,
}: {
  slug: string;
  scene: CookScene;
  startScale: number;
  onDone: () => void;
}) {
  // Checked above: the recipe exists.
  const recipe = mockRecipe(slug);
  const cook = useCookSession(recipe?.id ?? slug, startScale);
  const wake = useWakeLock();
  const [wakeNoteSeen, markWakeNoteSeen] = useWakeNote();
  if (!recipe) {
    return null;
  }

  return (
    <CookScreen
      recipe={recipe}
      session={cook.session}
      onToggleStep={cook.toggleStep}
      onToggleIngredient={cook.toggleIngredient}
      onScale={cook.setScale}
      onDone={() => {
        cook.finish();
        onDone();
      }}
      // The scene shows the note whatever this browser can do, and whether or not it was dismissed before.
      wake={scene === "no-screen-lock" ? "unavailable" : wake}
      wakeNoteSeen={scene === "no-screen-lock" ? false : wakeNoteSeen}
      onWakeNoteSeen={markWakeNoteSeen}
      offline={scene === "offline"}
      signedOut={scene === "signed-out"}
      after={
        <aside
          aria-label="Mock controls"
          className="m-4 border border-dashed border-rule-strong px-4 py-3"
        >
          <h2 className="text-base font-bold">Mock controls</h2>
          <p className="mt-1 text-sm">
            Not part of the screen. Sample data only. Ticks and the scale are kept on this device
            and survive a reload, as they will in the real app; Done clears them. “Screen stays on”
            is this browser's real answer.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {COOK_SCENES.map((option) => (
              <li key={option}>
                <Link
                  to="/mock/cook/$slug"
                  params={{ slug }}
                  search={option === "cooking" ? {} : { scene: option }}
                  aria-current={option === scene ? "true" : undefined}
                  className={`transition-rf inline-flex min-h-touch items-center rounded-md border border-rule-strong px-4 text-sm font-semibold no-underline ${
                    option === scene
                      ? "bg-primary text-on-primary"
                      : "bg-surface text-ink hover:bg-surface-sunk"
                  }`}
                >
                  {COOK_SCENE_LABELS[option]}
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="mt-3 text-sm font-bold">Other sample recipes</h3>
          <ul className="text-sm">
            {SAMPLES.map((sample) => (
              <li key={sample.slug}>
                <Link
                  to="/mock/cook/$slug"
                  params={{ slug: sample.slug }}
                  search={{}}
                  className={LINK}
                >
                  <span>
                    <span className="font-semibold">{sample.name}:</span> {sample.detail}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm">
            <Link to="/mock" className={`${LINK} font-semibold`}>
              All mock screens
            </Link>
          </p>
        </aside>
      }
    />
  );
}
