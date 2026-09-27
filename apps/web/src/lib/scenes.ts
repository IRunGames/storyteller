/** Scenes per fetch in the Prep Work board's Scenes column. */
export const SCENES_PAGE_SIZE = 10;

/** How long the Scenes search box waits after a keystroke before it asks, in ms. */
export const SCENE_SEARCH_DELAY_MS = 250;

/** One card in the Scenes column. */
export type StoryScene = {
  idStoryScene: number;
  /** The sitting it was played in; null while it waits on the board. */
  idStorySession: number | null;
  /**
   * The status the row holds, as the database has it. Not narrowed to the
   * statuses the workflow lists today: those are read from s_statuses at run
   * time, so a status added to the workflow needs no change here.
   */
  status: string;
  /**
   * When the row entered the status it holds, from the <status>_at column the
   * workflow keeps for it. Null when nothing has stamped that status: a row
   * seeded straight into it, or a workflow whose trigger has not run.
   */
  statusAt: Date | null;
  /**
   * Which finished scene of its sitting this was, in the order they were
   * finished. Null until the scene is finished, so the board numbers what
   * has been played and leaves the rest unnumbered.
   */
  sceneNumber: number | null;
  title: string;
  /** What the storyteller wrote: the NPCs in it and anything of note. */
  description: string | null;
  /**
   * The sitting's place in its story's opening order, the same number the
   * Timeline gives it. Null while the scene waits on the board.
   */
  sessionNumber: number | null;
  /**
   * The sitting it was played in, as the Timeline names it ("3. Kildealg"),
   * or null while the scene waits on the board. The card shows the number
   * alone and keeps this for the tooltip behind it.
   */
  sessionHeading: string | null;
};

/** What the scene info panel shows for one scene: the card's fields and the picture. */
export type StorySceneDetail = StoryScene & {
  imageLink: string | null;
};

/** One scene as a session's info panel lists it. */
export type SessionScene = {
  idStoryScene: number;
  title: string;
  status: string;
};
