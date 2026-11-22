import { Page } from "../ui/Page";

type Swatch = { token: string; name: string; job: string; on?: string };

const GROUPS: { title: string; swatches: Swatch[] }[] = [
  {
    title: "Ink and surfaces",
    swatches: [
      { token: "--rf-ink", name: "Ink", job: "All text", on: "--rf-surface" },
      { token: "--rf-surface", name: "Card white", job: "Working surface", on: "--rf-ink" },
      {
        token: "--rf-surface-sunk",
        name: "Card, pressed",
        job: "Hover and current",
        on: "--rf-ink",
      },
      { token: "--rf-ground", name: "Ground", job: "Behind the cards", on: "--rf-ink" },
      { token: "--rf-shell", name: "Ink navy", job: "Header and rail", on: "--rf-on-shell" },
      {
        token: "--rf-shell-raised",
        name: "Ink navy, raised",
        job: "Current item on the rail",
        on: "--rf-on-shell",
      },
      { token: "--rf-primary", name: "Primary", job: "Save, cook, confirm", on: "--rf-on-primary" },
    ],
  },
  {
    title: "Rules",
    swatches: [
      { token: "--rf-rule", name: "Ruling blue", job: "Hairlines between rows", on: "--rf-ink" },
      {
        token: "--rf-rule-strong",
        name: "Ruling blue, strong",
        job: "Control outlines",
        on: "--rf-surface",
      },
      {
        token: "--rf-red-line",
        name: "Rule red",
        job: "The line a title sits on",
        on: "--rf-surface",
      },
      { token: "--rf-red-fill", name: "Rule red, filled", job: "Add a recipe", on: "--rf-on-red" },
    ],
  },
  {
    title: "Divider stock",
    swatches: [
      { token: "--rf-stock-buff", name: "Buff", job: "First category", on: "--rf-on-stock" },
      { token: "--rf-stock-salmon", name: "Salmon", job: "Second category", on: "--rf-on-stock" },
      { token: "--rf-stock-sky", name: "Sky", job: "Third category", on: "--rf-on-stock" },
      { token: "--rf-stock-mint", name: "Mint", job: "Fourth category", on: "--rf-on-stock" },
      { token: "--rf-stock-lilac", name: "Lilac", job: "Fifth category", on: "--rf-on-stock" },
      { token: "--rf-stock-plain", name: "Plain", job: "No category", on: "--rf-ink" },
    ],
  },
  {
    title: "States",
    swatches: [
      { token: "--rf-notice", name: "Notice", job: "Offline, and problems", on: "--rf-on-notice" },
      { token: "--rf-focus", name: "Focus", job: "Keyboard focus ring", on: "--rf-surface" },
    ],
  },
];

const TYPE = [
  {
    token: "--rf-text-2xl",
    name: "Page title, tablet",
    px: 28,
    weight: 700,
    sample: "Roast Chicken with Lemon and Thyme",
  },
  {
    token: "--rf-text-xl",
    name: "Page title",
    px: 23,
    weight: 700,
    sample: "Sunday Beef and Bean Chili",
  },
  {
    token: "--rf-text-cook",
    name: "Cook mode step",
    px: 22,
    weight: 400,
    sample: "Whisk in the stock, scraping up the browned bits.",
  },
  {
    token: "--rf-text-lg",
    name: "Row title",
    px: 19,
    weight: 600,
    sample: "Cardamom Sugar Cookies",
  },
  {
    token: "--rf-text-base",
    name: "Body",
    px: 17,
    weight: 400,
    sample: "2¼ cups all-purpose flour, sifted",
  },
  {
    token: "--rf-text-sm",
    name: "Second line",
    px: 15,
    weight: 400,
    sample: "36 cookies · Dessert · From Aunt June",
  },
  { token: "--rf-text-xs", name: "Navigation label", px: 13, weight: 600, sample: "Recipes" },
];

const SPACE = [1, 2, 3, 4, 5, 6, 8, 10, 12];

/** The design tokens, drawn from the same variables every screen uses. */
export function MockTokens() {
  return (
    <>
      {GROUPS.map((group) => (
        <Page key={group.title} title={group.title}>
          <ul className="grid grid-cols-2 md:grid-cols-3">
            {group.swatches.map((swatch) => (
              <li key={swatch.token} className="border-b border-r border-rule p-3">
                <div
                  className="grid h-14 place-items-center rounded-sm border border-rule text-sm font-semibold"
                  style={{
                    background: `var(${swatch.token})`,
                    color: swatch.on ? `var(${swatch.on})` : undefined,
                  }}
                >
                  Aa 1½
                </div>
                <span className="mt-2 block font-semibold">{swatch.name}</span>
                <span className="block text-sm">{swatch.job}</span>
              </li>
            ))}
          </ul>
        </Page>
      ))}

      <Page title="Type" aside="Atkinson Hyperlegible Next">
        <ul>
          {TYPE.map((step) => (
            <li key={step.token} className="border-b border-rule px-4 py-3 last:border-b-0">
              <span className="block text-sm">
                {step.name} · {step.px} px
              </span>
              <span
                className="block leading-snug"
                style={{ fontSize: `var(${step.token})`, fontWeight: step.weight }}
              >
                {step.sample}
              </span>
            </li>
          ))}
        </ul>
      </Page>

      <Page title="Space and radius" aside="4 px steps">
        <ul className="px-4 py-3">
          {SPACE.map((step) => (
            <li key={step} className="flex items-center gap-3 py-1">
              <span className="w-12 text-sm">{step * 4} px</span>
              <span className="h-3 bg-rule-strong" style={{ width: `var(--rf-space-${step})` }} />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-4 border-t border-rule px-4 py-4">
          <span className="grid size-16 place-items-center rounded-sm bg-stock-plain text-sm">
            6 px
          </span>
          <span className="grid size-16 place-items-center rounded-md bg-stock-plain text-sm">
            10 px
          </span>
          <span className="grid h-11 place-items-center rounded-t-md bg-stock-plain px-5 text-sm">
            Tab
          </span>
          <span className="grid min-h-touch min-w-touch place-items-center border border-dashed border-rule-strong px-2 text-sm">
            44 px touch
          </span>
        </div>
      </Page>
    </>
  );
}
