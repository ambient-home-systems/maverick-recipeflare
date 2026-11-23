import { getRouteApi } from "@tanstack/react-router";
import { ApiError, SignedOutError } from "../api/client";
import { useDeleteRecipe, useOrganizers, useRecipe } from "../api/queries";
import { useOnline } from "../api/useOnline";
import type { Stock } from "../ui/stock";
import { RecipeViewScreen } from "./recipe/RecipeViewScreen";
import { parseScale, type Scale } from "./recipe/recipeFacts";

const route = getRouteApi("/recipes/$slug");

/**
 * One of the household's recipes, for reading. The container: it fetches the
 * recipe the address names and hands it to the screen.
 */
export function RecipePage() {
  const { slug } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const online = useOnline();
  const scale = parseScale(search.scale);

  const recipe = useRecipe(slug);
  const organizers = useOrganizers();
  const remove = useDeleteRecipe();

  const stockFor = (categorySlug: string): Stock =>
    organizers.data?.find((entry) => entry.kind === "category" && entry.slug === categorySlug)
      ?.color ?? "plain";

  let problem: "missing" | "error" | "signedOut" | undefined;
  if (!recipe.data && recipe.error) {
    problem =
      recipe.error instanceof ApiError && recipe.error.status === 404
        ? "missing"
        : recipe.error instanceof SignedOutError
          ? "signedOut"
          : "error";
  }

  const setScale = (next: Scale) =>
    navigate({
      params: { slug },
      search: next === 1 ? {} : { scale: next },
      replace: true,
    });

  return (
    <RecipeViewScreen
      recipe={recipe.data ?? null}
      problem={problem}
      onRetry={() => void recipe.refetch()}
      scale={scale}
      onScale={setScale}
      stockFor={stockFor}
      // Photos are served from T1.10. Until then a recipe has none.
      photoUrl={() => undefined}
      offline={!online}
      listTo="/"
      onCook={(target) =>
        navigate({
          to: "/recipes/$slug/cook",
          params: { slug: target.slug },
          search: scale === 1 ? {} : { scale },
        })
      }
      onEdit={(target) =>
        navigate({ to: "/recipes/$slug/edit", params: { slug: target.slug }, search: {} })
      }
      onDelete={(target) =>
        remove.mutate(target, { onSuccess: () => navigate({ to: "/", search: {} }) })
      }
      deleting={remove.isPending}
      deleteFailed={remove.isError}
    />
  );
}
