/**
 * The values of the elements_kind enum, in its order, which is the order the
 * Prep Work board gives the column for each. The database is the one that
 * enforces them; this list is what the board lays its columns out from.
 */
export const ELEMENT_KINDS = ["PERSON", "PLACE", "THING", "OTHER", "EPHEMERA"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** Each kind as the kind dropdown and anything else naming one says it. */
export const ELEMENT_KIND_LABELS: Record<ElementKind, string> = {
  PERSON: "Person",
  PLACE: "Place",
  THING: "Thing",
  OTHER: "Other",
  EPHEMERA: "Ephemera",
};

/** Whether a string, such as a ?kind= in the address, is one of the kinds. */
export function isElementKind(value: unknown): value is ElementKind {
  return typeof value === "string" && (ELEMENT_KINDS as readonly string[]).includes(value);
}

/**
 * What a list of elements can be sorted by: the run page's library offers
 * each from its sort menu, and the list actions take one. The names sort
 * A to Z with an element that has none last; the dates newest first, since
 * what was just made or just changed is what the storyteller is after.
 */
export const ELEMENT_SORT_KEYS = ["name", "initial_name", "title", "created", "updated"] as const;
export type ElementSort = (typeof ELEMENT_SORT_KEYS)[number];

/** Each sort as the menu names it. */
export const ELEMENT_SORT_LABELS: Record<ElementSort, string> = {
  name: "Name",
  initial_name: "Initial name",
  title: "Title",
  created: "Created",
  updated: "Updated",
};

/** Scenes per page in the element panel's History, under its Load more. */
export const ELEMENT_HISTORY_PAGE_SIZE = 5;

/** Elements per fetch in the Prep Work board's Elements column. */
export const ELEMENTS_PAGE_SIZE = 10;

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
  /**
   * Its cover as the storyteller is shown it (an annotated one as the
   * players see it), or null for none. Absent, as a test's fixture may
   * leave it, reads as none.
   */
  coverUrl?: string | null;
  /**
   * Whether that cover is a players' copy that shows nothing of the picture,
   * fogged whole (PictureState.fogCovered); absent reads as not.
   */
  coverFogCovered?: boolean;
  /**
   * Whether that cover is a players' copy with fog on it anywhere
   * (PictureState.fogActive), for its full-size preview; absent reads as not.
   */
  coverFogActive?: boolean;
  /** How many finished pictures it holds besides its cover; absent reads as none. */
  otherPictures?: number;
};

/**
 * Whether a link an element carries is a web address a pill can offer: one
 * the browser can parse, on http or https. Anything else is kept as typed
 * but never linked, so a half-typed address or a javascript: one goes
 * nowhere.
 */
export function isWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** The fields of an element every form posts, as the schemas name them. */
export type ElementFormFields = {
  kind: ElementKind;
  name: string;
  initialName: string;
  title: string;
  description: string;
  notes: string;
  url: string;
  urlText: string;
};

/**
 * An element form's fields as the elements table holds them: the optional
 * text columns null when left empty, since "" is what an input posts and
 * null is what the column means by "none". The prep board's forms and the
 * run table's write the same eight columns, so this is the one mapping.
 */
export function elementColumns(values: ElementFormFields) {
  return {
    kind: values.kind,
    name: values.name,
    initialName: values.initialName || null,
    title: values.title || null,
    description: values.description || null,
    notes: values.notes || null,
    url: values.url || null,
    urlText: values.urlText || null,
  };
}
