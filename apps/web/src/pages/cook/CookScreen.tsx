import { formatQuantity, type Recipe } from "@recipeflare/schema";
import { ChevronUp, CloudOff, ListChecks, Sun, SunDim, UserRoundX } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { Notice } from "../../ui/Notice";
import { Sheet } from "../../ui/Sheet";
import { STOCK_BG, type Stock } from "../../ui/stock";
import { CheckRow } from "./CheckRow";
import type { CookSession } from "./cookSession";
import { IngredientChecklist } from "./IngredientChecklist";
import type { WakeState } from "./useWakeLock";

type CookScreenProps = {
  recipe: Recipe;
  session: CookSession;
  onToggleStep: (stepId: string) => void;
  onToggleIngredient: (ingredientId: string) => void;
  onScale: (scale: number) => void;
  /** Leaves cook mode and forgets what was ticked. */
  onDone: () => void;
  /** Whether the screen is being kept on. */
  wake: WakeState;
  /** True once the cook has been told that this browser cannot keep the screen on. */
  wakeNoteSeen: boolean;
  onWakeNoteSeen: () => void;
  /** The divider colour of the recipe's first category. It runs along the foot of the header. */
  stock?: Stock;
  /** True when the device has no connection. Cook mode works all the same. */
  offline?: boolean;
  /** True when the sign-in has run out. Cook mode works all the same. */
  signedOut?: boolean;
  onSignIn?: () => void;
  /** Shown after the last step. The mock harness puts its controls here. */
  after?: ReactNode;
};

// A notice with something to press: the words keep their even lines, and the
// button sits beside them where there is room and under them where there is not.
// The button is a full-size target that takes no more room than a line of text,
// so the words' first line stays level with the icon.
const NOTE = "flex flex-wrap items-center gap-x-4 gap-y-3";
const NOTE_BUTTON = "-my-3 inline-flex min-h-touch min-w-touch items-center font-bold underline";

/**
 * Cook mode: the recipe for the counter. It fills the screen, in type large
 * enough to read at arm's length, and every row is one big target. Steps are
 * ticked off as they are done; ingredients as they are got out.
 *
 * On a phone held upright the ingredients are a sheet reached from a bar at
 * the bottom, which is there whichever step is on screen. On a tablet, or a
 * phone, on its side they are a column beside the steps.
 */
