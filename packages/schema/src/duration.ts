const ISO_DURATION =
  /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/**
 * Seconds in an ISO 8601 duration such as `PT1H30M`, the form schema.org
 * recipes use. Returns null for anything else, including months and years,
 * which have no fixed length.
 */
export function parseIsoDuration(value: string): number | null {
  const match = ISO_DURATION.exec(value.trim().toUpperCase());
  if (!match) {
    return null;
  }
  const [, days, hours, minutes, seconds] = match;
  // "P" and "PT" match the pattern but state no duration.
  if (days === undefined && hours === undefined && minutes === undefined && seconds === undefined) {
    return null;
  }
  const total =
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  return Math.round(total);
}

/** A duration for people: `45 min`, `1 hr`, `1 hr 30 min`. Seconds are rounded to minutes. */
export function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

const UNIT_SECONDS: Record<string, number> = {
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
};

/** An amount as a card writes it: "45", "1.5", "1/2", "1 1/2". */
const AMOUNT = String.raw`(\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+(?:\.\d+)?)`;
const PART = new RegExp(String.raw`^${AMOUNT}\s*([a-z]+)\.?\s*(?:,|and\b)?\s*`);

function amountOf(text: string): number | null {
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (mixed) {
    return Number(mixed[3]) === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  }
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (fraction) {
    return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  }
  return Number(text);
}

/**
 * Seconds in a time as a recipe states it: "45 minutes", "1 hr 30 min",
 * "1 1/2 hours", "about 20 mins". It reads only a plain time. A range
 * ("20 to 25 minutes"), a time with anything else beside it, and a number
 * with no unit give null: a wrong reading is worse than none.
 */
export function readStatedDuration(value: string): number | null {
  let rest = value
    // "1½" is one and a half, not eleven halves: the half is set apart before it is spelt out.
    .replace(/(\d)(\p{No})/gu, "$1 $2")
    // "½" becomes "1⁄2", and that slash an ordinary one.
    .normalize("NFKD")
    .replace(/⁄/g, "/")
    .toLowerCase()
    .trim()
    .replace(/^(?:about|around|approx\.?|approximately|roughly|~)\s*/, "");
  let total = 0;
  let parts = 0;
  let lastUnit = Number.POSITIVE_INFINITY;
  while (rest !== "") {
    const match = PART.exec(rest);
    const amount = match?.[1] ? amountOf(match[1]) : null;
    const unit = match?.[2] ? UNIT_SECONDS[match[2]] : undefined;
    // Hours before minutes before seconds, each once: "30 min 1 hr" is not a time anyone writes.
    if (!match || amount === null || unit === undefined || unit >= lastUnit) {
      return null;
    }
    total += amount * unit;
    lastUnit = unit;
    parts++;
    rest = rest.slice(match[0].length);
  }
  const seconds = Math.round(total);
  return parts > 0 && seconds > 0 ? seconds : null;
}
