import {
  formatIngredient,
  formatQuantity,
  type Ingredient,
  ingredientAmount,
  isScalable,
  type Recipe,
} from "@recipeflare/schema";
import { useEffect, useState } from "react";
import { Mark, TextField } from "../../ui/Field";
import { readQuantity } from "../editor/editorState";
import { notScaledLabel, SCALE_DONE, SCALES } from "../recipe/recipeFacts";
import { ScaleControl } from "../recipe/ScaleControl";
import { CheckRow } from "./CheckRow";
import type { CookSession } from "./cookSession";

/** "Doubled", "Halved", or for a scale that has no name of its own, "Scaled to 1½ times". */
function scaleDone(scale: number): string {
  const named = SCALES.find((value) => value === scale);
  return named ? SCALE_DONE[named] : `Scaled to ${formatQuantity(scale)} times`;
}

/** An ingredient at the scale it is being cooked at, with its amount set heavier. */
export function IngredientText({ item, scale }: { item: Ingredient; scale: number }) {
  const text = formatIngredient(item, { scale });
  const amount = ingredientAmount(item, { scale });
  return (
    <>
      {amount ? <span className="font-semibold">{amount}</span> : null}
      {text.slice(amount.length)}
    </>
  );
}

/**
 * The ingredients to tick off as they are got out, with the scale they are
 * cooked at. On a phone this fills a sheet; on a tablet on its side it is the
 * column beside the steps.
 */
export function IngredientChecklist({
  recipe,
  session,
  onToggle,
  onScale,
}: {
  recipe: Recipe;
  session: CookSession;
  onToggle: (ingredientId: string) => void;
  onScale: (scale: number) => void;
}) {
  const { scale } = session;
  const servings = recipe.servings;
  const [serves, setServes] = useState(servings === null ? "" : formatQuantity(servings * scale));
  // The box follows the switch; while it is being typed in it keeps what was typed.
  useEffect(() => {
    if (servings !== null) {
      setServes((now) => {
        const read = readQuantity(now);
        return read && Math.abs(read.quantity / servings - scale) < 0.001
          ? now
          : formatQuantity(servings * scale);
      });
    }
  }, [scale, servings]);

  const servesRead = serves.trim() === "" ? null : readQuantity(serves);
  const servesBad = serves.trim() !== "" && servesRead?.rest.trim() !== "";
  const lines = recipe.ingredientSections.flatMap((section) => section.items);
  const unscaled = lines.filter((item) => !isScalable(item)).length;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-rule px-4 py-3">
        <ScaleControl scale={scale} onScale={onScale} />
        {servings !== null ? (
          <TextField
            className="w-[6.5rem]"
            label="Serves"
            inputMode="decimal"
            value={serves}
            invalid={servesBad}
            onChange={(text) => {
              setServes(text);
              const read = text.trim() === "" ? null : readQuantity(text);
              if (read && read.rest.trim() === "") {
                onScale(read.quantity / servings);
              }
            }}
          />
        ) : null}
      </div>
      {scale !== 1 ? (
        <p className="border-b border-rule px-4 py-2 text-sm" role="status">
          <span className="font-semibold">{scaleDone(scale)}.</span>{" "}
          {unscaled > 0
            ? `${unscaled} ${unscaled === 1 ? "line is" : "lines are"} shown as written and ${unscaled === 1 ? "was" : "were"} not changed. `
            : ""}
          Amounts written in the steps are not changed.
        </p>
      ) : null}

      {recipe.ingredientSections.map((section, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: sections have no ID and do not reorder here
        <div key={index}>
          {section.title ? (
            <h3 className="border-b border-rule bg-surface-sunk px-4 py-2 text-base font-bold">
              {section.title}
            </h3>
          ) : null}
          <ul>
            {section.items.map((item) => {
              const done = session.ingredients.includes(item.id);
              return (
                <li key={item.id}>
                  <CheckRow checked={done} onChange={() => onToggle(item.id)}>
                    <span className="flex flex-wrap items-baseline gap-x-2 text-lg">
                      <span>
                        <IngredientText item={item} scale={scale} />
                      </span>
                      {scale !== 1 && !isScalable(item) ? (
                        <Mark large>{notScaledLabel(scale)}</Mark>
                      ) : null}
                    </span>
                  </CheckRow>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
