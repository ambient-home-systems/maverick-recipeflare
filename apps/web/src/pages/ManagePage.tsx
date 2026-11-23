import type {
  FoodEntry,
  LabelEntry,
  OrganizerEntry,
  OrganizerKind,
  UnitEntry,
} from "@recipeflare/schema";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ApiError, SignedOutError, UnreachableError } from "../api/client";
import {
  type ListChange,
  useChangeList,
  useFoods,
  useLabels,
  useOrganizers,
  useUnits,
} from "../api/queries";
import { useSignedOut } from "../api/session";
import { useOnline } from "../api/useOnline";
import { EmptyState } from "../ui/Notice";
import { Page } from "../ui/Page";
import {
  type ManageGroup,
  ManageIndexScreen,
  type ManageListKey,
} from "./manage/ManageIndexScreen";
import {
  type ManageEntry,
  type ManageField,
  ManageListScreen,
  type ManageOutcome,
  type ManageValues,
  type ManageWords,
} from "./manage/ManageListScreen";

const listRoute = getRouteApi("/manage/$list");

const GROUPS: Omit<ManageGroup, "count">[] = [
  {
    key: "categories",
    name: "Categories",
    detail: "A few broad groups, such as Dinner and Dessert.",
  },
  { key: "tags", name: "Tags", detail: "Anything else you sort by." },
  { key: "tools", name: "Tools", detail: "Equipment a recipe needs." },
  { key: "foods", name: "Foods", detail: "What ingredient lines refer to." },
  { key: "units", name: "Units", detail: "What amounts are measured in." },
  { key: "labels", name: "Labels", detail: "Groups of foods, and later the store aisles." },
];

const WORDS: Record<ManageListKey, ManageWords> = {
  categories: {
    title: "Categories",
    one: "category",
    many: "categories",
    usedBy: "recipe",
    purpose:
      "A category is one of a few broad groups, such as Dinner or Dessert. Each becomes a divider over the recipe list, in its own colour.",
  },
  tags: {
    title: "Tags",
    one: "tag",
    many: "tags",
    usedBy: "recipe",
    purpose: "A tag is anything else you sort by: Weeknight, Grandma, Freezes well.",
  },
  tools: {
    title: "Tools",
    one: "tool",
    many: "tools",
    usedBy: "recipe",
    purpose: "A tool is equipment a recipe needs, such as a slow cooker or a stand mixer.",
  },
  foods: {
    title: "Foods",
    one: "food",
    many: "foods",
    usedBy: "recipe",
    purpose:
      "A food is what an ingredient line refers to. Foods are added as recipes are typed in, so this list fills by itself.",
  },
  units: {
    title: "Units",
    one: "unit",
    many: "units",
    usedBy: "recipe",
    purpose: "A unit is what an amount is measured in, such as a cup or a gram.",
  },
  labels: {
    title: "Labels",
    one: "label",
    many: "labels",
    usedBy: "food",
    purpose:
      "A label groups foods, such as Produce or Dairy. Labels become the store aisles when shopping lists arrive.",
  },
};

const ORGANIZER_KIND: Partial<Record<ManageListKey, OrganizerKind>> = {
  categories: "category",
  tags: "tag",
  tools: "tool",
};

const isList = (value: string): value is ManageListKey => value in WORDS;

