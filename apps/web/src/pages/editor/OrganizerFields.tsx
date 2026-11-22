import type { Organizer, OrganizerKind } from "@recipeflare/schema";
import { Plus } from "lucide-react";
import { useState } from "react";
import { RemovableChip } from "../../ui/Chip";
import { FieldProblem } from "../../ui/Field";
import { Picker } from "../../ui/Picker";
import type { Stock } from "../../ui/stock";
import { SMALL_BUTTON } from "./rowParts";

const KINDS: { kind: OrganizerKind; title: string; noun: string; choose: string; find: string }[] =
  [
    {
      kind: "category",
      title: "Categories",
      noun: "category",
      choose: "Choose categories",
      find: "Find a category",
    },
    { kind: "tag", title: "Tags", noun: "tag", choose: "Choose tags", find: "Find a tag" },
    { kind: "tool", title: "Tools", noun: "tool", choose: "Choose tools", find: "Find a tool" },
  ];

type Ids = Record<OrganizerKind, string[]>;

/**
 * The recipe's categories, tags and tools. Each is chosen from a searchable
 * list in which a new name can be created. A category's chip wears its divider
 * colour.
 */
export function OrganizerFields({
  organizers,
  ids,
  onChange,
  stockFor,
  onCreate,
  suggestions,
  error,
}: {
  organizers: Organizer[];
  ids: Ids;
  onChange: (kind: OrganizerKind, ids: string[]) => void;
  stockFor: (categoryId: string) => Stock;
  /** Creates an organizer and returns its ID. */
  onCreate: (kind: OrganizerKind, name: string) => string;
  /** Names found by an import that the household does not have. Offered, never chosen for the cook. */
  suggestions?: Partial<Record<OrganizerKind, string[]>>;
  error?: string;
}) {
  const [picking, setPicking] = useState<OrganizerKind | null>(null);
  const toggle = (kind: OrganizerKind, id: string) =>
    onChange(
      kind,
      ids[kind].includes(id) ? ids[kind].filter((other) => other !== id) : [...ids[kind], id],
    );

  return (
    <div className="grid gap-4 px-4 py-4">
      {error ? <FieldProblem>{error}</FieldProblem> : null}
      {KINDS.map(({ kind, title, noun, choose, find }) => {
        const all = organizers.filter((organizer) => organizer.kind === kind);
        const chosen = ids[kind].flatMap(
          (id) => all.find((organizer) => organizer.id === id) ?? [],
        );
        const offered = (suggestions?.[kind] ?? []).filter(
          (name) => !all.some((organizer) => organizer.name.toLowerCase() === name.toLowerCase()),
        );
        return (
          <div key={kind}>
            <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
            <ul className="flex flex-wrap items-center gap-2" aria-label={title}>
              {chosen.map((organizer) => (
                <li key={organizer.id}>
                  <RemovableChip
                    label={organizer.name}
                    removeLabel={`Remove the ${noun} ${organizer.name}`}
                    stock={kind === "category" ? stockFor(organizer.id) : undefined}
                    onRemove={() => toggle(kind, organizer.id)}
                  />
                </li>
              ))}
              <li>
                <button type="button" className={SMALL_BUTTON} onClick={() => setPicking(kind)}>
                  <Plus aria-hidden="true" size="1.125rem" />
                  {choose}
                </button>
              </li>
            </ul>
            {offered.length > 0 ? (
              <div className="mt-2">
                <p className="text-sm">
                  The page also names {offered.length === 1 ? "this one" : "these"}, which you do
                  not have. Press one to create it and add it.
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {offered.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        className={SMALL_BUTTON}
                        onClick={() => onChange(kind, [...ids[kind], onCreate(kind, name)])}
                      >
                        <Plus aria-hidden="true" size="1.125rem" />
                        {name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Picker
              open={picking === kind}
              onClose={() => setPicking(null)}
              title={title}
              searchLabel={find}
              options={all.map((organizer) => ({ id: organizer.id, name: organizer.name }))}
              selected={ids[kind]}
              onPick={(id) => toggle(kind, id)}
              onCreate={(name) => onChange(kind, [...ids[kind], onCreate(kind, name)])}
              createNoun={noun}
              multiple
            />
          </div>
        );
      })}
    </div>
  );
}
