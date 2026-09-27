/**
 * The shared view of a database status workflow: what a row's status may be,
 * what it may become, and how the pill that shows it is coloured. The
 * workflows themselves live in the database (db/STATUS_WORKFLOWS.md); nothing
 * here restates one, so a workflow edited in a seed is an edit everywhere.
 */

/** The tables whose status the pill may read and write. */
export const STATUS_TABLES = ["story_scenes", "story_sessions"] as const;
export type StatusTable = (typeof STATUS_TABLES)[number];

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
