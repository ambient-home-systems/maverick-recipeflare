import {
  type Food,
  ingredientParser,
  newId,
  type Organizer,
  type OrganizerKind,
  type Recipe,
  slugify,
  type Unit,
} from "@recipeflare/schema";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { ApiError, SignedOutError, UnreachableError } from "../api/client";
import { useFoods, useOrganizers, useRecipe, useUnits } from "../api/queries";
import { conflictOf, type SaveRequest, useSaveRecipe } from "../api/saveRecipe";
import { Button } from "../ui/Button";
import { EmptyState, Notice } from "../ui/Notice";
import { Page } from "../ui/Page";
import type { Stock } from "../ui/stock";
import { emptyEditorValue, fromRecipe } from "./editor/editorState";
import { RecipeEditorScreen } from "./editor/RecipeEditorScreen";

const editRoute = getRouteApi("/recipes/$slug/edit");

type Lists = { units: Unit[]; foods: Food[]; organizers: Organizer[] };

/** Why a save did not go through, in words for the cook. What was typed is always still there. */
function saveProblemText(error: unknown): string {
  if (error instanceof SignedOutError) {
    return "The recipe was not saved: you have been signed out. What you typed is still here, but only on this page. Sign in again in another tab, then save.";
  }
  if (error instanceof UnreachableError) {
    return "The recipe was not saved: the server could not be reached. What you typed is still here. Try again when there is a connection.";
  }
  if (error instanceof ApiError && error.code === "validation_failed") {
    const first = error.issues[0]?.message;
    return `The recipe was not saved${first ? `: ${first.toLowerCase()}` : ""}. What you typed is still here.`;
  }
  return "The recipe was not saved. What you typed is still here; try again.";
}

