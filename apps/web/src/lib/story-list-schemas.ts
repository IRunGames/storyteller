import { z } from "zod";

/**
 * The columns the Stories page's list sorts by, as sa_listMyStoryPage names
 * them, and "recent", the order the page opens in: the stories touched last
 * first, which no column shows.
 */
export const STORY_SORT_KEYS = [
  "recent",
  "title",
  "status",
  "favorite",
  "players",
  "sessions",
  "played",
] as const;
export type StorySortKey = (typeof STORY_SORT_KEYS)[number];

/** How many stories one fetch of the Stories page brings, cards or list. */
export const MY_STORIES_PAGE_SIZE = 24;

/**
 * What the Stories page asks sa_listMyStoryPage for: a search over the
 * stories' search_text, whether retired stories are shown, the sort, and
 * how many rows it has already, so More brings the next ones in the same
 * order. The page sends the whole thing each time, so the server holds no
 * state for the list.
 */
export const myStoryListQuerySchema = z.object({
  search: z.string().trim().max(200),
  showInactive: z.boolean(),
  sortBy: z.enum(STORY_SORT_KEYS),
  sortDesc: z.boolean(),
  offset: z.number().int().min(0).max(100_000),
});
export type MyStoryListQuery = z.infer<typeof myStoryListQuerySchema>;

/** The query the page opens with: every active story of the user's, touched last first. */
export const DEFAULT_MY_STORY_LIST_QUERY: MyStoryListQuery = {
  search: "",
  showInactive: false,
  sortBy: "recent",
  sortDesc: true,
  offset: 0,
};
