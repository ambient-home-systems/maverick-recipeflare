import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from "@tanstack/react-router";
import {
  validateMockAddSearch,
  validateMockCaptureSearch,
  validateMockCookSearch,
  validateMockEditorSearch,
  validateMockListSearch,
  validateMockRecipeSearch,
  validateMockReviewSearch,
} from "./mock/scenes";
import { AddPage } from "./pages/AddPage";
import { CapturePage } from "./pages/CapturePage";
import { CookPage } from "./pages/CookPage";
import { EditRecipePage, NewRecipePage, ReviewImportPage } from "./pages/EditorPage";
import { ManageListPage, ManagePage } from "./pages/ManagePage";
import { RecipePage } from "./pages/RecipePage";
import { RecipesPage } from "./pages/RecipesPage";
import { parseScale } from "./pages/recipe/recipeFacts";
import { type ListSearch, parseListSearch, toListSearch } from "./pages/recipes/listState";
import { AppShell } from "./shell/AppShell";
import { EmptyState } from "./ui/Notice";
import { Page } from "./ui/Page";

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: () => (
    <Page title="Not found">
      <EmptyState title="There is no page here">
        The address may be mistyped, or the recipe may have been renamed or deleted.
      </EmptyState>
    </Page>
  ),
});

type RouteComponent = NonNullable<Parameters<typeof createRoute>[0]["component"]>;

const at = <TPath extends string>(path: TPath, component: RouteComponent) =>
  createRoute({ getParentRoute: () => rootRoute, path, component });

// The mock screens load on demand, so the fixture recipes they draw from stay
// out of the bundle everyone downloads.
const MockIndex = lazyRouteComponent(() => import("./mock/MockIndex"), "MockIndex");
const MockTokens = lazyRouteComponent(() => import("./mock/MockTokens"), "MockTokens");
const MockComponents = lazyRouteComponent(() => import("./mock/MockComponents"), "MockComponents");
const MockFixtures = lazyRouteComponent(() => import("./mock/MockFixtures"), "MockFixtures");

const mockListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mock/list",
  validateSearch: validateMockListSearch,
  component: lazyRouteComponent(() => import("./mock/MockList"), "MockList"),
});
const mockAddRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mock/add",
  validateSearch: validateMockAddSearch,
  component: lazyRouteComponent(() => import("./mock/MockAdd"), "MockAdd"),
});
const mockCaptureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mock/capture",
  validateSearch: validateMockCaptureSearch,
  component: lazyRouteComponent(() => import("./mock/MockCapture"), "MockCapture"),
});

const mockRecipeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mock/recipe/$slug",
  validateSearch: validateMockRecipeSearch,
  component: lazyRouteComponent(() => import("./mock/MockRecipe"), "MockRecipe"),
});

const mockEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mock/edit/$slug",
  validateSearch: validateMockEditorSearch,
  component: lazyRouteComponent(() => import("./mock/MockEditor"), "MockEdit"),
});
const mockNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mock/new",
  validateSearch: validateMockEditorSearch,
  component: lazyRouteComponent(() => import("./mock/MockEditor"), "MockNew"),
});
const mockReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mock/review",
  validateSearch: validateMockReviewSearch,
  component: lazyRouteComponent(() => import("./mock/MockEditor"), "MockReview"),
});

const mockCookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mock/cook/$slug",
  validateSearch: validateMockCookSearch,
  component: lazyRouteComponent(() => import("./mock/MockCook"), "MockCook"),
});

// What the list shows is in its address: the search text, the filters and the sort.
const recipesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (raw: Record<string, unknown>): ListSearch => toListSearch(parseListSearch(raw)),
  component: RecipesPage,
});

const recipeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recipes/$slug",
  // The scale is in the address, so a reload or a shared link keeps it.
  validateSearch: (raw: Record<string, unknown>): { scale?: 0.5 | 2 | 3 } => {
    const scale = parseScale(raw.scale);
    return scale === 1 ? {} : { scale };
  },
  component: RecipePage,
});

const cookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recipes/$slug/cook",
  // The scale the recipe was showing when Cook was pressed.
  validateSearch: (raw: Record<string, unknown>): { scale?: 0.5 | 2 | 3 } => {
    const scale = parseScale(raw.scale);
    return scale === 1 ? {} : { scale };
  },
  component: CookPage,
});

const routeTree = rootRoute.addChildren([
  recipesRoute,
  // "new" can never be a recipe's slug: the shared slug function keeps clear of it.
  at("/recipes/new", NewRecipePage),
  recipeRoute,
  at("/recipes/$slug/edit", EditRecipePage),
  cookRoute,
  at("/add", AddPage),
  at("/add/photos", CapturePage),
  at("/imports/$id/review", ReviewImportPage),
  at("/manage", ManagePage),
  at("/manage/$list", ManageListPage),
  at("/mock", MockIndex),
  at("/mock/tokens", MockTokens),
  at("/mock/components", MockComponents),
  at("/mock/fixtures", MockFixtures),
  mockListRoute,
  mockAddRoute,
  mockCaptureRoute,
  mockRecipeRoute,
  mockEditRoute,
  mockNewRoute,
  mockReviewRoute,
  mockCookRoute,
]);

/** Builds the router. Tests pass a memory history to start at a chosen address. */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history, defaultPreload: "intent" });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
