import { useId, useState } from "react";
import { Button } from "../../ui/Button";
import { ToggleChip } from "../../ui/Chip";
import { FIELD } from "../../ui/field";
import { Sheet } from "../../ui/Sheet";
import { filterCount, type ListState } from "./listState";

/** Something a recipe can be filtered by. `key` is what goes in the page address. */
export type ListOption = { key: string; name: string };

/** How many foods are offered before the cook types to find another. */
const FOODS_OFFERED = 12;

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const toggled = (keys: string[], key: string) =>
  keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];

function Group({
  legend,
  options,
  selected,
  onToggle,
  children,
}: {
  legend: string;
  options: ListOption[];
  selected: string[];
  onToggle: (key: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <fieldset className="border-b border-rule px-4 pt-3 pb-4 last:border-b-0">
      <legend className="float-left mb-2 w-full text-base font-bold">{legend}</legend>
      {children}
      <div className="clear-both flex flex-wrap gap-2">
        {options.map((option) => (
          <ToggleChip
            key={option.key}
            label={option.name}
            pressed={selected.includes(option.key)}
            onToggle={() => onToggle(option.key)}
          />
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Tags, tools and foods to narrow the list by. Each choice takes effect at
 * once, so the button at the bottom can say how many recipes are left.
 */
export function FilterSheet({
  open,
  onClose,
  state,
  onChange,
  tags,
  tools,
  foods,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  state: ListState;
  onChange: (next: ListState) => void;
  tags: ListOption[];
  tools: ListOption[];
  /** Most used first: only the first few are offered until the cook types. */
  foods: ListOption[];
  /** How many recipes match as things stand. Null while that is not known. */
  resultCount: number | null;
}) {
  const [find, setFind] = useState("");
  const findId = useId();
  const needle = fold(find.trim());
  const offered = needle
    ? foods.filter((food) => fold(food.name).includes(needle))
    : foods.filter((food, index) => index < FOODS_OFFERED || state.foods.includes(food.key));
  const count = filterCount(state);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter recipes"
      footer={
        <>
          <Button
            variant="quiet"
            disabled={count === 0}
            onClick={() => onChange({ ...state, tags: [], tools: [], foods: [] })}
          >
            Clear filters
          </Button>
          <Button onClick={onClose}>
            {resultCount === null
              ? "Show recipes"
              : `Show ${resultCount} ${resultCount === 1 ? "recipe" : "recipes"}`}
          </Button>
        </>
      }
    >
      <p className="border-b border-rule px-4 py-3 text-sm">
        A recipe must match everything you choose, so each choice narrows the list.
      </p>
      {tags.length > 0 ? (
        <Group
          legend="Tags"
          options={tags}
          selected={state.tags}
          onToggle={(key) => onChange({ ...state, tags: toggled(state.tags, key) })}
        />
      ) : null}
      {tools.length > 0 ? (
        <Group
          legend="Tools"
          options={tools}
          selected={state.tools}
          onToggle={(key) => onChange({ ...state, tools: toggled(state.tools, key) })}
        />
      ) : null}
      {foods.length > 0 ? (
        <Group
          legend="Foods"
          options={offered}
          selected={state.foods}
          onToggle={(key) => onChange({ ...state, foods: toggled(state.foods, key) })}
        >
          {foods.length > FOODS_OFFERED ? (
            <div className="clear-both mb-3">
              <label htmlFor={findId} className="mb-1 block text-sm">
                Find a food
              </label>
              <input
                id={findId}
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                value={find}
                onChange={(event) => setFind(event.target.value)}
                className={FIELD}
              />
              <p className="mt-2 text-sm" role="status">
                {needle
                  ? `${offered.length} of ${foods.length} foods match.`
                  : `The ${FOODS_OFFERED} most used of ${foods.length} foods. Type to find another.`}
              </p>
            </div>
          ) : null}
        </Group>
      ) : null}
    </Sheet>
  );
}
