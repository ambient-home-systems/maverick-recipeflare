import { formatQuantity, type Recipe } from "@recipeflare/schema";
import { ChevronUp, CloudOff, ListChecks, Sun, SunDim, UserRoundX } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { Notice } from "../../ui/Notice";
import { Sheet } from "../../ui/Sheet";
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
const NOTE = "flex flex-wrap items-center gap-x-4";
const NOTE_BUTTON = "inline-flex min-h-touch min-w-touch items-center font-bold underline";

/**
 * Cook mode: the recipe for the counter. It fills the screen, in type large
 * enough to read at arm's length, and every row is one big target. Steps are
 * ticked off as they are done; ingredients as they are got out.
 *
 * On a phone the ingredients are a sheet reached from a bar at the bottom,
 * which is there whichever step is on screen. On a tablet on its side they are
 * a column beside the steps.
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
  offline = false,
  signedOut = false,
  onSignIn,
  after,
}: CookScreenProps) {
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const stepsRef = useRef<HTMLDivElement>(null);

  const steps = recipe.stepSections.flatMap((section) => section.steps);
  const lines = recipe.ingredientSections.flatMap((section) => section.items);
  const doneSteps = steps.filter((step) => session.steps.includes(step.id)).length;
  const outLines = lines.filter((line) => session.ingredients.includes(line.id)).length;
  const allDone = steps.length > 0 && doneSteps === steps.length;
  const sectioned = recipe.stepSections.some((section) => section.title);

  const tick = (stepId: string) => {
    const wasDone = session.steps.includes(stepId);
    onToggleStep(stepId);
    if (wasDone) {
      return;
    }
    // Ticking a step brings the next one that is not done into view, if it is not already.
    const at = steps.findIndex((step) => step.id === stepId);
    const next = steps.slice(at + 1).find((step) => !session.steps.includes(step.id));
    if (next) {
      requestAnimationFrame(() =>
        stepsRef.current
          ?.querySelector(`[data-step="${next.id}"]`)
          ?.scrollIntoView?.({ block: "nearest" }),
      );
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

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-surface">
      <header className="on-shell flex-none bg-shell px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5 text-on-shell">
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 truncate text-lg font-bold">{recipe.title}</h1>
          <button
            type="button"
            onClick={onDone}
            className="transition-rf inline-flex min-h-touch flex-none items-center rounded-md bg-on-shell px-5 text-base font-semibold text-shell hover:bg-surface-sunk"
          >
            Done
          </button>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          {steps.length > 0 ? (
            <p role="status">
              <span className="font-semibold">
                {doneSteps} of {steps.length}
              </span>{" "}
              steps done
            </p>
          ) : (
            <p>Ingredients only</p>
          )}
          <p className="flex items-center gap-1.5">
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
            className="mt-2 h-1.5 overflow-hidden rounded-pill bg-shell-raised"
          >
            <div
              className="h-full rounded-pill bg-on-shell transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${(doneSteps / steps.length) * 100}%` }}
            />
          </div>
        ) : null}
      </header>

      {signedOut ? (
        <Notice icon={<UserRoundX aria-hidden="true" size="1.125rem" className="flex-none" />}>
          <span className={NOTE}>
            <span>You are signed out. Cooking carries on from the copy on this device.</span>
            <button type="button" onClick={onSignIn} className={NOTE_BUTTON}>
              Sign in again
            </button>
          </span>
        </Notice>
      ) : null}
      {offline ? (
        <Notice icon={<CloudOff aria-hidden="true" size="1.125rem" className="flex-none" />}>
          You are offline. Cooking carries on from the copy on this device.
        </Notice>
      ) : null}
      {wake === "unavailable" && !wakeNoteSeen ? (
        <Notice icon={<SunDim aria-hidden="true" size="1.125rem" className="flex-none" />}>
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

      <div className="flex min-h-0 flex-1">
        {lines.length > 0 ? (
          <aside
            aria-label="Ingredients"
            className={`${
              steps.length > 0
                ? "hidden w-[24rem] flex-none border-r border-rule min-[60rem]:block"
                : "flex-1"
            } overflow-y-auto overscroll-contain`}
          >
            <h2 className="border-b-2 border-red-line px-4 pt-3 pb-2 text-xl font-bold">
              Ingredients
              <span className="ml-2 text-sm font-normal">
                {outLines} of {lines.length} out
              </span>
            </h2>
            {/* On a phone this column is absent and the same list fills the sheet. */}
            {ingredientsOpen ? null : checklist}
          </aside>
        ) : null}

        {steps.length > 0 ? (
          <div ref={stepsRef} className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
            {recipe.stepSections.map((section, index) => {
              const done = section.steps.filter((step) => session.steps.includes(step.id)).length;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: sections have no ID and do not reorder here
                <section key={index} aria-label={section.title ?? "Steps"}>
                  {sectioned ? (
                    <h2 className="flex items-baseline justify-between gap-3 border-b border-rule bg-surface-sunk px-4 py-2 text-lg font-bold">
                      {section.title ?? "Steps"}
                      <span className="text-sm font-normal">
                        {done} of {section.steps.length}
                      </span>
                    </h2>
                  ) : null}
                  <ol>
                    {section.steps.map((step, number) => {
                      const ticked = session.steps.includes(step.id);
                      return (
                        <li key={step.id} data-step={step.id} className="scroll-mt-2">
                          <CheckRow
                            checked={ticked}
                            onChange={() => tick(step.id)}
                            className={ticked ? "" : "py-4"}
                          >
                            {/* A step that is done steps back in size as well as ground; the ones to come stay large. */}
                            <span
                              className={`flex gap-3 ${ticked ? "text-base" : "text-cook leading-snug"}`}
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
              <div className="px-4 py-6">
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
        <div className="flex-none border-t border-rule-strong bg-surface px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] min-[60rem]:hidden">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setIngredientsOpen(true)}
            className="transition-rf flex min-h-touch w-full items-center gap-2 rounded-md border border-rule-strong bg-surface px-4 text-left text-base font-semibold hover:bg-surface-sunk"
          >
            <ListChecks aria-hidden="true" size="1.25rem" className="flex-none" />
            <span className="min-w-0 flex-1">
              Ingredients
              <span className="ml-2 font-normal">
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
    </div>
  );
}
