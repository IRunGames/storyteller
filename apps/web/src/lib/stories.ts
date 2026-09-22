/** Cards per fetch in every Stories section. */
export const PAGE_SIZE = 10;

/** Summaries longer than this get a "more" link that opens the full text. */
export const SUMMARY_PREVIEW_CHARS = 200;

/** The projection every list action returns and every card renders. */
export type StoryCardData = {
  idGame: number;
  gameTitle: string;
  summary: string | null;
  imageUrl: string | null;
  lastPlayed: Date;
  systemName: string | null;
  systemVersion: string | null;
  variant: string | null;
  isFavorite: boolean;
  /** The caller created this game; only they get the Play button. */
  isOwner: boolean;
  /** False for a story the storyteller has retired; hidden from My Stories by default. */
  isActive: boolean;
  /**
   * How the storyteller is known: their nickname, else their name. Null when
   * the game has no recorded creator. The card shows it only when the viewer
   * is not the storyteller; their own name on their own story says nothing.
   */
  storytellerName: string | null;
};

/** One row of a story's Players section. */
export type StoryPlayer = {
  idUser: string;
  /** Their nickname, else their name: the same preference the cards use. */
  name: string;
  image: string | null;
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

/** "Cypher System · Numenera (Revised)", or null when the game has no system. */
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

/** The three blocks of the Stories page, in the order they render. */
export type SectionKey = "favorites" | "mine" | "open";
export const SECTION_ORDER: readonly SectionKey[] = ["favorites", "mine", "open"];
export const SECTION_TITLES: Record<SectionKey, string> = {
  favorites: "Favorite Stories",
  mine: "My Stories",
  open: "Looking for Players",
};
