import {
  type Asset,
  draftText,
  type Food,
  type ImportDetail,
  ingredientParser,
  looksEnglish,
  matchReading,
  newId,
  type Organizer,
  type OrganizerKind,
  type Recipe,
  slugify,
  type Unit,
} from "@recipeflare/schema";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { assetUrl } from "../api/assets";
import { ApiError, SignedOutError, UnreachableError } from "../api/client";
import {
  useChangeImport,
  useFoods,
  useImport,
  useImports,
  useOrganizers,
  useReadLines,
  useRecipe,
  useUnits,
} from "../api/queries";
import { conflictOf, PhotoNotSentError, type SaveRequest, useSaveRecipe } from "../api/saveRecipe";
import { Button } from "../ui/Button";
import { EmptyState, Notice } from "../ui/Notice";
import { Page } from "../ui/Page";
import type { Stock } from "../ui/stock";
import { emptyEditorValue, fromRecipe, type LineReader } from "./editor/editorState";
import { RecipeEditorScreen, type Review } from "./editor/RecipeEditorScreen";
import { prepareReview } from "./editor/reviewState";
import { importHost } from "./recipes/ImportRow";

const editRoute = getRouteApi("/recipes/$slug/edit");
const reviewRoute = getRouteApi("/imports/$id/review");

type Lists = { units: Unit[]; foods: Food[]; organizers: Organizer[] };

