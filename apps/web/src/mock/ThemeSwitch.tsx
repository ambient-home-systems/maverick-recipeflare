import { setThemeChoice, type ThemeChoice, useThemeChoice } from "../theme/theme";

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** For reviewing both themes on one device. The app itself follows the device. */
export function ThemeSwitch() {
  const choice = useThemeChoice();
  return (
    <fieldset className="flex items-center gap-1 rounded-md border border-rule-strong bg-surface p-1">
      <legend className="sr-only">Theme</legend>
      {CHOICES.map(({ value, label }) => (
        <label
          key={value}
          className={`transition-rf grid min-h-touch min-w-16 cursor-pointer place-items-center rounded-sm px-3 text-sm font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus ${
            choice === value ? "bg-primary text-on-primary" : "text-ink hover:bg-surface-sunk"
          }`}
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={choice === value}
            onChange={() => setThemeChoice(value)}
            className="sr-only"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
