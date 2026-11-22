import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from "@tanstack/react-router";
import { validateMockAddSearch, validateMockListSearch } from "./mock/scenes";
import { AddPage } from "./pages/AddPage";
import { ManagePage } from "./pages/ManagePage";
import { RecipesPage } from "./pages/RecipesPage";
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

const routeTree = rootRoute.addChildren([
  at("/", RecipesPage),
  at("/add", AddPage),
  at("/manage", ManagePage),
  at("/mock", MockIndex),
  at("/mock/tokens", MockTokens),
  at("/mock/components", MockComponents),
  at("/mock/fixtures", MockFixtures),
  mockListRoute,
  mockAddRoute,
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
