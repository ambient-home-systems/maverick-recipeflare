import {
  type Asset,
  type Food,
  ingredientParser,
  matchReading,
  newId,
  type Organizer,
  type OrganizerKind,
  slugify,
  type Unit,
} from "@recipeflare/schema";
import {
  FIXTURE_TIME,
  fixtureFoods,
  fixtureOrganizers,
  fixtureUnits,
  importNeedsReview,
  importPastedText,
} from "@recipeflare/schema/fixtures";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo, useRef, useState } from "react";
import {
  type EditorValue,
  emptyEditorValue,
  fromRecipe,
  type LineReading,
} from "../pages/editor/editorState";
import { RecipeEditorScreen, type Review } from "../pages/editor/RecipeEditorScreen";
import { prepareReview } from "../pages/editor/reviewState";
import { EmptyState } from "../ui/Notice";
import { Page } from "../ui/Page";
import { assignStocks } from "../ui/stock";
import { mockRecipe, placeholderPhoto } from "./mockLibrary";
import cardBack from "./placeholders/card-back.svg";
import cardFront from "./placeholders/card-front.svg";
import pagePicture from "./placeholders/pancakes.svg";
import {
  EDITOR_SCENE_LABELS,
  EDITOR_SCENES,
  type EditorScene,
  REVIEW_SCENE_LABELS,
  REVIEW_SCENES,
  type ReviewScene,
} from "./scenes";

const LINK = "inline-flex min-h-touch min-w-touch items-center font-semibold";
const SCENE =
  "transition-rf inline-flex min-h-touch items-center rounded-md border border-rule-strong px-4 text-sm font-semibold no-underline";
const sceneClass = (on: boolean) =>
  `${SCENE} ${on ? "bg-primary text-on-primary" : "bg-surface text-ink hover:bg-surface-sunk"}`;

function Controls({ children }: { children: ReactNode }) {
  return (
    <aside
      aria-label="Mock controls"
      className="mx-3 mb-6 border border-dashed border-rule-strong px-4 py-3 md:mx-6"
    >
      <h2 className="text-base font-bold">Mock controls</h2>
      <p className="mt-1 text-sm">
        Not part of the screen. Nothing here is saved: Save and Cancel only lead back. The line
        reader is a stand-in for the real one, which is built in Phase 1. A photo you add stays on
        this device.
      </p>
      {children}
      <p className="mt-1 text-sm">
        <Link to="/mock" className={LINK}>
          All mock screens
        </Link>
      </p>
    </aside>
  );
}

/**
 * The household's lists as the editor uses them, held here so that a unit or
 * an organizer created in a picker shows up at once. Photos the tester adds
 * are shown from the device and go nowhere.
 */
function useMockLists() {
  const [units, setUnits] = useState<Unit[]>(fixtureUnits);
  const [organizers, setOrganizers] = useState<Organizer[]>(fixtureOrganizers);
  const foods: Food[] = fixtureFoods;
  const added = useRef(new Map<string, string>());

  const stocks = assignStocks(
    organizers
      .filter((organizer) => organizer.kind === "category")
      .map((organizer) => organizer.id),
  );

  return {
    lists: { units, foods, organizers },
    parse: useMemo(() => ingredientParser({ units, foods: fixtureFoods }), [units]),
    stockFor: (categoryId: string) => stocks.get(categoryId) ?? "plain",
    // Stands in for the model: the line's first number as its amount and its
    // last word as its food, after a moment, so the waiting state can be seen.
    // A line with no number in it gets no reading.
    readLine: async (text: string): Promise<LineReading> => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const amount = /\d+/.exec(text)?.[0];
      const read = amount
        ? matchReading(
            {
              quantity: Number(amount),
              unitName: null,
              foodName: text.trim().split(/\s+/).at(-1) ?? null,
              note: "",
            },
            { units, foods },
          )
        : null;
      return read ? { read } : { read: null, why: "nothing" };
    },
    addedUrl: (asset: Asset) => added.current.get(asset.id),
    onCreateUnit: (name: string) => {
      const id = newId();
      setUnits((now) => [
        ...now,
        {
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
          createdAt: FIXTURE_TIME,
          updatedAt: FIXTURE_TIME,
        },
      ]);
      return id;
    },
    onCreateOrganizer: (kind: OrganizerKind, name: string) => {
      const id = newId();
      setOrganizers((now) => [
        ...now,
        {
          id,
          kind,
          name,
          slug: slugify(name),
          // The mock colours categories by their place in the list, as before.
          color: null,
          createdAt: FIXTURE_TIME,
          updatedAt: FIXTURE_TIME,
        },
      ]);
      return id;
    },
    onAddPhotos: (group: "photo" | "original" | "attachment", files: File[]): Asset[] =>
      files.map((file, index) => {
        const id = newId();
        added.current.set(id, URL.createObjectURL(file));
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
          createdAt: FIXTURE_TIME,
        };
      }),
  };
}

