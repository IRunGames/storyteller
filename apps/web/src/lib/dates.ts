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

// A day and the time of day on it, for a moment worth placing within its
// session, such as when an element was brought into a scene.
const dateTimeFormat: Intl.DateTimeFormatOptions = {
  ...dayFormat,
  hour: "numeric",
  minute: "2-digit",
};
const localDateTime = new Intl.DateTimeFormat("en-US", dateTimeFormat);
const utcDateTime = new Intl.DateTimeFormat("en-US", {
  ...dateTimeFormat,
  timeZone: "UTC",
  timeZoneName: "short",
});

/** "Oct 9, 2026, 3:42 PM" in whatever zone this is running in. */
export function formatDateTime(date: Date): string {
  return localDateTime.format(date);
}

/**
 * "Oct 9, 2026, 3:42 PM UTC", for markup that has to match between server
 * and browser. Says UTC, since a time of day read in the wrong zone is
 * wrong where a day mostly is not.
 */
export function formatDateTimeUtc(date: Date): string {
  return utcDateTime.format(date);
}