export function CookScreen({
  recipe,
  session,
  onToggleStep,
  onToggleIngredient,
  onScale,
  onDone,
  wake,
  wakeNoteSeen,
  onWakeNoteSeen,
  stock = "plain",
  offline = false,
  signedOut = false,
  onSignIn,
  after,
}: CookScreenProps) {
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const steps = recipe.stepSections.flatMap((section) => section.steps);
  const lines = recipe.ingredientSections.flatMap((section) => section.items);
  const doneSteps = steps.filter((step) => session.steps.includes(step.id)).length;
  const outLines = lines.filter((line) => session.ingredients.includes(line.id)).length;
  const allDone = steps.length > 0 && doneSteps === steps.length;
  const sectioned = recipe.stepSections.some((section) => section.title);
  // The step the cook is on: the first that is not ticked.
  const current = steps.find((step) => !session.steps.includes(step.id));

  const tick = (stepId: string) => {
    const wasDone = session.steps.includes(stepId);
    onToggleStep(stepId);
    if (wasDone) {
      return;
    }
    const last = doneSteps + 1 === steps.length;
    // The step just done goes to the top, so the next one sits right under it
    // with one row to look back at. After the last, the ending comes into view.
    requestAnimationFrame(() => {
      const target = last
        ? scroller.current?.querySelector("[data-ending]")
        : scroller.current?.querySelector(`[data-step="${stepId}"]`);
      target?.scrollIntoView?.({ block: last ? "nearest" : "start" });
    });
  };

  // Done asks first only in the middle of a recipe, where a stray knuckle would lose the cook's place.
  const done = () => {
    if (doneSteps > 0 && !allDone) {
      setLeaving(true);
    } else {
      onDone();
    }
  };

  const checklist = (
    <IngredientChecklist
      recipe={recipe}
      session={session}
      onToggle={onToggleIngredient}
      onScale={onScale}
    />
  );

  // What the cook should know but need not keep looking at: these scroll away with the first step.
  const notes = (
    <>
      {signedOut ? (
        <Notice icon={<UserRoundX aria-hidden="true" size="1.125rem" />}>
          <span className={NOTE}>
            <span>You are signed out. Cooking carries on from the copy on this device.</span>
            <button type="button" onClick={onSignIn} className={NOTE_BUTTON}>
              Sign in again
            </button>
          </span>
        </Notice>
      ) : null}
      {offline ? (
        <Notice icon={<CloudOff aria-hidden="true" size="1.125rem" />}>
          You are offline. Cooking carries on from the copy on this device.
        </Notice>
      ) : null}
      {wake === "unavailable" && !wakeNoteSeen ? (
        <Notice icon={<SunDim aria-hidden="true" size="1.125rem" />}>
          <span className={NOTE}>
            <span>
              This browser cannot keep the screen on. Set a longer screen timeout on the device
              while you cook.
            </span>
            <button type="button" onClick={onWakeNoteSeen} className={NOTE_BUTTON}>
              Got it
            </button>
          </span>
        </Notice>
      ) : null}
    </>
  );

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-surface">
      {/* On a short screen the count and the screen indicator move up beside the title, and the bar goes. */}
      <header className="on-shell flex-none bg-shell text-on-shell">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5 short:grid-cols-[minmax(0,1fr)_auto_auto] short:pb-2">
          <h1 className="min-w-0 truncate text-lg font-bold">{recipe.title}</h1>
          <button
            type="button"
            onClick={done}
            className="transition-rf inline-flex min-h-touch flex-none items-center rounded-md border border-on-shell px-5 text-base font-semibold text-on-shell hover:bg-shell-raised short:col-start-3 short:row-start-1"
          >
            Done
          </button>
          <div className="col-span-2 mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm short:col-span-1 short:col-start-2 short:row-start-1 short:mt-0 short:flex-nowrap">
            {steps.length > 0 ? (
              <p role="status" className="whitespace-nowrap">
                <span className="font-semibold">
                  {doneSteps} of {steps.length}
                </span>{" "}
                steps done
              </p>
            ) : (
              <p>Ingredients only</p>
            )}
            <p className="flex items-center gap-1.5 whitespace-nowrap">
              {wake === "on" ? (
                <Sun aria-hidden="true" size="1.125rem" />
              ) : (
                <SunDim aria-hidden="true" size="1.125rem" />
              )}
              {wake === "on" ? "Screen stays on" : "Screen may turn off"}
            </p>
          </div>
          {steps.length > 0 ? (
            <div
              aria-hidden="true"
              className="col-span-2 mt-2 h-2 overflow-hidden rounded-pill border border-rule-strong bg-shell-raised short:hidden"
            >
              <div
                className="h-full bg-on-shell transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${(doneSteps / steps.length) * 100}%` }}
              />
            </div>
          ) : null}
        </div>
        {/* The tin's wayfinding carries into cook mode: the recipe's category colour runs along the header's foot. */}
        <div
          aria-hidden="true"
          className={stock === "plain" ? "h-px bg-rule-strong" : `h-[5px] ${STOCK_BG[stock]}`}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        {lines.length > 0 ? (
          <aside
            aria-label="Ingredients"
            className={`${
              steps.length > 0
                ? "hidden w-80 flex-none border-r border-rule beside:block min-[60rem]:w-[24rem]"
                : "flex-1"
            } overflow-y-auto overscroll-contain`}
          >
            {steps.length === 0 ? notes : null}
            <h2 className="border-b-2 border-red-line px-4 pt-3 pb-2 text-xl font-bold">
              Ingredients
              <span className="ml-2 text-sm font-normal">
                {outLines} of {lines.length} out
              </span>
            </h2>
            {/* On a phone held upright this column is absent and the same list fills the sheet. */}
            {ingredientsOpen ? null : checklist}
          </aside>
        ) : null}

        {steps.length > 0 ? (
          <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
            {notes}
            {recipe.stepSections.map((section, index) => {
              const ticked = section.steps.filter((step) => session.steps.includes(step.id)).length;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: sections have no ID and do not reorder here
                <section key={index} aria-label={section.title ?? "Steps"}>
                  {sectioned ? (
                    <h2 className="flex items-baseline justify-between gap-3 border-b border-rule bg-surface-sunk px-4 py-2 text-lg font-bold">
                      {section.title ?? "Steps"}
                      <span className="text-sm font-normal">
                        {ticked} of {section.steps.length}
                      </span>
                    </h2>
                  ) : null}
                  <ol>
                    {section.steps.map((step, number) => {
                      const isTicked = session.steps.includes(step.id);
                      const isCurrent = step.id === current?.id;
                      return (
                        <li
                          key={step.id}
                          data-step={step.id}
                          aria-current={isCurrent ? "step" : undefined}
                        >
                          <CheckRow
                            checked={isTicked}
                            onChange={() => tick(step.id)}
                            className={isTicked ? "" : "py-4"}
                          >
                            {/* Small behind, large ahead: a done step drops to the ordinary size, and the one the cook is on is set heavier. */}
                            <span
                              className={`flex gap-3 ${
                                isTicked
                                  ? "text-base"
                                  : `text-cook leading-snug ${isCurrent ? "font-semibold" : ""}`
                              }`}
                            >
                              <span aria-hidden="true" className="w-6 flex-none font-bold">
                                {number + 1}
                              </span>
                              <span className="sr-only">Step {number + 1}.</span>
                              <span className="min-w-0 max-w-[40ch]">{step.text}</span>
                            </span>
                          </CheckRow>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}

            {allDone ? (
              <div data-ending className="scroll-mb-4 px-4 py-6">
                <p className="text-cook font-bold">All {steps.length} steps done.</p>
                <p className="mt-1">Done closes cook mode and clears the ticks.</p>
                <Button className="mt-4" onClick={onDone}>
                  Done
                </Button>
              </div>
            ) : null}
            {after}
          </div>
        ) : null}
      </div>

      {lines.length > 0 && steps.length > 0 ? (
        <div className="flex-none border-t border-rule-strong bg-surface px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] beside:hidden">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setIngredientsOpen(true)}
            className="transition-rf flex min-h-touch-nav w-full items-center gap-3 rounded-md border border-rule-strong bg-surface px-4 py-1.5 text-left hover:bg-surface-sunk"
          >
            <ListChecks aria-hidden="true" size="1.375rem" className="flex-none" />
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <span className="block text-lg font-semibold leading-tight">Ingredients</span>
              <span className="block text-sm">
                {outLines} of {lines.length} out
                {session.scale !== 1 ? `, at ${formatQuantity(session.scale)}×` : ""}
              </span>
            </span>
            <ChevronUp aria-hidden="true" size="1.25rem" className="flex-none" />
          </button>
        </div>
      ) : null}

      <Sheet
        open={ingredientsOpen}
        onClose={() => setIngredientsOpen(false)}
        title="Ingredients"
        tall
        footer={<Button onClick={() => setIngredientsOpen(false)}>Back to the steps</Button>}
      >
        {checklist}
      </Sheet>

      <Sheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Finish cooking?"
        footer={
          <>
            <Button
              variant="quiet"
              onClick={() => {
                setLeaving(false);
                onDone();
              }}
            >
              Leave and clear ticks
            </Button>
            <Button onClick={() => setLeaving(false)}>Keep cooking</Button>
          </>
        }
      >
        <p className="px-4 py-4">
          {doneSteps} of {steps.length} steps are ticked. Leaving clears the ticks, so this recipe
          starts fresh next time.
        </p>
      </Sheet>
    </div>
  );
}
