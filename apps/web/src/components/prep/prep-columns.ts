import type { ElementKind } from "@/lib/elements";

/**
 * One column for each kind of element, in the elements_kind enum's order.
 */
export const ELEMENT_COLUMNS = [
  { title: "People", singular: "person", kind: "PERSON" },
  { title: "Places", singular: "place", kind: "PLACE" },
  { title: "Things", singular: "thing", kind: "THING" },
  { title: "Other", singular: "element", kind: "OTHER" },
  { title: "Ephemera", singular: "ephemera", kind: "EPHEMERA" },
] as const satisfies readonly { title: string; singular: string; kind: ElementKind }[];

export type ElementColumnTitle = (typeof ELEMENT_COLUMNS)[number]["title"];

/**
 * The columns of the Prep Work board, left to right. The Timeline is wider
 * than the rest so a session's number and title fit beside its date,
 * players and length, and it does not expand: that width is all its rows
 * need, so the only move it offers is out of the way. Nor does it create:
 * a session begins at the table, through Play now, not from here. The
 * element columns follow, one per kind.
 */
export const PREP_COLUMNS = [
  { title: "Timeline", singular: "session", width: "32rem", expandable: false, creatable: false },
  { title: "Scenes", singular: "scene", width: "20rem", expandable: true, creatable: true },
  {
    title: "Attachments",
    singular: "attachment",
    width: "20rem",
    expandable: true,
    creatable: true,
  },
  ...ELEMENT_COLUMNS.map((column) => ({
    ...column,
    width: "20rem",
    expandable: true,
    creatable: true,
  })),
] as const;

export type PrepColumnTitle = (typeof PREP_COLUMNS)[number]["title"];

/**
 * How a column is shown: at its usual width, stretched to two thirds of the
 * viewport, or folded away into a button above the board.
 */
export type PrepColumnMode = "normal" | "expanded" | "hidden";
