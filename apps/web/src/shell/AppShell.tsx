import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { isFullScreen, NAV_ITEMS, type NavItem } from "./nav";
import { SessionNotice } from "./SessionNotice";

/** Inside the mock harness the navigation leads to mock screens, where one is drawn. */
function target(item: NavItem, pathname: string): NavItem["to"] | NonNullable<NavItem["mockTo"]> {
  return pathname.startsWith("/mock") && item.mockTo ? item.mockTo : item.to;
}

/** How much of the address a destination claims: the length of its longest matching address, or -1. */
function claim(item: NavItem, pathname: string): number {
  const to = target(item, pathname);
  let best = to === "/" ? (pathname === "/" ? 1 : -1) : pathname.startsWith(to) ? to.length : -1;
  for (const path of item.also ?? []) {
    if (pathname === path || pathname.startsWith(`${path}/`)) {
      best = Math.max(best, path.length);
    }
  }
  return best;
}

/** The destination the address belongs to. The longest claim wins: "/recipes/new" is Add's, not Recipes'. */
function currentItem(pathname: string): NavItem | undefined {
  let current: NavItem | undefined;
  let longest = -1;
  for (const item of NAV_ITEMS) {
    const length = claim(item, pathname);
    if (length > longest) {
      current = item;
      longest = length;
    }
  }
  return current;
}

function NavLink({
  item,
  to,
  current,
}: {
  item: NavItem;
  to: ReturnType<typeof target>;
  current: boolean;
}) {
  const Icon = item.icon;
  // The bar on a phone is card white; the rail from tablet width is ink navy.
  // One ink on each: the current destination is marked by a tinted ground and
  // a heavier weight, never by a second colour.
  const tone = current
    ? "bg-surface-sunk font-bold md:bg-shell-raised"
    : "font-semibold hover:bg-surface-sunk md:font-normal md:hover:bg-shell-raised";
  return (
    <Link
      to={to}
      aria-current={current ? "page" : undefined}
      className={`transition-rf flex min-h-touch-nav flex-1 flex-col items-center justify-center gap-1 rounded-md text-xs text-ink no-underline md:flex-none md:flex-row md:justify-start md:gap-3 md:px-3 md:text-base md:text-on-shell ${tone}`}
    >
      <span
        className={`grid h-[2.25rem] w-[3.5rem] place-items-center rounded-md md:w-[2.5rem] ${
          item.emphasis ? "bg-red-fill text-on-red" : ""
        }`}
      >
        <Icon aria-hidden="true" size="1.375rem" strokeWidth={2} />
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

/**
 * The frame every screen sits in: the ink-navy header, the page, and the
 * navigation. Navigation is a bar along the bottom on a phone, where a thumb
 * reaches it, and a rail down the left from tablet width.
 */
export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = currentItem(pathname);
  // Whether the page on screen fills the screen is asked of the page that is
  // on screen, not of the address being gone to. Otherwise the frame changes a
  // moment before the page does, and the page is put up a second time inside
  // the new frame: cook mode would start again just as the cook leaves it.
  const shownPathname = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });

  if (isFullScreen(shownPathname)) {
    return (
      <main id="page" tabIndex={-1} className="outline-none">
        <Outlet />
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a
        href="#page"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-20 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold"
      >
        Skip to the page
      </a>

      <nav
        aria-label="Main"
        className="shell-rail sticky bottom-0 z-10 order-last box-border flex h-[var(--rf-nav-height)] gap-1 border-t border-rule bg-surface px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:top-0 md:order-first md:h-dvh md:w-56 md:flex-none md:flex-col md:border-t-0 md:bg-shell md:px-3 md:pt-0"
      >
        <Link
          to="/"
          className="mb-2 hidden min-h-touch items-center px-3 py-4 text-xl font-bold text-on-shell no-underline md:flex"
        >
          Recipeflare
        </Link>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            item={item}
            to={target(item, pathname)}
            current={item === current}
          />
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Above the header, so the header and a page's search band stay one piece. */}
        <SessionNotice />
        <header className="on-shell bg-shell px-4 pb-1 pt-[max(0.25rem,env(safe-area-inset-top))] text-on-shell md:hidden [.session-notice+&]:pt-1">
          <Link
            to="/"
            className="inline-flex min-h-touch items-center text-xl font-bold text-on-shell no-underline"
          >
            Recipeflare
          </Link>
        </header>
        <main id="page" tabIndex={-1} className="flex-1 outline-none">
          <div className="max-w-[54rem]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
