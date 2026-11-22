import { toRecipeSummary } from "@recipeflare/schema";
import { beefChili, cardamomCookies, cinnamonToast } from "@recipeflare/schema/fixtures";
import { CloudOff, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { type DividerTab, DividerTabs } from "../ui/DividerTabs";
import { EmptyState, Notice } from "../ui/Notice";
import { Page } from "../ui/Page";
import { RecipeRow, RecipeRowSkeleton } from "../ui/RecipeRow";

const TABS: DividerTab[] = [
  { id: "all", label: "All", stock: "plain" },
  { id: "breakfast", label: "Breakfast", stock: "buff" },
  { id: "dinner", label: "Dinner", stock: "salmon" },
  { id: "dessert", label: "Dessert", stock: "sky" },
  { id: "soup", label: "Soup", stock: "mint" },
  { id: "bread", label: "Bread", stock: "lilac" },
];

/** Every shared component in each of its states. */
export function MockComponents() {
  const [tab, setTab] = useState("dinner");

  return (
    <>
      <Page title="Buttons" aside="At rest, busy, unavailable">
        <div className="flex flex-wrap gap-3 px-4 py-4">
          <Button>Save recipe</Button>
          <Button variant="add" icon={<Plus aria-hidden="true" size={20} />}>
            Add a recipe
          </Button>
          <Button variant="quiet">Cancel</Button>
          <Button variant="quiet" icon={<Trash2 aria-hidden="true" size={20} />}>
            Delete
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-rule px-4 py-4">
          <Button busy>Save recipe</Button>
          <Button disabled>Save recipe</Button>
          <Button variant="quiet" disabled>
            Cancel
          </Button>
        </div>
      </Page>

      <DividerTabs
        label="Sample categories"
        tabs={TABS}
        selectedId={tab}
        onSelect={setTab}
        panelId="sample-stack"
      />
      <Page
        id="sample-stack"
        labelledBy={`divider-${tab}`}
        joined
        title="Tabs and rows"
        aside="Arrow keys move"
      >
        <ul>
          <RecipeRow recipe={toRecipeSummary(beefChili)} stock="salmon" href="#sample-stack" />
          <RecipeRow recipe={toRecipeSummary(cardamomCookies)} stock="sky" />
          <RecipeRow recipe={toRecipeSummary(cinnamonToast)} stock="plain" />
          <RecipeRowSkeleton />
          <RecipeRowSkeleton />
        </ul>
      </Page>

      <Page title="Page states">
        <Notice icon={<CloudOff aria-hidden="true" size={18} />}>
          You are offline. Recipes can be read but not changed.
        </Notice>
        <EmptyState
          title="No recipes match"
          actions={<Button variant="quiet">Clear filters</Button>}
        >
          Nothing is filed under Soup with the tag Holiday. Clear a filter to see more.
        </EmptyState>
        <div className="border-t border-rule">
          <Notice problem icon={<TriangleAlert aria-hidden="true" size={18} />}>
            The recipe could not be saved. Check the connection and save again.
          </Notice>
        </div>
      </Page>
    </>
  );
}
