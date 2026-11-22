import { Check, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "./Button";
import { FIELD } from "./field";
import { Sheet } from "./Sheet";

export type PickerOption = { id: string; name: string; detail?: string };

const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * A searchable list to choose from: a unit, a food, or a recipe's categories,
 * tags and tools. A name that is not in the list can be created in place.
 *
 * With `multiple` each row switches on and off and the sheet stays open until
 * Done. Otherwise choosing a row closes it.
 */
export function Picker({
  open,
  onClose,
  title,
  searchLabel,
  options,
  selected,
  onPick,
  onCreate,
  createNoun,
  onClear,
  multiple = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The label of the search box: "Find a unit". */
  searchLabel: string;
  options: readonly PickerOption[];
  selected: readonly string[];
  onPick: (id: string) => void;
  /** Creates an entry with this name and chooses it. Without it nothing can be created here. */
  onCreate?: (name: string) => void;
  /** What a created entry is called: "unit", "food", "tag". */
  createNoun?: string;
  /** Offers "None" for a single choice that may be left empty. */
  onClear?: () => void;
  multiple?: boolean;
}) {
  const [find, setFind] = useState("");
  const findId = useId();
  const needle = fold(find);
  const shown = needle ? options.filter((option) => fold(option.name).includes(needle)) : options;
  const exact = options.some((option) => fold(option.name) === needle);
  const close = () => {
    setFind("");
    onClose();
  };
  const row =
    "transition-rf flex min-h-touch w-full items-center gap-3 px-4 py-2 text-left text-base hover:bg-surface-sunk";

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      tall
      footer={multiple ? <Button onClick={close}>Done</Button> : undefined}
    >
      <div className="border-b border-rule px-4 py-3">
        <label htmlFor={findId} className="mb-1 block text-sm font-semibold">
          {searchLabel}
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
      </div>
      <ul aria-label={title}>
        {onClear && !needle ? (
          <li className="border-b border-rule">
            <button
              type="button"
              className={row}
              onClick={() => {
                onClear();
                close();
              }}
            >
              <span className="w-5 flex-none">
                {selected.length === 0 ? <Check aria-hidden="true" size="1.25rem" /> : null}
              </span>
              None
            </button>
          </li>
        ) : null}
        {shown.map((option) => {
          const on = selected.includes(option.id);
          return (
            <li key={option.id} className="border-b border-rule">
              <button
                type="button"
                aria-pressed={on}
                className={`${row} ${on ? "font-semibold" : ""}`}
                onClick={() => {
                  onPick(option.id);
                  if (!multiple) {
                    close();
                  }
                }}
              >
                <span className="w-5 flex-none">
                  {on ? <Check aria-hidden="true" size="1.25rem" strokeWidth={2.5} /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block">{option.name}</span>
                  {option.detail ? (
                    <span className="block text-sm font-normal">{option.detail}</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
        {onCreate && needle && !exact ? (
          <li className="border-b border-rule">
            <button
              type="button"
              className={`${row} font-semibold`}
              onClick={() => {
                onCreate(find.trim().replace(/\s+/g, " "));
                if (multiple) {
                  setFind("");
                } else {
                  close();
                }
              }}
            >
              <Plus aria-hidden="true" size="1.25rem" className="flex-none" />
              <span>
                Create {createNoun ? `the ${createNoun} ` : ""}“{find.trim()}”
              </span>
            </button>
          </li>
        ) : null}
      </ul>
      {shown.length === 0 && !(onCreate && needle) ? (
        <p className="px-4 py-4 text-sm">Nothing matches “{find.trim()}”.</p>
      ) : null}
    </Sheet>
  );
}
