import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from "@tanstack/react-router";
import {
  validateMockAddSearch,
  validateMockCookSearch,
  validateMockEditorSearch,
  validateMockListSearch,
  validateMockRecipeSearch,
  validateMockReviewSearch,
} from "./mock/scenes";
import { AddPage } from "./pages/AddPage";
import { ManagePage } from "./pages/ManagePage";
import { RecipesPage } from "./pages/RecipesPage";
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

const routeTree = rootRoute.addChildren([
  recipesRoute,
  at("/add", AddPage),
  at("/manage", ManagePage),
  at("/mock", MockIndex),
  at("/mock/tokens", MockTokens),
  at("/mock/components", MockComponents),
  at("/mock/fixtures", MockFixtures),
  mockListRoute,
  mockAddRoute,
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