/** "B. Sugar, soda" as the list of names it is. */
const names = (text: unknown) =>
  String(text ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
const orNull = (text: unknown) => String(text ?? "").trim() || null;

const ALIASES_HINT =
  "Other ways it is written, with commas between. A card's own shorthand goes here.";

/** The index of the household's lists, with how many entries each has. */
export function ManagePage() {
  const organizers = useOrganizers();
  const foods = useFoods();
  const units = useUnits();
  const labels = useLabels();
  const online = useOnline();
  const signedOut = useSignedOut();
  const queries = [organizers, foods, units, labels];

  const ofKind = (kind: OrganizerKind) =>
    organizers.data ? organizers.data.filter((entry) => entry.kind === kind).length : null;
  const counts: Record<ManageListKey, number | null> = {
    categories: ofKind("category"),
    tags: ofKind("tag"),
    tools: ofKind("tool"),
    foods: foods.data?.length ?? null,
    units: units.data?.length ?? null,
    labels: labels.data?.length ?? null,
  };

  return (
    <>
      <ManageIndexScreen
        groups={GROUPS.map((group) => ({ ...group, count: counts[group.key] }))}
        // The index is useful with any of its counts; it has failed only when none arrived.
        failed={queries.every((query) => query.isError && !query.data)}
        onRetry={() => {
          for (const query of queries) {
            void query.refetch();
          }
        }}
        signedOut={signedOut}
        offline={!online}
      />
      <Link
        to="/mock"
        className="mx-3 mb-8 inline-flex min-h-touch items-center font-semibold text-ink md:mx-6"
      >
        Open the mock screens
      </Link>
    </>
  );
}

/** Why a change did not go through, in words for whoever made it. */
function refusal(error: unknown, words: ManageWords): ManageOutcome {
  if (error instanceof ApiError && error.code === "duplicate") {
    return { ok: false, field: "name", message: `That is already a ${words.one}.` };
  }
  if (error instanceof ApiError && error.code === "in_use") {
    return {
      ok: false,
      message: `Recipes use this ${words.one}, so it cannot be deleted. It can be renamed.`,
    };
  }
  if (error instanceof ApiError && error.code === "validation_failed") {
    const issue = error.issues[0];
    return {
      ok: false,
      field: issue?.path[0] === "name" ? "name" : undefined,
      message: issue?.path[0] === "name" ? "Use a name of up to 100 characters." : error.message,
    };
  }
  if (error instanceof SignedOutError) {
    return { ok: false, message: "Nothing was changed: you have been signed out." };
  }
  if (error instanceof UnreachableError) {
    return { ok: false, message: "Nothing was changed: the server could not be reached." };
  }
  return { ok: false, message: "Nothing was changed. Try again." };
}

/** One of the six lists, on the household's own data. */
export function ManageListPage() {
  const { list } = listRoute.useParams();
  const organizers = useOrganizers();
  const foods = useFoods();
  const units = useUnits();
  const labels = useLabels();
  const change = useChangeList();
  const online = useOnline();
  const signedOut = useSignedOut();

  if (!isList(list)) {
    return (
      <Page title="Not found">
        <EmptyState title="There is no such list">
          The lists are categories, tags, tools, foods, units and labels.
        </EmptyState>
      </Page>
    );
  }
  const words = WORDS[list];
  const kind = ORGANIZER_KIND[list];

  /** Sends one change and says how it went. */
  const send = async (request: ListChange): Promise<ManageOutcome> => {
    try {
      await change.mutateAsync(request);
      return { ok: true };
    } catch (error) {
      return refusal(error, words);
    }
  };

  // What this list's entries are, which boxes they have, and how a change to one is sent.
  let query: { data?: unknown; isError: boolean; refetch: () => unknown };
  let entries: ManageEntry[] | null;
  let fields: ManageField[] = [];
  let resource: ListChange["list"];
  let bodyOf: (values: ManageValues) => unknown;

  if (kind) {
    query = organizers;
    resource = "organizers";
    entries =
      organizers.data
        ?.filter((entry: OrganizerEntry) => entry.kind === kind)
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          use: entry.recipeCount,
          stock: kind === "category" ? (entry.color ?? "plain") : undefined,
          values: {},
        })) ?? null;
    bodyOf = (values) => ({ name: String(values.name).trim() });
  } else if (list === "foods") {
    query = foods;
    resource = "foods";
    const labelNames = new Map((labels.data ?? []).map((label) => [label.id, label.name]));
    entries =
      foods.data?.map((food: FoodEntry) => ({
        id: food.id,
        name: food.name,
        use: food.recipeCount,
        detail: food.labelId ? labelNames.get(food.labelId) : undefined,
        values: {
          pluralName: food.pluralName ?? "",
          aliases: food.aliases.join(", "),
          labelId: food.labelId ?? "",
        },
      })) ?? null;
    fields = [
      { key: "pluralName", label: "Plural", kind: "text", hint: "For 2 or more: eggs, onions." },
      {
        key: "aliases",
        label: "Also written as",
        kind: "text",
        hint: ALIASES_HINT,
        verbatim: true,
      },
      {
        key: "labelId",
        label: "Label",
        kind: "select",
        none: "No label",
        options: (labels.data ?? []).map((label) => ({ value: label.id, label: label.name })),
      },
    ];
    bodyOf = (values) => ({
      name: String(values.name).trim(),
      pluralName: orNull(values.pluralName),
      aliases: names(values.aliases),
      labelId: orNull(values.labelId),
    });
  } else if (list === "units") {
    query = units;
    resource = "units";
    entries =
      units.data?.map((unit: UnitEntry) => ({
        id: unit.id,
        name: unit.name,
        use: unit.recipeCount,
        detail: unit.abbreviation ?? undefined,
        values: {
          pluralName: unit.pluralName ?? "",
          abbreviation: unit.abbreviation ?? "",
          pluralAbbreviation: unit.pluralAbbreviation ?? "",
          aliases: unit.aliases.join(", "),
          useAbbreviation: unit.useAbbreviation,
          fraction: unit.fraction,
          // Carried through unchanged: they have no box until conversions arrive.
          description: unit.description,
          standardQuantity: unit.standardQuantity === null ? "" : String(unit.standardQuantity),
          standardUnit: unit.standardUnit ?? "",
        },
      })) ?? null;
    fields = [
      { key: "pluralName", label: "Plural", kind: "text", hint: "For 2 or more: cups, cloves." },
      { key: "abbreviation", label: "Abbreviation", kind: "text", verbatim: true },
      {
        key: "aliases",
        label: "Also written as",
        kind: "text",
        verbatim: true,
        hint: `${ALIASES_HINT} Capitals matter for one letter: t is a teaspoon and T a tablespoon.`,
      },
      {
        key: "useAbbreviation",
        label: "Show the abbreviation",
        kind: "toggle",
        hint: "A recipe then reads 2 tbsp, not 2 tablespoons.",
      },
      {
        key: "fraction",
        label: "Show amounts as fractions",
        kind: "toggle",
        hint: "1½ cups, where a gram would read 1.5.",
      },
    ];
    bodyOf = (values) => {
      const abbreviation = orNull(values.abbreviation);
      return {
        name: String(values.name).trim(),
        pluralName: orNull(values.pluralName),
        abbreviation,
        // One abbreviation serves both unless the household set a plural one before.
        pluralAbbreviation: orNull(values.pluralAbbreviation) ?? abbreviation,
        aliases: names(values.aliases),
        useAbbreviation: values.useAbbreviation === true,
        fraction: values.fraction !== false,
        description: String(values.description ?? ""),
        standardQuantity: orNull(values.standardQuantity) ? Number(values.standardQuantity) : null,
        standardUnit: orNull(values.standardUnit),
      };
    };
  } else {
    query = labels;
    resource = "labels";
    entries =
      labels.data?.map((label: LabelEntry) => ({
        id: label.id,
        name: label.name,
        use: label.foodCount,
        values: { color: label.color ?? "", sortOrder: String(label.sortOrder) },
      })) ?? null;
    bodyOf = (values) => ({
      name: String(values.name).trim(),
      color: orNull(values.color),
      sortOrder: Number(values.sortOrder ?? 0),
    });
  }

  /**
   * Moves a label one place. The labels are numbered afresh from the order on
   * screen, and only those whose number changed are sent.
   */
  const move = async (entry: ManageEntry, by: -1 | 1): Promise<ManageOutcome> => {
    const order = [...(entries ?? [])];
    const from = order.findIndex((other) => other.id === entry.id);
    const to = from + by;
    const [moved] = order.splice(from, 1);
    if (!moved || to < 0 || to > order.length) {
      return { ok: true };
    }
    order.splice(to, 0, moved);
    for (const [index, label] of order.entries()) {
      if (Number(label.values.sortOrder) !== index) {
        const outcome = await send({
          list: "labels",
          method: "PUT",
          id: label.id,
          body: bodyOf({ name: label.name, ...label.values, sortOrder: String(index) }),
        });
        if (!outcome.ok) {
          return outcome;
        }
      }
    }
    return { ok: true };
  };

  return (
    <ManageListScreen
      // Each list starts with its own boxes empty and its own sheet closed.
      key={list}
      words={words}
      entries={entries}
      fields={fields}
      keepIfUsed={list === "foods" || list === "units"}
      ordered={list === "labels"}
      failed={query.isError && !signedOut}
      onRetry={() => void query.refetch()}
      signedOut={signedOut}
      offline={!online}
      onAdd={(name) =>
        send({
          list: resource,
          method: "POST",
          body: kind
            ? { kind, name }
            : // A new label goes to the end of the household's order.
              list === "labels"
              ? { name, sortOrder: entries?.length ?? 0 }
              : { name },
        })
      }
      onSave={(entry, values) =>
        send({ list: resource, method: "PUT", id: entry.id, body: bodyOf(values) })
      }
      onDelete={(entry) => send({ list: resource, method: "DELETE", id: entry.id })}
      onMove={list === "labels" ? move : undefined}
    />
  );
}
