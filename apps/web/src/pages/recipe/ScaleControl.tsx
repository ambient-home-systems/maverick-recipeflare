import { SCALE_LABELS, SCALE_NAMES, SCALES, type Scale } from "./recipeFacts";

/**
 * Half, as written, double or triple. A group of radio buttons drawn as one
 * segmented switch, so arrow keys move between the amounts.
 */
export function ScaleControl({
  scale,
  onScale,
}: {
  scale: Scale;
  onScale: (scale: Scale) => void;
}) {
  return (
    <fieldset className="flex max-w-full flex-wrap items-center gap-1 rounded-md border border-rule-strong bg-surface p-1">
      <legend className="sr-only">Scale the ingredients</legend>
      {SCALES.map((value) => (
        <label
          key={value}
          className={`transition-rf grid min-h-touch min-w-touch cursor-pointer place-items-center rounded-sm px-2 text-base font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus ${
            scale === value ? "bg-primary text-on-primary" : "text-ink hover:bg-surface-sunk"
          }`}
        >
          <input
            type="radio"
            name="scale"
            value={value}
            checked={scale === value}
            onChange={() => onScale(value)}
            className="sr-only"
          />
          <span aria-hidden="true">{SCALE_LABELS[value]}</span>
          <span className="sr-only">{SCALE_NAMES[value]}</span>
        </label>
      ))}
    </fieldset>
  );
}
