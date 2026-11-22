import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { NAV_ITEMS, type NavItem } from "./nav";

function isCurrent(item: NavItem, pathname: string): boolean {
  return item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
}

function NavLink({ item, current }: { item: NavItem; current: boolean }) {
  const Icon = item.icon;
  // The bar on a phone is card white; the rail from tablet width is ink navy.
  const tone = item.emphasis
    ? "text-red-text md:text-on-shell"
    : current
      ? "bg-surface-sunk text-ink md:bg-white/12 md:text-on-shell"
      : "text-ink-soft hover:text-ink md:text-on-shell-soft md:hover:text-on-shell";
  return (
    <Link
      to={item.to}
      aria-current={current ? "page" : undefined}
      className={`transition-rf flex min-h-touch-nav flex-1 flex-col items-center justify-center gap-1 rounded-md text-xs font-semibold no-underline md:flex-none md:flex-row md:justify-start md:gap-3 md:px-3 md:text-base ${tone}`}
    >
      <span
        className={`grid h-9 w-14 place-items-center rounded-md md:w-10 ${
          item.emphasis ? "bg-red-fill text-on-red" : ""
        }`}
      >
        <Icon aria-hidden="true" size={22} strokeWidth={2} />
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
        className="shell-rail sticky bottom-0 z-10 order-last flex gap-1 border-t border-rule bg-surface px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:top-0 md:order-first md:h-dvh md:w-56 md:flex-none md:flex-col md:border-t-0 md:bg-shell md:px-3 md:pt-0"
      >
        <Link
          to="/"
          className="mb-2 hidden min-h-touch items-center px-3 py-4 text-xl font-bold text-on-shell no-underline md:flex"
        >
          Recipeflare
        </Link>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} item={item} current={isCurrent(item, pathname)} />
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="on-shell bg-shell px-4 pb-1 pt-[max(0.25rem,env(safe-area-inset-top))] text-on-shell md:hidden">
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