/** A unit as it stands the moment it is made in the picker: a name, and the usual settings. */
function unitNamed(id: string, name: string): Unit {
  const now = new Date().toISOString();
  return {
    id,
    name,
    pluralName: null,
    abbreviation: null,
    pluralAbbreviation: null,
    useAbbreviation: false,
    fraction: true,
    description: "",
    aliases: [],
    standardQuantity: null,
    standardUnit: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The editor on real data. It is given the recipe to change, or none for a
 * new one, and the household's lists. It keeps what the pickers make until the
 * save, saves, and answers the three things that can happen then: saved,
 * changed on another device, or not saved.
 */
function Editor({ recipe, lists }: { recipe: Recipe | null; lists: Lists }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const save = useSaveRecipe();

  /** The recipe the editor's copy was made from. It changes when the cook reloads after a conflict. */
  const [base, setBase] = useState(recipe);
  /** The version a save says it was made from. "Save over it" moves this without touching what was typed. */
  const [version, setVersion] = useState(recipe?.version ?? 1);
  const [round, setRound] = useState(0);
  const [pendingUnits, setPendingUnits] = useState<Unit[]>([]);
  const [pendingOrganizers, setPendingOrganizers] = useState<Organizer[]>([]);
  const [conflict, setConflict] = useState<Recipe | null>(null);
  const [problem, setProblem] = useState<string>();
  // Read at the moment someone tries to leave, so it is a ref: it must never lag a render behind.
  const dirty = useRef(false);
  const leavingOnPurpose = useRef(false);
  const lastSave = useRef<Omit<SaveRequest, "target"> | null>(null);

  const units = useMemo(() => [...lists.units, ...pendingUnits], [lists.units, pendingUnits]);
  const organizers = useMemo(
    () => [...lists.organizers, ...pendingOrganizers],
    [lists.organizers, pendingOrganizers],
  );
  const parse = useMemo(
    () => ingredientParser({ units, foods: lists.foods }),
    [units, lists.foods],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` is what makes a reload start afresh
  const initial = useMemo(() => (base ? fromRecipe(base) : emptyEditorValue()), [base, round]);

  // Leaving by the navigation or the back button asks first, as the editor's own Cancel does.
  const blocker = useBlocker({
    shouldBlockFn: () => dirty.current && !leavingOnPurpose.current,
    withResolver: true,
    enableBeforeUnload: () => dirty.current && !leavingOnPurpose.current,
  });

  const submit = (request: Omit<SaveRequest, "target">, madeFrom: number) => {
    lastSave.current = request;
    setProblem(undefined);
    save.mutate(
      {
        ...request,
        target: base ? { create: false, id: base.id, version: madeFrom } : { create: true },
      },
      {
        onSuccess: (saved) => {
          leavingOnPurpose.current = true;
          void navigate({ to: "/recipes/$slug", params: { slug: saved.slug }, search: {} });
        },
        onError: (error) => {
          const current = conflictOf(error);
          if (current) {
            setConflict(current);
          } else {
            setProblem(saveProblemText(error));
          }
        },
      },
    );
  };

  const leave = () => {
    leavingOnPurpose.current = true;
    if (blocker.status === "blocked") {
      blocker.proceed();
    } else if (base) {
      void navigate({ to: "/recipes/$slug", params: { slug: base.slug }, search: {} });
    } else {
      void navigate({ to: "/", search: {} });
    }
  };

  return (
    <RecipeEditorScreen
      // A reload after a conflict starts the editor again from the recipe as it is now.
      key={round}
      mode={base ? "edit" : "new"}
      initial={initial}
      lists={{ units, foods: lists.foods, organizers }}
      parse={parse}
      stockFor={(categoryId): Stock =>
        organizers.find((entry) => entry.id === categoryId)?.color ?? "plain"
      }
      // Photos arrive with T1.10. Until then the editor has no photo section.
      photoUrl={() => undefined}
      onCreateUnit={(name) => {
        const id = newId();
        setPendingUnits((now) => [...now, unitNamed(id, name)]);
        return id;
      }}
      onCreateOrganizer={(kind: OrganizerKind, name) => {
        const id = newId();
        const now = new Date().toISOString();
        setPendingOrganizers((entries) => [
          ...entries,
          // A new category takes its colour when the save creates it.
          { id, kind, name, slug: slugify(name), color: null, createdAt: now, updatedAt: now },
        ]);
        return id;
      }}
      onSave={(input, _newFoods, _assets, newFoodByLine) =>
        submit({ input, newFoodByLine, pendingUnits, pendingOrganizers }, version)
      }
      onLeave={leave}
      onStay={() => {
        if (blocker.status === "blocked") {
          blocker.reset();
        }
      }}
      asking={blocker.status === "blocked"}
      onDirtyChange={(now) => {
        dirty.current = now;
      }}
      backLabel={base ? base.title : "All recipes"}
      saving={save.isPending}
      saveProblem={problem}
      conflict={conflict !== null}
      onConflict={(choice) => {
        const current = conflict;
        setConflict(null);
        if (!current) {
          return;
        }
        if (choice === "reload") {
          // Their changes are taken, and what was typed here is let go.
          queryClient.setQueryData(["recipes", "one", current.slug], current);
          setBase(current);
          setVersion(current.version);
          setPendingUnits([]);
          setPendingOrganizers([]);
          setRound((n) => n + 1);
        } else if (choice === "overwrite" && lastSave.current) {
          // What was typed here is saved as the newer copy, knowingly.
          setVersion(current.version);
          submit(lastSave.current, current.version);
        }
        // "Keep editing" changes nothing: the next save will ask again.
      }}
    />
  );
}

type Waiting = {
  title: string;
  loading: boolean;
  missing?: boolean;
  signedOut: boolean;
  failed: boolean;
  onRetry: () => void;
};

/** What the page shows while the editor has nothing to open on. */
function NotReady({ title, loading, missing, signedOut, failed, onRetry }: Waiting) {
  if (missing) {
    return (
      <Page title="Not found">
        <EmptyState
          title="This recipe is not here"
          actions={
            <Link
              to="/"
              className="transition-rf inline-flex min-h-touch items-center rounded-md border border-rule-strong bg-surface px-5 font-semibold text-ink no-underline hover:bg-surface-sunk"
            >
              All recipes
            </Link>
          }
        >
          It may have been renamed or deleted. Its address changes when its title does.
        </EmptyState>
      </Page>
    );
  }
  if (signedOut) {
    return (
      <Page title={title}>
        <EmptyState title="Sign in to edit recipes">
          This needs the server, and you have been signed out.
        </EmptyState>
      </Page>
    );
  }
  if (failed) {
    return (
      <Page title={title}>
        <Notice problem>The editor could not be opened.</Notice>
        <EmptyState
          title="Could not load what the editor needs"
          actions={
            <Button variant="quiet" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          Editing needs a connection to the server. Nothing has been changed.
        </EmptyState>
      </Page>
    );
  }
  return (
    <Page title={title} aside={loading ? "Loading" : undefined}>
      <p className="sr-only" role="status">
        Opening the editor
      </p>
      <div aria-hidden="true" className="grid gap-3 px-4 py-5">
        <span className="skeleton h-10 w-full" />
        <span className="skeleton h-24 w-full" />
        <span className="skeleton h-10 w-3/5" />
      </div>
    </Page>
  );
}

/** Fetches the household's lists, which the editor cannot open without. */
function useEditorLists() {
  const units = useUnits();
  const foods = useFoods();
  const organizers = useOrganizers();
  const queries = [units, foods, organizers];
  const data: Lists | null =
    units.data && foods.data && organizers.data
      ? { units: units.data, foods: foods.data, organizers: organizers.data }
      : null;
  return {
    data,
    signedOut: !data && queries.some((query) => query.error instanceof SignedOutError),
    failed: !data && queries.some((query) => query.isError),
    retry: () => {
      for (const query of queries) {
        if (query.isError) {
          void query.refetch();
        }
      }
    },
  };
}

/** The editor on a new recipe. */
export function NewRecipePage() {
  const lists = useEditorLists();
  if (!lists.data) {
    return (
      <NotReady
        title="New recipe"
        loading={!lists.failed}
        signedOut={lists.signedOut}
        failed={lists.failed}
        onRetry={lists.retry}
      />
    );
  }
  return <Editor recipe={null} lists={lists.data} />;
}

/** The editor on one of the household's recipes. */
export function EditRecipePage() {
  const { slug } = editRoute.useParams();
  const recipe = useRecipe(slug);
  const lists = useEditorLists();

  const missing = !recipe.data && recipe.error instanceof ApiError && recipe.error.status === 404;
  const signedOut = lists.signedOut || (!recipe.data && recipe.error instanceof SignedOutError);
  const failed = lists.failed || (!recipe.data && recipe.isError);

  if (!recipe.data || !lists.data) {
    return (
      <NotReady
        title="Edit recipe"
        loading={!failed}
        missing={missing}
        signedOut={signedOut}
        failed={failed}
        onRetry={() => {
          lists.retry();
          if (recipe.isError) {
            void recipe.refetch();
          }
        }}
      />
    );
  }
  // The editor keeps its own copy from here: a refetch must not change what is being typed over.
  return <Editor key={recipe.data.id} recipe={recipe.data} lists={lists.data} />;
}
