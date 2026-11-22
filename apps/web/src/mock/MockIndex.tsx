import { Link } from "@tanstack/react-router";
import { Page } from "../ui/Page";
import { ApiStatus } from "./ApiStatus";
import { ThemeSwitch } from "./ThemeSwitch";

const READY = [
  { to: "/mock/tokens", name: "Tokens", detail: "Colour, type, space and radius in both themes." },
  {
    to: "/mock/components",
    name: "Components",
    detail: "Buttons, divider tabs, recipe rows and page states.",
  },
  {
    to: "/mock/fixtures",
    name: "Fixture recipes",
    detail: "The nine sample recipes, filed under their category dividers.",
  },
  {
    to: "/mock/list",
    name: "Recipe list and search",
    detail:
      "Search, dividers, filters and sort, with the loading, first-run, offline and import states.",
  },
  {
    to: "/mock/add",
    name: "Add a recipe",
    detail: "The two ways a recipe starts: typed in, or from a link.",
  },
] as const;

const COMING = ["Recipe view", "Recipe editor and review", "Cook mode"];

/**
 * The mock harness: screens drawn from fixture recipes, for reviewing the
 * design on real phones before the features behind them exist.
 */
export function MockIndex() {
  return (
    <>
      <div className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-3 md:mx-6 md:mt-6">
        <ApiStatus />
        <ThemeSwitch />
      </div>
      <Page title="Mock screens" aside="Sample data only">
        <ul>
          {READY.map((screen) => (
            <li key={screen.to} className="border-b border-rule">
              <Link
                to={screen.to}
                className="transition-rf block min-h-touch px-4 py-3 no-underline hover:bg-surface-sunk"
              >
                <span className="block text-lg font-semibold">{screen.name}</span>
                <span className="block text-sm">{screen.detail}</span>
              </Link>
            </li>
          ))}
          {COMING.map((name) => (
            <li key={name} className="border-b border-rule px-4 py-3 last:border-b-0">
              <span className="block font-semibold">{name}</span>
              <span className="block text-sm">Not drawn yet.</span>
            </li>
          ))}
        </ul>
      </Page>
    </>
  );
}
