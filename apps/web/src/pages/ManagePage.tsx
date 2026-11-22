import { Link } from "@tanstack/react-router";
import { Page } from "../ui/Page";

const LISTS = [
  { name: "Categories", detail: "A few broad groups, such as Dinner and Dessert." },
  { name: "Tags", detail: "Anything else you sort by." },
  { name: "Tools", detail: "Equipment a recipe needs." },
  { name: "Foods", detail: "What ingredient lines refer to." },
  { name: "Units", detail: "What quantities are measured in." },
  { name: "Labels", detail: "Groups of foods, and later the store aisles." },
];

/** The household's lists. Each gets its own screen in Phase 1. */
export function ManagePage() {
  return (
    <>
      <Page title="Manage" aside="Not built yet">
        <ul>
          {LISTS.map((list) => (
            <li key={list.name} className="border-b border-rule px-4 py-3 last:border-b-0">
              <span className="block font-semibold">{list.name}</span>
              <span className="block text-sm text-ink-soft">{list.detail}</span>
            </li>
          ))}
        </ul>
      </Page>
      <Link
        to="/mock"
        className="mx-3 mb-8 inline-flex min-h-touch items-center font-semibold text-ink md:mx-6"
      >
        Open the mock screens
      </Link>
    </>
  );
}
