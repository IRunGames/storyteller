import type { StorySessionStatus } from "@/db/schema";

/** Cards per fetch in every Stories section. */
export const PAGE_SIZE = 10;

/** Summaries longer than this get a "more" link that opens the full text. */
export const SUMMARY_PREVIEW_CHARS = 200;

/** The projection every list action returns and every card renders. */
export type StoryCardData = {
  idStory: number;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  lastPlayed: Date;
  systemName: string | null;
  systemVersion: string | null;
  variant: string | null;
  isFavorite: boolean;
  /** The caller created this story; only they get the Play button. */
  isOwner: boolean;
  /** False for a story the storyteller has retired; hidden from My Stories by default. */
  isActive: boolean;
  /**
   * How the storyteller is known: their nickname, else their name. Null when
   * the story has no recorded creator. The card shows it only when the viewer
   * is not the storyteller; their own name on their own story says nothing.
   */
  storytellerName: string | null;
  /**
   * The story's current session is open, so play is under way at its table.
   * A non-owner gets a Join button in the Play button's place.
   */
  hasOpenSession: boolean;
  /** How many players sit at the table; the storyteller is not one of them. */
  playerCount: number;
};

/** Sessions per fetch in a story's Recent sessions section. */
export const SESSIONS_PAGE_SIZE = 5;

/** One row of a story's Recent sessions section. */
export type StorySession = {
  idStorySession: number;
  status: StorySessionStatus;
  /** When the session was created, which is when it was opened. */
  startedAt: Date;
  /**
   * Whole minutes at the table, generated in Postgres from open_at to done_at
   * less the time spent suspended; null until the session is done.
   */
  length: number | null;
};

/** One row of a story's Players section. */
export type StoryPlayer = {
  idUser: string;
  /** Their nickname, else their name: the same preference the cards use. */
  name: string;
  image: string | null;
};

/** Matches per search in the Invite Players popover. */
export const PLAYER_SEARCH_LIMIT = 10;

/** How long the popover waits after a keystroke before it searches, in ms. */
export const PLAYER_SEARCH_DELAY_MS = 250;

/**
 * One match in the Invite Players popover. The email is shown under the name
 * so two people known by the same nickname can be told apart, and so a
 * storyteller who typed an address can see it was the one they meant.
 */
export type PlayerMatch = StoryPlayer & {
  email: string;
};

/**
 * Escapes only what can terminate or confuse a CSS `url("…")` string.
 *
 * React writes the cover URL into a server-rendered `style` attribute, and the
 * HTML parser decodes that attribute before the CSS parser ever sees it — so a
 * stored URL containing a raw `"` would close the string and inject arbitrary
 * declarations into every viewer's page. A backslash escapes the next
 * character, and a newline, carriage return or form feed terminates the string
 * outright — CSS Syntax Level 3 preprocessing folds U+000C FORM FEED into a
 * newline before tokenizing, so it breaks out exactly like `\n` does, and
 * nothing upstream strips it (the URL parser only removes tab, LF and CR).
 *
 * Deliberately NOT encodeURI: that also rewrites `%` to `%25`, which breaks
 * every legitimate URL that already carries percent-escapes (`%20` for spaces,
 * unicode file names, encoded query strings) — common enough on image hosts
 * that it would be a real regression. story-schemas.ts pins the protocol to
 * http(s) as the other half of this fix.
 */
export function cssUrlValue(url: string): string {
  return url.replace(/["\\\n\r\f]/g, (char) => encodeURIComponent(char));
}

/** "Cypher System · Numenera (Revised)", or null when the story has no system. */
export function systemLabel(
  story: Pick<StoryCardData, "systemName" | "systemVersion" | "variant">,
): string | null {
  if (!story.systemName) return null;
  let label = story.systemName;
  if (story.variant) label += ` · ${story.variant}`;
  if (story.systemVersion) label += ` (${story.systemVersion})`;
  return label;
}

const lastPlayedFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatLastPlayed(date: Date): string {
  return lastPlayedFormat.format(date);
}

const hoursFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** "2.5 hours", "1 hour": a session's length in minutes as hours, to one decimal. */
export function formatSessionLength(minutes: number): string {
  const hours = hoursFormat.format(minutes / 60);
  return `${hours} ${hours === "1" ? "hour" : "hours"}`;
}

/**
 * What a session with no length says in its place. A done session always has
 * one, so its entry is only there to keep the lookup total.
 */
export const SESSION_STATUS_TEXT: Record<StorySessionStatus, string> = {
  open: "In progress",
  suspended: "Suspended",
  resumed: "In progress",
  done: "Done",
};

/** Every titled block a stories board can show. */
export type SectionKey = "favorites" | "mine" | "open";
export const SECTION_TITLES: Record<SectionKey, string> = {
  favorites: "Favorites",
  mine: "My Stories",
  open: "Looking for Players",
};
export const SECTION_EMPTY_TEXT: Record<SectionKey, string> = {
  favorites: "Nothing here yet.",
  mine: "Nothing here yet.",
  open: "No stories are looking for players right now.",
};

/**
 * Which blocks each page shows, in order. The Stories page is the caller's
 * own shelf; the stories other storytellers have opened to players are a
 * page of their own, Find a Story, under Stories in the menu.
 */
export const STORIES_SECTIONS = ["favorites", "mine"] as const;
export const FIND_SECTIONS = ["open"] as const;
