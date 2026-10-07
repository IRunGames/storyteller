/**
 * What /play/[id] and its waiting room need to know about a story before
 * deciding which of them to show: whether it can be played at all, whether
 * the caller is the storyteller, and whether a session is under way.
 */
export type PlayStory = {
  idStory: number;
  title: string;
  /** The story's cover, painted behind the waiting room. Null when it has none. */
  imageUrl: string | null;
  isOwner: boolean;
  isActive: boolean;
  isArchived: boolean;
  /** The story's current session is OPEN or RESUMED; see db/open-session.ts. */
  hasOpenSession: boolean;
  /** The session stories.id_story_session points at, whatever its status. */
  idStorySession: number | null;
};

/** A story the table refuses to open: switched off, or taken down. */
export function isUnplayable(story: Pick<PlayStory, "isActive" | "isArchived">): boolean {
  return !story.isActive || story.isArchived;
}

/** What one heartbeat from the waiting room hears back. */
export type WaitingRoomState = {
  /**
   * When the caller's row last entered WAITING (session_players.waiting_at),
   * which the room's clock counts from.
   */
  waitingSince: Date;
  /** WAITING rows for the story with a recent heartbeat, the caller's included. */
  waitingCount: number;
  /** A session has opened, so the room should send the caller to the table. */
  hasOpenSession: boolean;
  /** The story was switched off or archived while they waited. */
  isUnplayable: boolean;
};

/**
 * How often the waiting room touches its row. Short enough that a session
 * opening is noticed within a few seconds of it happening, long enough that
 * a room full of players is not a steady stream of writes.
 */
export const WAITING_HEARTBEAT_MS = 10_000;

/**
 * How long a WAITING row may go without a heartbeat and still be counted.
 * Nothing moves a quiet row out of WAITING; past this it is only left out of
 * the count, and its player's next heartbeat restarts their clock rather
 * than counting the absence. Well over one beat, because a tab left in the
 * background is not beating every ten seconds: Chrome holds a hidden page's
 * timers to once a minute after a few minutes, and a player waiting for the
 * table will often be in another tab. Leaving the page deletes the row at
 * once, so this only governs a closed tab or a lost connection.
 */
export const WAITING_STALE_SECONDS = 90;

/**
 * How long someone has waited, as a clock reads: "0:07", "12:40", "1:02:05".
 * Negative input, which a client clock running behind the database's gives
 * in the first moments, reads as no wait at all.
 */
export function formatWaited(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}`
    : `${minutes}:${secs}`;
}

/** "1 person waiting", "3 people waiting". */
export function formatWaitingCount(count: number): string {
  return count === 1 ? "1 person waiting" : `${count} people waiting`;
}

/**
 * The title a session gets when Play creates it: the day it was opened plus
 * " session", as in "Oct 6, 2026 session". The day is written by whoever
 * calls this, because which day it is depends on the storyteller's time
 * zone: the picker passes formatDay(new Date()) from the browser, and the
 * server only falls back to the UTC day when it was given none.
 */
export function newSessionTitle(day: string): string {
  return `${day} session`;
}

/**
 * The pictures the waiting room can be painted on, served from
 * public/images. One is picked at random for each visit, the same for every
 * story; see pickWaitingBackground.
 */
export const WAITING_BACKGROUNDS = [
  "/images/c_waiting.webp",
  "/images/f_waiting.webp",
  "/images/o_waiting.webp",
] as const;

/**
 * One of WAITING_BACKGROUNDS at random. The waiting room's page calls it on
 * the server and hands the result down, rather than the room choosing in
 * the browser: a pick made during render on both sides would differ, and
 * the markup the server sent would not match the one React hydrates. The
 * random source is a parameter so a test can pin it.
 */
export function pickWaitingBackground(random: () => number = Math.random): string {
  return WAITING_BACKGROUNDS[Math.floor(random() * WAITING_BACKGROUNDS.length)];
}
