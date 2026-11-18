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
