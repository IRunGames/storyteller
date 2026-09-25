/**
 * The columns of the Prep Work board, left to right. The Timeline is wider
 * than the rest so a session's number and title fit beside its date,
 * players and length, and it does not expand: that width is all its rows
 * need, so the only move it offers is out of the way. Nor does it create:
 * a session begins at the table, through Play now, not from here.
 */
export const PREP_COLUMNS = [
  { title: "Timeline", singular: "session", width: "32rem", expandable: false, creatable: false },
  { title: "Scenes", singular: "scene", width: "20rem", expandable: true, creatable: true },
  { title: "Characters", singular: "character", width: "20rem", expandable: true, creatable: true },
  { title: "Enemies", singular: "enemy", width: "20rem", expandable: true, creatable: true },
  { title: "Resources", singular: "resource", width: "20rem", expandable: true, creatable: true },
] as const;

export type PrepColumnTitle = (typeof PREP_COLUMNS)[number]["title"];

/**
 * How a column is shown: at its usual width, stretched to two thirds of the
 * viewport, or folded away into a button above the board.
 */
export type PrepColumnMode = "normal" | "expanded" | "hidden";
