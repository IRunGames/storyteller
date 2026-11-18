/**
 * The shared view of a database status workflow: what a row's status may be,
 * what it may become, and how the pill that shows it is coloured. The
 * workflows themselves live in the database (db/STATUS_WORKFLOWS.md); nothing
 * here restates one, so a workflow edited in a seed is an edit everywhere.
 */

/** The tables whose status the pill may read and write. */
export const STATUS_TABLES = [
  "story_scenes",
  "story_sessions",
  "elements",
  "scene_elements",
] as const;
export type StatusTable = (typeof STATUS_TABLES)[number];

/**
 * The session statuses the code itself branches on, as the story_sessions
 * workflow spells them: the two a session is being played in, the pause, and
 * the end. Everything else about the workflow stays in the database; these
 * are named because the table opens, pauses, resumes and closes on them.
 */
export const SESSION_STATUS = {
  OPEN: "OPEN",
  RESUMED: "RESUMED",
  SUSPENDED: "SUSPENDED",
  DONE: "DONE",
} as const;

/**
 * The statuses in which a session is being played. A session that came back
 * from a pause is at the table just as much as one that never paused.
 */
export const SESSION_PLAYING_STATUSES: string[] = [SESSION_STATUS.OPEN, SESSION_STATUS.RESUMED];

/**
 * The status a session has once it has been played out. Named, like
 * SCENE_LOCKED_STATUS, because the workflow has no mark the code could read
 * it off: it is the point from which a player may read the session's
 * completed scenes.
 */
export const SESSION_DONE_STATUS = SESSION_STATUS.DONE;

/**
 * The status a scene can no longer be edited in: it has been played out, so
 * what it says is the record of what happened. Named here, rather than read
 * as "the workflow's last status", because the scene workflow is a cycle and
 * has no last status the database would recognise as final; the edit action
 * checks it again.
 */
export const SCENE_LOCKED_STATUS = "COMPLETE";

/**
 * The status a scene waits in before it is played: the storyteller has not
 * opened it, or has set it back after opening it. The players' table puts up
 * a "stand by" overlay over a pending scene; the storyteller's does not, since
 * it is the storyteller who moves the scene on.
 */
export const SCENE_PENDING_STATUS = "PENDING";

/** One status of a workflow, in the order the workflow lists them. */
export type StatusOption = {
  key: string;
  /** The key as a reader sees it: "In progress" for in_progress. */
  label: string;
  description: string | null;
  /**
   * The statuses a row may arrive at this one FROM, straight from
   * s_statuses. Null means the database does not check, so any status may
   * move here; an empty list means none may.
   */
  from: string[] | null;
};

/**
 * A status key as a reader sees it: "PENDING" as "Pending", "IN_PROGRESS" as
 * "In progress". The keys are stored upper case, being constants rather than
 * prose, so they are lower-cased before the first letter is put back up;
 * a key that arrives in any other case reads the same way.
 */
export function statusLabel(key: string): string {
  const words = key.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The statuses a row holding `current` may be moved to, in workflow order.
 * The current status is left out — it is not a move — and so is any status
 * whose `from` list does not name the current one. A null `from` is the
 * database's "unchecked", so such a status is always offered.
 */
export function transitionsFrom(current: string, options: StatusOption[]): StatusOption[] {
  return options.filter(
    (option) => option.key !== current && (option.from === null || option.from.includes(current)),
  );
}
