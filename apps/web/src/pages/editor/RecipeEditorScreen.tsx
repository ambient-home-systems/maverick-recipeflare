import { type Asset, newId, type OrganizerKind, type RecipeInput } from "@recipeflare/schema";
import { ChevronDown, ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { DividerBack } from "../../ui/DividerTabs";
import { FieldProblem, Mark, TextArea, TextField } from "../../ui/Field";
import { Notice } from "../../ui/Notice";
import { Page } from "../../ui/Page";
import { SectionHead } from "../../ui/SectionHead";
import { Sheet } from "../../ui/Sheet";
import type { Stock } from "../../ui/stock";
import { PhotoViewer, type ViewerPhoto } from "../recipe/PhotoViewer";
import {
  checkEditorValue,
  type Duration,
  type EditorLists,
  type EditorValue,
  isDirty,
  type LineParser,
  NUTRITION_FIELDS,
} from "./editorState";
import { IngredientList } from "./IngredientList";
import { OrganizerFields } from "./OrganizerFields";
import { PhotoFields } from "./PhotoFields";
import { SMALL_BUTTON } from "./rowParts";
import { StepList } from "./StepList";

/** What an import found, for the cook to check before anything is saved. */
export type Review = {
  /** Where it came from, in a few words: "recipes.example.com". */
  from: string;
  sourceUrl?: string;
  /** What needs attention, in plain sentences: "No steps were found". */
  attention: string[];
  /** Ingredient rows to look at, by ID. */
  flaggedRows: string[];
  /** Parts of the recipe to look at: "title", "ingredients", "steps". */
  flaggedParts: string[];
  suggestions?: Partial<Record<OrganizerKind, string[]>>;
  /** A recipe the household already has from the same link. */
  duplicate?: { title: string; onOpen: () => void };
  /**
   * What the draft was read from, to check it against. For a link this is the
   * page's picture; from Phase 2 it is the photographed card.
   */
  original?: { title: string; photos: ViewerPhoto[]; caption: string };
};

type RecipeEditorScreenProps = {
  mode: "new" | "edit" | "review";
  initial: EditorValue;
  lists: EditorLists;
  parse: LineParser;
  stockFor: (categoryId: string) => Stock;
  photoUrl: (asset: Asset) => string | undefined;
  onAddPhotos: (group: "photo" | "original", files: File[]) => Asset[];
  onCreateUnit: (name: string) => string;
  onCreateOrganizer: (kind: OrganizerKind, name: string) => string;
  /** Called with a recipe the shared schema accepts, once any new foods have been confirmed. */
  onSave: (input: RecipeInput, newFoods: string[], assets: Asset[]) => void;
  /** Leaves the editor without saving. In review this discards the import. */
  onLeave: () => void;
  /** Where the way back leads, in a few words: the recipe's title, or "All recipes". */
  backLabel: string;
  /** True while a save is on its way. */
  saving?: boolean;
  /** True when the save was refused because another device saved the recipe first. */
  conflict?: boolean;
  onConflict?: (choice: "reload" | "overwrite" | "keep-editing") => void;
  /** Shows problems before the first save is tried. For drawing the state in the mock. */
  showProblems?: boolean;
  /** Opens the "leave without saving" question at once. For drawing the state in the mock. */
  asking?: boolean;
  review?: Review;
};

const TITLES = { new: "New recipe", edit: "Edit recipe", review: "Review import" };

function DurationField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: Duration;
  onChange: (value: Duration) => void;
  error?: string;
}) {
  const box =
    "min-h-touch w-16 rounded-md border border-rule-strong bg-surface px-3 text-base text-ink";
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`${label}, hours`}
          aria-invalid={error ? true : undefined}
          value={value.hours}
          onChange={(event) => onChange({ ...value, hours: event.target.value })}
          className={box}
        />
        <span aria-hidden="true">hr</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`${label}, minutes`}
          aria-invalid={error ? true : undefined}
          value={value.minutes}
          onChange={(event) => onChange({ ...value, minutes: event.target.value })}
          className={box}
        />
        <span aria-hidden="true">min</span>
      </div>
      {error ? <FieldProblem>{error}</FieldProblem> : null}
    </fieldset>
  );
}

