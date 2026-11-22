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