const editRoute = getRouteApi("/mock/edit/$slug");

/** A fixture recipe in the editor. */
export function MockEdit() {
  const { slug } = editRoute.useParams();
  const { scene = "editing" } = editRoute.useSearch();
  const navigate = useNavigate();
  const mock = useMockLists();
  const recipe = mockRecipe(slug);
  const [conflict, setConflict] = useState(scene === "conflict");

  if (!recipe) {
    return (
      <Page title="Not found">
        <EmptyState title="There is no sample recipe at this address">
          Open one from the mock list and press Edit.
        </EmptyState>
      </Page>
    );
  }

  // The "problems" scene starts from a recipe with its title rubbed out, a bad link and an untitled section.
  const initial: EditorValue = fromRecipe(recipe);
  const broken: EditorValue = {
    ...initial,
    title: "",
    sourceUrl: "example kitchen",
    servings: "lots",
    ingredients: [...initial.ingredients, { kind: "divider", id: newId(), title: "" }],
  };
  const back = () => navigate({ to: "/mock/recipe/$slug", params: { slug }, search: {} });

  return (
    <>
      <RecipeEditorScreen
        // A scene is a different starting state, so the editor starts again with it.
        key={scene}
        mode="edit"
        initial={scene === "problems" ? broken : initial}
        showProblems={scene === "problems"}
        asking={scene === "leaving"}
        conflict={conflict}
        onConflict={(choice) => {
          setConflict(false);
          if (choice !== "keep-editing") {
            back();
          }
        }}
        lists={mock.lists}
        parse={mock.parse}
        stockFor={mock.stockFor}
        photoUrl={(asset) => mock.addedUrl(asset) ?? placeholderPhoto(recipe, asset)}
        onAddPhotos={mock.onAddPhotos}
        onCreateUnit={mock.onCreateUnit}
        onReadLine={mock.readLine}
        onCreateOrganizer={mock.onCreateOrganizer}
        onSave={back}
        onLeave={back}
        backLabel={recipe.title}
      />
      <Controls>
        <ul className="mt-3 flex flex-wrap gap-2">
          {EDITOR_SCENES.map((option: EditorScene) => (
            <li key={option}>
              <Link
                to="/mock/edit/$slug"
                params={{ slug }}
                search={option === "editing" ? {} : { scene: option }}
                aria-current={option === scene ? "true" : undefined}
                className={sceneClass(option === scene)}
                onClick={() => setConflict(option === "conflict")}
              >
                {EDITOR_SCENE_LABELS[option]}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          <Link to="/mock/new" search={{}} className={LINK}>
            A new, empty recipe
          </Link>
          {" · "}
          <Link to="/mock/review" search={{}} className={LINK}>
            Reviewing an import
          </Link>
        </p>
      </Controls>
    </>
  );
}

/** The editor on a recipe that does not exist yet. */
export function MockNew() {
  const navigate = useNavigate();
  const mock = useMockLists();
  const leave = () => navigate({ to: "/mock/list", search: {} });
  return (
    <>
      <RecipeEditorScreen
        mode="new"
        initial={emptyEditorValue()}
        lists={mock.lists}
        parse={mock.parse}
        stockFor={mock.stockFor}
        photoUrl={mock.addedUrl}
        onAddPhotos={mock.onAddPhotos}
        onCreateUnit={mock.onCreateUnit}
        onReadLine={mock.readLine}
        onCreateOrganizer={mock.onCreateOrganizer}
        onSave={leave}
        onLeave={leave}
        backLabel="All recipes"
      />
      <Controls>
        <p className="mt-3 text-sm">
          Try typing <span className="font-semibold">2 1/4 C. flour</span>,{" "}
          <span className="font-semibold">1 t. soda</span> or{" "}
          <span className="font-semibold">3 cups saffron rice</span>, or paste several lines at
          once.
        </p>
      </Controls>
    </>
  );
}

const reviewRoute = getRouteApi("/mock/review");
const PAGE_PICTURE_ID = "00000000-0000-7000-8000-0600000000f1";

/** The editor in review mode, on what the sample import found. */
export function MockReview() {
  const { scene = "link" } = reviewRoute.useSearch();
  const navigate = useNavigate();
  const mock = useMockLists();
  const fromText = scene === "pasted";
  const draft = (fromText ? importPastedText : importNeedsReview).result?.draft;

  const prepared = useMemo(() => {
    if (!draft) {
      return null;
    }
    const lists = { units: fixtureUnits, foods: fixtureFoods, organizers: fixtureOrganizers };
    if (fromText) {
      // A model wrote this one, so the organizers it suggests are offered, not chosen.
      return prepareReview(draft, lists, ingredientParser(lists), [], true);
    }
    // The page's main picture arrives as the cover, and can be removed like any other.
    const cover: Asset = {
      id: PAGE_PICTURE_ID,
      role: "cover",
      position: 0,
      contentType: "image/jpeg",
      sizeBytes: 240_000,
      width: 1200,
      height: 900,
      hasVariants: false,
      originalFilename: null,
      createdAt: FIXTURE_TIME,
    };
    return prepareReview(draft, lists, ingredientParser(lists), [cover]);
  }, [draft, fromText]);

  if (!prepared) {
    return null;
  }
  const leave = () => navigate({ to: "/mock/list", search: {} });
  const fromCard = scene === "card";

  const review: Review = {
    from: fromCard ? "a photo of a card" : fromText ? "pasted text" : "recipes.example.com",
    sourceUrl: fromCard || fromText ? undefined : (importNeedsReview.sourceUrl ?? undefined),
    byAi: fromText,
    attention: prepared.attention,
    flaggedRows: prepared.flaggedRows,
    flaggedParts: prepared.flaggedParts,
    suggestions: prepared.suggestions,
    offered: prepared.offered,
    duplicate:
      scene === "duplicate"
        ? {
            title: "Lemony Red Lentil Soup",
            onOpen: () =>
              navigate({
                to: "/mock/recipe/$slug",
                params: { slug: "lemony-red-lentil-soup" },
                search: {},
              }),
          }
        : undefined,
    original: fromCard
      ? {
          title: "Original",
          caption: "The card as photographed. Check each line against the handwriting.",
          photos: [
            { id: "front", url: cardFront, alt: "The front of the card" },
            { id: "back", url: cardBack, alt: "The back of the card" },
          ],
        }
      : fromText
        ? {
            title: "Original",
            caption: "The text as you pasted it.",
            text: importPastedText.result?.sourceText ?? undefined,
            photos: [],
          }
        : {
            title: "Original",
            caption: "The picture from the page. Open the page to check the rest against it.",
            photos: [{ id: "page", url: pagePicture, alt: "The picture from the page" }],
          },
  };

  return (
    <>
      <RecipeEditorScreen
        key={scene}
        mode="review"
        initial={prepared.value}
        review={review}
        lists={mock.lists}
        parse={mock.parse}
        stockFor={mock.stockFor}
        photoUrl={(asset) =>
          mock.addedUrl(asset) ?? (asset.id === PAGE_PICTURE_ID ? pagePicture : undefined)
        }
        onAddPhotos={mock.onAddPhotos}
        onCreateUnit={mock.onCreateUnit}
        onReadLine={mock.readLine}
        onCreateOrganizer={mock.onCreateOrganizer}
        onSave={leave}
        onLeave={leave}
        backLabel="All recipes"
      />
      <Controls>
        <ul className="mt-3 flex flex-wrap gap-2">
          {REVIEW_SCENES.map((option: ReviewScene) => (
            <li key={option}>
              <Link
                to="/mock/review"
                search={option === "link" ? {} : { scene: option }}
                aria-current={option === scene ? "true" : undefined}
                className={sceneClass(option === scene)}
              >
                {REVIEW_SCENE_LABELS[option]}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          “From pasted text” is a draft an AI model wrote up, with two things it was unsure of and
          the pasted text to check it against.
        </p>
        <p className="mt-3 text-sm">
          “From a card” shows where the photographed card will sit in Phase 2: it takes turns with
          the recipe on a phone and sits beside it on a tablet held sideways. Every picture here is
          a placeholder drawing.
        </p>
      </Controls>
    </>
  );
}
