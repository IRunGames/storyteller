/**
 * The values of the elements_kind enum, in its order, which is the order the
 * Prep Work board gives the column for each. The database is the one that
 * enforces them; this list is what the board lays its columns out from.
 */
export const ELEMENT_KINDS = ["PERSON", "PLACE", "THING", "OTHER", "EPHEMERA"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** Elements per fetch in the Prep Work board's Elements column. */
export const ELEMENTS_PAGE_SIZE = 10;

/** How long the Elements search box waits after a keystroke before it asks, in ms. */
export const ELEMENT_SEARCH_DELAY_MS = 250;

/** One card in the Elements column. */
export type StoryElement = {
  idElement: number;
  /**
   * The status the row holds, as the database has it. Not narrowed to the
   * statuses the workflow lists today, for the reason StoryScene.status is not.
   */
  status: string;
  name: string;
  title: string | null;
  description: string | null;
};