/** Why a save did not go through, in words for the cook. What was typed is always still there. */
function saveProblemText(error: unknown): string {
  if (error instanceof PhotoNotSentError) {
    const why = error.cause;
    if (why instanceof ApiError && why.code === "too_large") {
      return `The recipe was not saved: ${error.fileName} is larger than 15 MB. Remove it or choose a smaller copy, then save.`;
    }
    if (why instanceof ApiError && why.code === "not_a_picture") {
      return `The recipe was not saved: ${error.fileName} is not a picture the app can keep. Remove it, then save.`;
    }
    if (why instanceof SignedOutError || why instanceof UnreachableError) {
      return saveProblemText(why);
    }
    return `The recipe was not saved: ${error.fileName} could not be sent. What you typed is still here; try again.`;
  }
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
 *
 * Given an import, it opens in review mode on what the import found. Saving
 * then makes the recipe and completes the import; Discard removes the import.
 */
function Editor({
  recipe,
  lists,
  importing,
}: {
  recipe: Recipe | null;
  lists: Lists;
  importing?: ImportDetail;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const save = useSaveRecipe();
  const changeImport = useChangeImport();
  // Read once: the review is a copy of what the import found, as the lists stood when it opened.
  const [prepared] = useState(() =>
    importing?.result
      ? prepareReview(
          importing.result.draft,
          lists,
          ingredientParser(lists),
          importing.assets,
          importing.result.readBy === "ai",
        )
      : null,
  );
  // Photos added here are shown from the device and sent with the save, so an
  // abandoned recipe leaves nothing on the server.
  const added = useRef(new Map<string, { file: File; url: string }>());
  const sentPhotos = useRef(new Map<string, Asset>());
  useEffect(() => {
    const photos = added.current;
    return () => {
      for (const photo of photos.values()) {
        URL.revokeObjectURL(photo.url);
      }
    };
  }, []);

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
  // A line the rules could not read, read by a model when the cook asks. What
  // comes back are names; they are matched to the household's own here, as a
  // typed line's are, and a food it lacks rides on the line until the save.
  const readLines = useReadLines();
  const readLine: LineReader = async (text) => {
    try {
      const reading = (await readLines.mutateAsync([text])).lines[0];
      const read = reading ? matchReading(reading, { units, foods: lists.foods }) : null;
      return read ? { read } : { read: null, why: "nothing" };
    } catch (error) {
      if (error instanceof SignedOutError) {
        return { read: null, why: "signed-out" };
      }
      if (error instanceof UnreachableError) {
        return { read: null, why: "offline" };
      }
      const code = error instanceof ApiError ? error.code : "";
      return {
        read: null,
        why: code === "ai_unavailable" ? "busy" : code === "ai_limit" ? "limit" : "failed",
      };
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` is what makes a reload start afresh
  const initial = useMemo(
    () => prepared?.value ?? (base ? fromRecipe(base) : emptyEditorValue()),
    [base, round],
  );

  // The next photographed card waiting for review, in the order the cards were taken:
  // the list is newest first, so it is the last one found.
  const imports = useImports();
  const nextCard =
    importing?.kind === "photo"
      ? (imports.data ?? []).findLast(
          (job) => job.kind === "photo" && job.status === "needs_review" && job.id !== importing.id,
        )
      : undefined;

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
        target: base
          ? { create: false, id: base.id, version: madeFrom }
          : { create: true, importJobId: importing?.id },
      },
      {
        onSuccess: (saved) => {
          leavingOnPurpose.current = true;
          // A sitting of cards is reviewed one after another, without a trip to the list between.
          if (nextCard) {
            void navigate({ to: "/imports/$id/review", params: { id: nextCard.id } });
          } else {
            void navigate({ to: "/recipes/$slug", params: { slug: saved.slug }, search: {} });
          }
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
      // Going elsewhere. An import under review stays in the list for later.
      blocker.proceed();
    } else if (importing) {
      // The editor's own Discard: the import is removed, and only then is the page left.
      setProblem(undefined);
      changeImport.mutate(
        { id: importing.id, action: "remove" },
        {
          onSuccess: () => void navigate({ to: "/", search: {} }),
          onError: () => {
            leavingOnPurpose.current = false;
            setProblem("The import was not discarded. It is still here; try again.");
          },
        },
      );
    } else if (base) {
      void navigate({ to: "/recipes/$slug", params: { slug: base.slug }, search: {} });
    } else {
      void navigate({ to: "/", search: {} });
    }
  };

  // A draft that is not in English can be sent back to be translated. It
  // leaves review for the list and comes back in English; what was corrected
  // here in the meantime is not kept, and the offer says so.
  const foreign = importing?.result ? !looksEnglish(draftText(importing.result.draft)) : false;
  const translate = () => {
    if (!importing) {
      return;
    }
    leavingOnPurpose.current = true;
    setProblem(undefined);
    changeImport.mutate(
      { id: importing.id, action: "translate" },
      {
        onSuccess: () => void navigate({ to: "/", search: {} }),
        onError: () => {
          leavingOnPurpose.current = false;
          setProblem("It was not sent to be translated. It is still here; try again.");
        },
      },
    );
  };

  const pagePicture = importing?.assets.find((asset) => asset.role === "cover");
  const sourceText = importing?.result?.sourceText ?? null;
  const pasted = importing?.kind === "text";
  // A photographed card is checked against its photos, not against what a model read from them.
  const cardSides =
    importing?.kind === "photo"
      ? importing.assets.filter((asset) => asset.role === "original")
      : [];
  const review: Review | undefined =
    importing && prepared
      ? {
          from: importHost(importing),
          sourceUrl: importing.sourceUrl ?? undefined,
          byAi: importing.result?.readBy === "ai",
          saveLabel: nextCard ? "Save and next card" : undefined,
          attention: prepared.attention,
          flaggedRows: prepared.flaggedRows,
          flaggedParts: prepared.flaggedParts,
          suggestions: prepared.suggestions,
          offered: prepared.offered,
          onTranslate: foreign ? translate : undefined,
          duplicate: importing.duplicate
            ? {
                title: importing.duplicate.title,
                onOpen: () =>
                  void navigate({
                    to: "/recipes/$slug",
                    params: { slug: importing.duplicate?.slug ?? "" },
                    search: {},
                  }),
              }
            : undefined,
          original:
            cardSides.length > 0
              ? {
                  title: "Original",
                  caption:
                    cardSides.length === 1
                      ? "The card as photographed. Check each line against it."
                      : "The card as photographed, front first. Check each line against it.",
                  photos: cardSides.map((side, index) => ({
                    id: side.id,
                    url: assetUrl(side, "full"),
                    alt:
                      index === 0
                        ? "The front of the card"
                        : index === 1
                          ? "The back of the card"
                          : `Side ${index + 1} of the card`,
                  })),
                }
              : pagePicture || sourceText
                ? {
                    title: "Original",
                    caption: sourceText
                      ? pasted
                        ? "The text as you pasted it."
                        : "The words of the page, as they were read."
                      : "The picture from the page. Open the page to check the rest against it.",
                    text: sourceText ?? undefined,
                    photos: pagePicture
                      ? [
                          {
                            id: pagePicture.id,
                            url: assetUrl(pagePicture, "full"),
                            alt: "The picture from the page",
                          },
                        ]
                      : [],
                  }
                : undefined,
        }
      : undefined;

  return (
    <RecipeEditorScreen
      // A reload after a conflict starts the editor again from the recipe as it is now.
      key={round}
      mode={importing ? "review" : base ? "edit" : "new"}
      review={review}
      initial={initial}
      lists={{ units, foods: lists.foods, organizers }}
      parse={parse}
      onReadLine={readLine}
      stockFor={(categoryId): Stock =>
        organizers.find((entry) => entry.id === categoryId)?.color ?? "plain"
      }
      photoUrl={(asset) => added.current.get(asset.id)?.url ?? assetUrl(asset, "thumb")}
      onAddPhotos={(group, files) =>
        files.map((file, index): Asset => {
          const id = newId();
          added.current.set(id, { file, url: URL.createObjectURL(file) });
          return {
            id,
            role: group,
            position: 1000 + index,
            contentType:
              file.type || (group === "attachment" ? "application/octet-stream" : "image/jpeg"),
            sizeBytes: file.size,
            width: null,
            height: null,
            hasVariants: false,
            originalFilename: file.name,
            createdAt: new Date().toISOString(),
          };
        })
      }
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
      onSave={(input, _newFoods, assets, newFoodByLine) =>
        submit(
          {
            input,
            newFoodByLine,
            pendingUnits,
            pendingOrganizers,
            assets: assets.map(({ id, role }) => ({ id, role })),
            pendingPhotos: new Map(
              [...added.current].map(([id, photo]): [string, File] => [id, photo.file]),
            ),
            sentPhotos: sentPhotos.current,
          },
          version,
        )
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
      saving={save.isPending || changeImport.isPending}
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

/** What the review page shows when there is no import to review at its address. */
function NoReview({ title, children }: { title: string; children: string }) {
  return (
    <Page title="Review import">
      <EmptyState
        title={title}
        actions={
          <Link
            to="/"
            className="transition-rf inline-flex min-h-touch items-center rounded-md border border-rule-strong bg-surface px-5 font-semibold text-ink no-underline hover:bg-surface-sunk"
          >
            All recipes
          </Link>
        }
      >
        {children}
      </EmptyState>
    </Page>
  );
}

/**
 * The editor in review mode, on what an import found. Each import gets a page
 * of its own, so that going on to the next card starts afresh.
 */
export function ReviewImportPage() {
  const { id } = reviewRoute.useParams();
  return <ReviewImport key={id} id={id} />;
}

function ReviewImport({ id }: { id: string }) {
  const job = useImport(id);
  const lists = useEditorLists();
  // Held from the moment it is first seen ready: saving completes the import,
  // and the page must not change under the editor while it leaves.
  const [opened, setOpened] = useState<ImportDetail | null>(null);
  const ready = job.data?.status === "needs_review" && job.data.result ? job.data : null;
  if (!opened && ready) {
    setOpened(ready);
  }

  if (opened && lists.data) {
    return <Editor key={opened.id} recipe={null} lists={lists.data} importing={opened} />;
  }
  if (job.error instanceof ApiError && job.error.status === 404) {
    return (
      <NoReview title="This import is not here">
        It may have been saved as a recipe already, or removed.
      </NoReview>
    );
  }
  if (job.data && !ready) {
    return (
      <NoReview title="This import is not ready to review">
        {job.data.status === "completed"
          ? "It has been saved as a recipe already."
          : "The list of recipes shows where it has got to."}
      </NoReview>
    );
  }
  const failed = lists.failed || job.isError;
  return (
    <NotReady
      title="Review import"
      loading={!failed}
      signedOut={lists.signedOut || job.error instanceof SignedOutError}
      failed={failed}
      onRetry={() => {
        lists.retry();
        if (job.isError) {
          void job.refetch();
        }
      }}
    />
  );
}
