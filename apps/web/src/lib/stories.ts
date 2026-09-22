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