/**
 * The recipe editor: one long card in the recipe view's own order, so editing
 * is the recipe made changeable. It is used to type a new recipe, to change a
 * saved one, and to review what an import found. The screen is given its
 * starting value and its lists; it saves nothing itself.
 */
export function RecipeEditorScreen({
  mode,
  initial,
  lists,
  parse,
  stockFor,
  photoUrl,
  onAddPhotos,
  onCreateUnit,
  onCreateOrganizer,
  onSave,
  onLeave,
  backLabel,
  saving = false,
  conflict = false,
  onConflict,
  showProblems = false,
  asking = false,
  review,
}: RecipeEditorScreenProps) {
  const [value, setValue] = useState(initial);
  const [tried, setTried] = useState(showProblems);
  const [leaving, setLeaving] = useState(asking);
  const [confirmFoods, setConfirmFoods] = useState<string[] | null>(null);
  const [pane, setPane] = useState<"recipe" | "original">("recipe");
  const [viewing, setViewing] = useState<number | null>(null);
  const summary = useRef<HTMLDivElement>(null);

  const set = <K extends keyof EditorValue>(key: K, next: EditorValue[K]) =>
    setValue((now) => ({ ...now, [key]: next }));

  // Problems are shown once a save has been tried, and then follow the typing so they clear as they are fixed.
  const checked = checkEditorValue(value);
  const errors = tried ? checked.errors : {};
  const problemCount = Object.keys(errors).length;

  const save = (foodsConfirmed = false) => {
    setTried(true);
    if (!checked.input) {
      summary.current?.focus();
      summary.current?.scrollIntoView?.({ block: "center" });
      return;
    }
    if (checked.newFoods.length > 0 && !foodsConfirmed) {
      setConfirmFoods(checked.newFoods);
      return;
    }
    setConfirmFoods(null);
    onSave(checked.input, checked.newFoods, value.assets);
  };

  const leave = () => {
    // A review always asks: discarding an import cannot be undone.
    if (mode === "review" || isDirty(value, initial)) {
      setLeaving(true);
    } else {
      onLeave();
    }
  };

  const flaggedPart = (part: string) => review?.flaggedParts.includes(part) ?? false;
  const original = review?.original;

  const form: ReactNode = (
    <>
      <div className="grid gap-4 px-4 py-4">
        <TextField
          label="Title"
          value={value.title}
          error={errors.title}
          flagged={flaggedPart("title")}
          onChange={(title) => set("title", title)}
        />
        <TextArea
          label="Description"
          value={value.description}
          error={errors.description}
          onChange={(description) => set("description", description)}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="From"
            value={value.sourceName}
            error={errors.sourceName}
            hint="A person, a cookbook, an account."
            onChange={(sourceName) => set("sourceName", sourceName)}
          />
          <TextField
            label="Link"
            type="url"
            inputMode="url"
            value={value.sourceUrl}
            error={errors.sourceUrl}
            onChange={(sourceUrl) => set("sourceUrl", sourceUrl)}
          />
        </div>
      </div>

      <SectionHead title="Photos" />
      <PhotoFields
        assets={value.assets}
        onChange={(assets) => set("assets", assets)}
        photoUrl={photoUrl}
        onAddPhotos={onAddPhotos}
      />

      <SectionHead title="Times and amounts" />
      <div className="grid gap-4 px-4 py-4">
        <div className="grid gap-4 md:grid-cols-3">
          <DurationField
            label="Prep time"
            value={value.prep}
            error={errors.prep ?? errors.prepTimeSeconds}
            onChange={(prep) => set("prep", prep)}
          />
          <DurationField
            label="Cook time"
            value={value.cook}
            error={errors.cook ?? errors.cookTimeSeconds}
            onChange={(cook) => set("cook", cook)}
          />
          <DurationField
            label="Total time"
            value={value.total}
            error={errors.total ?? errors.totalTimeSeconds}
            onChange={(total) => set("total", total)}
          />
        </div>
        <p className="-mt-2 text-sm">Leave the total empty to show prep and cook added together.</p>
        {/* Short boxes for the numbers; what the yield is made of takes the rest, or its own line when text is large. */}
        <div className="flex flex-wrap gap-x-3 gap-y-4">
          <TextField
            className="w-[6.5rem]"
            label="Serves"
            inputMode="decimal"
            invalid={Boolean(errors.servings)}
            value={value.servings}
            onChange={(servings) => set("servings", servings)}
          />
          <TextField
            className="w-[6.5rem]"
            label="Makes"
            inputMode="decimal"
            invalid={Boolean(errors.yield)}
            value={value.yieldQuantity}
            onChange={(yieldQuantity) => set("yieldQuantity", yieldQuantity)}
          />
          <TextField
            className="min-w-[min(100%,10rem)] flex-1"
            label="Of what"
            value={value.yieldUnit}
            hint="Such as cookies, or 9-inch pie."
            onChange={(yieldUnit) => set("yieldUnit", yieldUnit)}
          />
        </div>
        {errors.servings ? <FieldProblem>Serves: {errors.servings}</FieldProblem> : null}
        {errors.yield ? <FieldProblem>Makes: {errors.yield}</FieldProblem> : null}
      </div>

      <SectionHead title="Ingredients">
        {flaggedPart("ingredients") ? <Mark>check</Mark> : null}
      </SectionHead>
      {errors.ingredients ? (
        <div className="border-t border-rule px-4 py-2">
          <FieldProblem>{errors.ingredients}</FieldProblem>
        </div>
      ) : null}
      <IngredientList
        rows={value.ingredients}
        onChange={(ingredients) => set("ingredients", ingredients)}
        lists={lists}
        parse={parse}
        errors={errors}
        flagged={review?.flaggedRows}
        onCreateUnit={onCreateUnit}
      />

      <SectionHead title="Steps">{flaggedPart("steps") ? <Mark>check</Mark> : null}</SectionHead>
      {errors.steps ? (
        <div className="border-t border-rule px-4 py-2">
          <FieldProblem>{errors.steps}</FieldProblem>
        </div>
      ) : null}
      <StepList rows={value.steps} onChange={(steps) => set("steps", steps)} errors={errors} />

      <SectionHead title="Notes" />
      <ul aria-label="Notes">
        {value.notes.map((note, index) => (
          <li key={note.id} className="grid gap-3 border-t border-rule px-4 py-3">
            <TextField
              label={`Note ${index + 1}, title`}
              value={note.title}
              hint="Optional: Make ahead, Freezing, Written on the back."
              onChange={(title) =>
                set(
                  "notes",
                  value.notes.map((other) => (other.id === note.id ? { ...other, title } : other)),
                )
              }
            />
            <TextArea
              label={`Note ${index + 1}`}
              rows={2}
              value={note.text}
              error={errors[`row:${note.id}`]}
              onChange={(text) =>
                set(
                  "notes",
                  value.notes.map((other) => (other.id === note.id ? { ...other, text } : other)),
                )
              }
            />
            <div>
              <button
                type="button"
                className={SMALL_BUTTON}
                onClick={() =>
                  set(
                    "notes",
                    value.notes.filter((other) => other.id !== note.id),
                  )
                }
              >
                <Trash2 aria-hidden="true" size="1.125rem" />
                Delete note {index + 1}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-rule px-4 py-3">
        <button
          type="button"
          className={SMALL_BUTTON}
          onClick={() => set("notes", [...value.notes, { id: newId(), title: "", text: "" }])}
        >
          <Plus aria-hidden="true" size="1.125rem" />
          Add a note
        </button>
      </div>

      <details className="group border-t border-rule">
        <summary className="transition-rf flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 bg-surface-sunk px-4 text-lg font-bold hover:bg-surface [&::-webkit-details-marker]:hidden">
          Nutrition
          <ChevronDown
            aria-hidden="true"
            size="1.25rem"
            className="transition-rf group-open:rotate-180"
          />
        </summary>
        {/* As many columns as fit: two on a phone, one when the text is very large. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-x-3 gap-y-3 px-4 py-4">
          <p className="col-span-full text-sm">
            Written as printed, with the unit: 320, 12 g, 480 mg. Leave empty what the recipe does
            not say.
          </p>
          {NUTRITION_FIELDS.map(([key, label]) => (
            <TextField
              key={key}
              label={label}
              value={value.nutrition[key]}
              error={errors[`nutrition.${key}`]}
              onChange={(text) => set("nutrition", { ...value.nutrition, [key]: text })}
            />
          ))}
        </div>
      </details>

      <SectionHead title="Filed under" />
      <OrganizerFields
        organizers={lists.organizers}
        ids={{ category: value.categoryIds, tag: value.tagIds, tool: value.toolIds }}
        onChange={(kind, ids) =>
          set(kind === "category" ? "categoryIds" : kind === "tag" ? "tagIds" : "toolIds", ids)
        }
        stockFor={stockFor}
        onCreate={onCreateOrganizer}
        suggestions={review?.suggestions}
        error={errors.organizers}
      />
    </>
  );

  return (
    <>
      <DividerBack label={backLabel} onBack={leave} />
      <Page joined title={TITLES[mode]}>
        {/* Problems are announced together, once, when a save is refused. */}
        <div ref={summary} tabIndex={-1} className="outline-none">
          {problemCount > 0 ? (
            <Notice problem>
              {problemCount === 1
                ? "One thing needs fixing before this can be saved. It is marked below."
                : `${problemCount} things need fixing before this can be saved. They are marked below.`}
            </Notice>
          ) : null}
        </div>

        {review ? (
          <div className="border-b border-rule px-4 py-4">
            <p className="[overflow-wrap:anywhere]">
              Read from <span className="font-semibold">{review.from}</span>. Nothing is saved until
              you press Save recipe.
            </p>
            {review.sourceUrl ? (
              <a
                href={review.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-touch items-center gap-1.5 font-semibold"
              >
                Open the page
                <ExternalLink aria-hidden="true" size="1rem" />
                <span className="sr-only">(in a new tab)</span>
              </a>
            ) : null}
            {review.attention.length > 0 ? (
              <>
                <h2 className="mt-2 font-bold">
                  {review.attention.length === 1
                    ? "One thing to check"
                    : `${review.attention.length} things to check`}
                </h2>
                <ul className="mt-1 list-disc pl-5">
                  {review.attention.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-2 text-sm">
                  Each is marked <Mark>check</Mark> where it is. None of them stops you saving.
                </p>
              </>
            ) : null}
            {review.duplicate ? (
              <p className="mt-3">
                You already have a recipe from this link:{" "}
                <button
                  type="button"
                  onClick={review.duplicate.onOpen}
                  className="inline-flex min-h-touch items-center font-semibold underline"
                >
                  {review.duplicate.title}
                </button>
                . This one can still be saved.
              </p>
            ) : null}
          </div>
        ) : null}

        {original ? (
          <div className="@container">
            {/* On a phone the original and the recipe take turns; on a wide card they sit side by side. */}
            <div className="border-b border-rule px-4 py-2 @[44rem]:hidden">
              <fieldset className="flex w-full min-w-0 items-center gap-1 rounded-md border border-rule-strong bg-surface p-1">
                <legend className="sr-only">Show</legend>
                {(["recipe", "original"] as const).map((option) => (
                  <label
                    key={option}
                    className={`transition-rf grid min-h-touch min-w-0 flex-1 cursor-pointer place-items-center rounded-sm px-2 text-base font-semibold [overflow-wrap:anywhere] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus ${
                      pane === option
                        ? "bg-primary text-on-primary"
                        : "text-ink hover:bg-surface-sunk"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pane"
                      value={option}
                      checked={pane === option}
                      onChange={() => setPane(option)}
                      className="sr-only"
                    />
                    {option === "recipe" ? "Recipe" : original.title}
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="@[44rem]:grid @[44rem]:grid-cols-[20rem_minmax(0,1fr)]">
              <aside
                aria-label={original.title}
                className={`${pane === "original" ? "block" : "hidden"} px-4 py-4 @[44rem]:block @[44rem]:border-r @[44rem]:border-rule`}
              >
                <div className="@[44rem]:sticky @[44rem]:top-4">
                  <h2 className="font-bold">{original.title}</h2>
                  <p className="text-sm">{original.caption}</p>
                  <ul className="mt-3 grid gap-3">
                    {original.photos.map((photo, index) => (
                      <li key={photo.id}>
                        <button
                          type="button"
                          onClick={() => setViewing(index)}
                          aria-label={`${photo.alt}. Open it full screen`}
                          className="block w-full rounded-sm"
                        >
                          <img
                            src={photo.url}
                            alt=""
                            className="transition-rf w-full rounded-sm border border-rule bg-skeleton hover:border-rule-strong"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
              <div className={`${pane === "recipe" ? "block" : "hidden"} min-w-0 @[44rem]:block`}>
                {form}
              </div>
            </div>
          </div>
        ) : (
          form
        )}

        <div className="bottom-[var(--rf-nav-height)] z-[5] flex flex-wrap gap-2 border-t border-rule-strong bg-surface px-4 py-2.5 [@media(min-height:36rem)]:sticky">
          <Button
            className="flex-1 md:flex-none md:px-10"
            icon={<Save aria-hidden="true" size="1.25rem" />}
            busy={saving}
            onClick={() => save()}
          >
            {mode === "review" ? "Save recipe" : "Save"}
          </Button>
          <Button variant="quiet" disabled={saving} onClick={leave}>
            {mode === "review" ? "Discard" : "Cancel"}
          </Button>
        </div>
      </Page>

      <Sheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title={mode === "review" ? "Discard this import?" : "Leave without saving?"}
        footer={
          <>
            <Button variant="quiet" onClick={() => setLeaving(false)}>
              Keep editing
            </Button>
            <Button
              icon={<Trash2 aria-hidden="true" size="1.25rem" />}
              onClick={() => {
                setLeaving(false);
                onLeave();
              }}
            >
              {mode === "review" ? "Discard import" : "Discard changes"}
            </Button>
          </>
        }
      >
        <p className="px-4 py-4">
          {mode === "review"
            ? "What was read from the page will be thrown away. Nothing has been saved as a recipe."
            : mode === "new"
              ? "This recipe has not been saved. What you have typed will be lost."
              : "Your changes have not been saved and will be lost. The recipe stays as it was."}
        </p>
      </Sheet>

      <Sheet
        open={confirmFoods !== null}
        onClose={() => setConfirmFoods(null)}
        title={
          confirmFoods?.length === 1 ? "Add 1 food?" : `Add ${confirmFoods?.length ?? 0} foods?`
        }
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirmFoods(null)}>
              Go back
            </Button>
            <Button onClick={() => save(true)}>
              {confirmFoods?.length === 1 ? "Add it and save" : "Add them and save"}
            </Button>
          </>
        }
      >
        <div className="px-4 py-4">
          <p>
            Saving adds {confirmFoods?.length === 1 ? "this" : "these"} to your foods, because{" "}
            {confirmFoods?.length === 1 ? "it is" : "they are"} not there yet:
          </p>
          <ul className="mt-2 list-disc pl-5 font-semibold">
            {confirmFoods?.map((food) => (
              <li key={food}>{food}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            If one is a food you already have under another name, go back and choose it on its line.
          </p>
        </div>
      </Sheet>

      <Sheet
        open={conflict}
        onClose={() => onConflict?.("keep-editing")}
        title="Changed on another device"
        footer={
          <>
            <Button variant="quiet" onClick={() => onConflict?.("reload")}>
              Reload it
            </Button>
            <Button onClick={() => onConflict?.("overwrite")}>Save over it</Button>
          </>
        }
      >
        <div className="px-4 py-4">
          <p>
            This recipe was saved somewhere else while you were editing it, so your copy was not
            saved.
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>
              <span className="font-semibold">Reload it</span> shows the other version. Your changes
              here are lost.
            </li>
            <li>
              <span className="font-semibold">Save over it</span> keeps yours. The other changes are
              lost.
            </li>
          </ul>
          <p className="mt-2 text-sm">Close this to keep editing without doing either yet.</p>
        </div>
      </Sheet>

      <PhotoViewer
        title={original?.title ?? ""}
        photos={original?.photos ?? []}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
