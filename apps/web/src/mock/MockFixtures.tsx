import { toRecipeSummary } from "@recipeflare/schema";
import { fixtureOrganizers, fixtureRecipes } from "@recipeflare/schema/fixtures";
import { useState } from "react";
import { type DividerTab, DividerTabs } from "../ui/DividerTabs";
import { Page } from "../ui/Page";
import { RecipeRow } from "../ui/RecipeRow";
import { assignStocks } from "../ui/stock";

const categories = fixtureOrganizers.filter((organizer) => organizer.kind === "category");
const stocks = assignStocks(categories.map((category) => category.id));
const summaries = fixtureRecipes
  .map(toRecipeSummary)
  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

const ALL = "all";
const tabs: DividerTab[] = [
  { id: ALL, label: "All", stock: "plain" },
  ...categories.map((category) => ({
    id: category.id,
    label: category.name,
    stock: stocks.get(category.id) ?? "plain",
  })),
];

/** The fixture recipes behind their category dividers. Proves the fixtures load. */
export function MockFixtures() {
  const [selected, setSelected] = useState(ALL);
  const selectedTab = tabs.find((tab) => tab.id === selected);
  const shown =
    selected === ALL
      ? summaries
      : summaries.filter((recipe) => recipe.categories.some((c) => c.id === selected));

  return (
    <>
      <DividerTabs
        label="Categories"
        tabs={tabs}
        selectedId={selected}
        onSelect={setSelected}
        panelId="fixture-stack"
      />
      <Page
        id="fixture-stack"
        labelledBy={`divider-${selected}`}
        joined
        title={selected === ALL ? "All recipes" : (selectedTab?.label ?? "Recipes")}
        aside={`${shown.length} ${shown.length === 1 ? "recipe" : "recipes"}`}
      >
        {shown.length > 0 ? (
          <ul>
            {shown.map((recipe) => (
              <RecipeRow
                key={recipe.id}
                recipe={recipe}
                stock={stocks.get(recipe.categories[0]?.id ?? "") ?? "plain"}
              />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-ink-soft">No sample recipes are filed here.</p>
        )}
      </Page>
    </>
  );
}
