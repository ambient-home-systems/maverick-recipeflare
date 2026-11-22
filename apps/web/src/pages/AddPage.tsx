import { Page } from "../ui/Page";

const WAYS = [
  { name: "Type it in", detail: "Enter a recipe from a card or from memory." },
  { name: "From a link", detail: "Bring in a recipe from a web page, then check it." },
];

/** Where a recipe starts. The two ways in are built in Phase 1. */
export function AddPage() {
  return (
    <Page title="Add a recipe" aside="Not built yet">
      <ul>
        {WAYS.map((way) => (
          <li key={way.name} className="border-b border-rule px-4 py-4 last:border-b-0">
            <span className="block text-lg font-semibold">{way.name}</span>
            <span className="mt-0.5 block text-sm text-ink-soft">{way.detail}</span>
          </li>
        ))}
      </ul>
    </Page>
  );
}
