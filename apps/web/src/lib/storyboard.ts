/**
 * The storyboard: a story's scenes laid side to side in the order they were
 * played, sitting by sitting, under /stories/[id]/storyboard. No React here;
 * the action in that route's actions.ts builds one and components/storyboard
 * draws it.
 */

/** One scene card on the board. */
export type StoryboardScene = {
  idStoryScene: number;
  title: string;
  description: string | null;
  /**
   * Written up at the table, so the storyteller and the players read them
   * under the description when the card is opened; null for a reader of a
   * public story, however the row reads, as a session's notes are.
   */
  notes: string | null;
  /** As the database has it, a story_scenes workflow key; the card shows it as a word. */
  status: string;
  /**
   * The picture behind the card: the scene's cover, else the first of its
   * pictures in the storyteller's order, else none. A scene is the one holder
   * that falls back to its first picture: a card with no image is a grey box,
   * and a storyteller who attached pictures to a scene without choosing a
   * cover still meant them to be seen.
   */
  imageUrl: string | null;
  /** Which finished scene of its sitting it was; null until it is finished. */
  sceneNumber: number | null;
  /** Whole minutes in play, once finished; null before. */
  length: number | null;
};

/** One sitting on the board: its band, and the scenes played in it beneath. */
export type StoryboardSession = {
  idStorySession: number;
  /** 1 for the story's first session, in the order they were opened. */
  number: number;
  title: string | null;
  /** As the database has it, a story_sessions workflow key. */
  status: string;
  /** When it was opened, the same date the Timeline shows for it. */
  startedAt: Date;
  /** What the storyteller wrote up of the sitting afterwards, for the band's info panel. */
  summary: string | null;
  /**
   * Written up at the table by the storyteller and the players, so both
   * read them; null for a reader of a public story, however the row reads,
   * as sa_getStorySession keeps them.
   */
  notes: string | null;
  lingeringQuestions: string | null;
  /**
   * In the order they were played: by scene number, then by when each went
   * into play, with a scene attached to the sitting but never run last.
   */
  scenes: StoryboardScene[];
};

/** How many sittings the board loads at a time: the latest first, then earlier ones on request. */
export const STORYBOARD_SESSIONS_PAGE = 3;
/** How many unplayed scenes the grid loads at a time. */
export const STORYBOARD_UNPLAYED_PAGE = 10;

export type Storyboard = {
  idStory: number;
  title: string;
  /** The story's cover, behind the whole board. */
  imageUrl: string | null;
  /** The viewer tells the story, so the board shows them everything. */
  isStoryteller: boolean;
  /**
   * The latest STORYBOARD_SESSIONS_PAGE sittings the viewer may see, oldest
   * first. Every sitting counts for the storyteller; for anyone else only
   * the done ones, and in each only the completed scenes, since until a
   * sitting is done its scenes are prep the players have not been shown.
   */
  sessions: StoryboardSession[];
  /** There are sittings before the first one here, for sa_getStoryboardSessions. */
  moreSessions: boolean;
  /**
   * The first STORYBOARD_UNPLAYED_PAGE scenes in no sitting yet, for the
   * grid at the end of the board. The storyteller's alone: always empty
   * for anyone else.
   */
  unplayed: StoryboardScene[];
  /** There are unplayed scenes after these, for sa_getStoryboardUnplayed. */
  moreUnplayed: boolean;
};

/** A page of earlier sittings, oldest first, and whether there are earlier still. */
export type StoryboardSessionsPage = {
  sessions: StoryboardSession[];
  more: boolean;
};

/** A page of unplayed scenes in the grid's order, and whether there are more after. */
export type StoryboardScenesPage = {
  scenes: StoryboardScene[];
  more: boolean;
};

/**
 * Where a page of earlier sittings starts from: the oldest one on the
 * board. Its number and its id together, since two sittings opened in one
 * statement share a number and the id orders them.
 */
export type StoryboardSessionCursor = {
  number: number;
  idStorySession: number;
};

/** The address of a story's storyboard. */
export function storyboardPath(idStory: number): string {
  return `/stories/${idStory}/storyboard`;
}
