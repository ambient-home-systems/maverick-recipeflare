/**
 * Recipes hold ingredients and steps in titled sections. The database holds
 * them as flat rows, each carrying its section's title and its position in the
 * whole recipe. These functions convert between the two forms.
 *
 * Rows that follow each other with the same `section` value form one section.
 * That is why the recipe schema forbids neighbouring sections with equal titles.
 */

export type SectionRow<T> = T & { section: string | null; position: number };

function flatten<T>(sections: { title: string | null; rows: readonly T[] }[]): SectionRow<T>[] {
  const flat: SectionRow<T>[] = [];
  for (const section of sections) {
    for (const row of section.rows) {
      flat.push({ ...row, section: section.title, position: flat.length });
    }
  }
  return flat;
}

function group<T extends { section: string | null; position: number }>(
  rows: readonly T[],
): { title: string | null; rows: Omit<T, "section" | "position">[] }[] {
  const sections: { title: string | null; rows: Omit<T, "section" | "position">[] }[] = [];
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  for (const { section, position: _position, ...rest } of ordered) {
    const last = sections[sections.length - 1];
    if (last && last.title === section) {
      last.rows.push(rest);
    } else {
      sections.push({ title: section, rows: [rest] });
    }
  }
  return sections;
}

export function flattenIngredientSections<T>(
  sections: readonly { title: string | null; items: readonly T[] }[],
): SectionRow<T>[] {
  return flatten(sections.map((s) => ({ title: s.title, rows: s.items })));
}

export function groupIngredientRows<T extends { section: string | null; position: number }>(
  rows: readonly T[],
): { title: string | null; items: Omit<T, "section" | "position">[] }[] {
  return group(rows).map((s) => ({ title: s.title, items: s.rows }));
}

export function flattenStepSections<T>(
  sections: readonly { title: string | null; steps: readonly T[] }[],
): SectionRow<T>[] {
  return flatten(sections.map((s) => ({ title: s.title, rows: s.steps })));
}

export function groupStepRows<T extends { section: string | null; position: number }>(
  rows: readonly T[],
): { title: string | null; steps: Omit<T, "section" | "position">[] }[] {
  return group(rows).map((s) => ({ title: s.title, steps: s.rows }));
}
