import { Link } from "@tanstack/react-router";
import { EmptyState } from "../ui/Notice";
import { Page } from "../ui/Page";

/** The recipe list. Until recipes exist it shows the first-run state. */
export function RecipesPage() {
  return (
    <Page title="Recipes">
      <EmptyState
        title="No recipes yet"
        actions={
          <Link
            to="/add"
            className="transition-rf inline-flex min-h-touch items-center rounded-md bg-red-fill px-5 font-semibold text-on-red no-underline hover:bg-red-fill-press"
          >
            Add a recipe
          </Link>
        }
      >
        Your recipes will be listed here, newest changes first. Type one in from a card, or bring
        one in from a link.
      </EmptyState>
    </Page>
  );
}
