/**
 * How a day is written, and the one thing that makes it awkward: the viewer's
 * time zone is not known while the page is being rendered on the server.
 *
 * `formatDay` leaves the zone to the runtime, so in the browser it is the
 * reader's own: a scene finished at six in the evening Pacific is that
 * evening's date, not the next morning's in UTC. `formatDayUtc` is fixed, and
 * is what the server renders so that the markup it sends is the same wherever
 * it runs; LocalDate puts the reader's own in its place once mounted.
 */

const dayFormat: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

// Built once each. A DateTimeFormat is expensive to construct and these are
// used per row.
const localDay = new Intl.DateTimeFormat("en-US", dayFormat);
const utcDay = new Intl.DateTimeFormat("en-US", { ...dayFormat, timeZone: "UTC" });

/** "Sep 12, 2026" in whatever zone this is running in. */
export function formatDay(date: Date): string {
  return localDay.format(date);
}

/** "Sep 12, 2026" in UTC, for markup that has to match between server and browser. */
export function formatDayUtc(date: Date): string {
  return utcDay.format(date);
}
