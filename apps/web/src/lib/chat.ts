import type { PublicChat } from "./realtime/chat-events";

/** One line in the table chat: something said, a roll, or a line the table put there itself. */
export type ChatEntry = {
  /** The React key: "chat-4" for a saved line, anything unique for the sample. */
  id: string;
  /** The chats row, or null for a sample line, which was never saved. */
  idChat: number | null;
  /** The sender's user id, so the viewer's own lines can be told apart. */
  idUser: string | null;
  /** Who sent it, as the chat shows them; the palette is keyed off this. */
  from: string;
  /** The sender's profile colour, else null for the palette keyed off their name. */
  color: string | null;
  /** The sender's profile picture, else null for their initials. */
  picture: string | null;
  /** When it was said, ISO; the label is worked out as it is shown (chatTime). */
  createdAt: string;
  /**
   * A fixed label in place of chatTime's, for the sample: it is drawn on the
   * server, whose clock and time zone are not the browser's, so a label
   * worked out there would not match the one the browser works out.
   */
  time?: string;
  isEdited: boolean;
} & (
  | { kind: "text"; text: string }
  /** The divider the table puts in when the storyteller moves to another scene. */
  | { kind: "scene"; text: string }
  /** Any other line the table puts in itself: a card untapped. */
  | { kind: "system"; text: string }
  | {
      kind: "roll";
      /** Each die as it landed. */
      dice: number[];
      /** What was added for an ability or skill, and its name. */
      modifier: { value: number; label: string } | null;
      total: number;
      /** "2d6". */
      formula: string;
      /** What the roll was for: "Spot the box". */
      label: string;
      outcome: "SUCCESS" | "FAILURE";
    }
);

const SCENE_ENTRY_PREFIX = "Entering ";

/** The line the table puts in when the storyteller moves it to a scene. */
export function sceneEntryText(sceneTitle: string): string {
  return `${SCENE_ENTRY_PREFIX}${sceneTitle}`;
}

/**
 * Whether a line is the divider for moving to a scene. Read from the text,
 * since the table has no column for what kind of system line a row is: the
 * user asked for is_system alone, and the only other system line (a card
 * untapped) starts with the sender's name, never with "Entering ".
 */
export function isSceneEntry(chat: Pick<PublicChat, "isSystem" | "text">): boolean {
  return chat.isSystem && chat.text.startsWith(SCENE_ENTRY_PREFIX);
}

/** A line as it came from the database or the topic, as the chat holds it. */
export function toChatEntry(chat: PublicChat): ChatEntry {
  const kind = !chat.isSystem ? "text" : isSceneEntry(chat) ? "scene" : "system";
  return {
    id: `chat-${chat.idChat}`,
    idChat: chat.idChat,
    idUser: chat.idUser,
    from: chat.from,
    color: chat.color,
    picture: chat.picture,
    createdAt: chat.createdAt,
    isEdited: chat.isEdited,
    kind,
    text: chat.text,
  };
}

const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
// numeric "always", so yesterday reads "1 day ago" like every other day
// rather than "yesterday".
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });

const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * The time a line shows: the clock time for a line said today, and how long
 * ago for one said before, "3 days ago", "2 weeks ago", "4 months ago".
 * Counted in calendar days from local midnight, so a line from 11 PM last
 * night is a day ago at 1 AM; rounded, since a day that changes the clocks
 * is not 24 hours long.
 */
export function chatTime(createdAt: string, now: Date = new Date()): string {
  const then = new Date(createdAt);
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS);
  if (days <= 0) return clockFormat.format(then);
  if (days < 7) return relativeFormat.format(-days, "day");
  if (days < 30) return relativeFormat.format(-Math.floor(days / 7), "week");
  if (days < 365) return relativeFormat.format(-Math.max(1, Math.floor(days / 30)), "month");
  return relativeFormat.format(-Math.floor(days / 365), "year");
}

/**
 * Lines merged by idChat, a line that comes again replacing the one held,
 * in the order they were said: createdAt, then idChat for lines that share
 * a timestamp.
 */
export function mergeChatEntries(held: ChatEntry[], incoming: ChatEntry[]): ChatEntry[] {
  const byId = new Map(held.map((entry) => [entry.id, entry]));
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || (a.idChat ?? 0) - (b.idChat ?? 0),
  );
}

// The palettes a sender's name and avatar can take. Chakra palettes rather
// than theme tokens: each needs a solid shade for the avatar and a readable
// one for the name, which colorPalette.solid and colorPalette.fg give in
// every theme.
const PALETTES = ["orange", "cyan", "purple", "teal", "pink", "blue", "yellow", "green"];

/**
 * The palette for a sender, the same every time for the same name, so a
 * person keeps their colour through the conversation. A small string hash;
 * it only has to spread names over eight colours.
 */
export function senderPalette(from: string): string {
  let hash = 0;
  for (const char of from) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

/**
 * The ink for initials on a sender's own colour: black or white, whichever
 * stands out more against it by the WCAG contrast ratio, since the profile
 * palette runs from an amber that white is lost on to a blue that black is.
 */
export function inkOn(hex: string): "black" | "white" {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  // Contrast with black is (L + 0.05) / 0.05, with white 1.05 / (L + 0.05).
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "black" : "white";
}

/**
 * A sender's own colour as their name's text: as chosen on the dark
 * theme, which the profile palette was picked against, and darkened on the
 * light one, where an amber or a cyan name would not read on white.
 */
export function senderNameColor(hex: string) {
  return { base: `color-mix(in oklab, ${hex} 60%, black)`, _dark: hex };
}

/**
 * The letters in a sender's avatar: the first letter of each of the first
 * two words ("David Williams" is DW), or the first two letters of a single
 * word ("Harry" is HA), so every avatar carries two and a one-word name is
 * not left with a lone letter.
 */
export function senderInitials(from: string): string {
  const words = from.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}
