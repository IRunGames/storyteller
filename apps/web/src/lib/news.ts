/** The most announcements the home page shows; older ones simply age out. */
export const NEWS_LIMIT = 6;

/** The projection listNews() returns and the News section renders. */
export type NewsItem = {
  idNews: number;
  title: string;
  body: string;
  /** When the item was posted, which is also what the section sorts by. */
  startsAt: Date;
};

const newsDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Sep 21, 2026". UTC, so the day never shifts with the server's zone. */
export function formatNewsDate(date: Date): string {
  return newsDateFormat.format(date);
}
