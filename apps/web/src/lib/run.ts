import type { Attachment } from "@/lib/attachments";
import { ELEMENT_KINDS, type ElementKind } from "@/lib/elements";

// The storyteller's table, /run/[id]: the pieces its library panel and play
// space share. The player's table is /play/[id]; see lib/play.ts.

/** How many matches each of the library panel's tabs lists. */
export const RUN_LIST_SIZE = 10;

/** How many of the story's scenes the header's scene selector lists. */
export const RUN_SCENES_LIST_SIZE = 10;

/** One scene as the header's scene selector lists it. */
export type RunScene = {
  idStoryScene: number;
  title: string;
  /** As the database has it, a story_scenes workflow key. */
  status: string;
};

/** The scene the table is on, and what the play space holds for it. */
export type RunPlaySpace = { scene: RunScene | null; inPlay: PlayItem[] };

/** What a tab of the library panel lists: the story's attachments, or one kind of element. */
export type RunLibrarySource = "ATTACHMENT" | ElementKind;

// Each kind's tab is named as its column on the Prep Work board is, so the
// storyteller finds the same word in both places.
const KIND_TITLES: Record<ElementKind, string> = {
  PERSON: "People",
  PLACE: "Places",
  THING: "Things",
  OTHER: "Other",
  EPHEMERA: "Ephemera",
};

/** The library panel's tabs, left to right: attachments, then every kind of element. */
export const RUN_LIBRARY_TABS: readonly { source: RunLibrarySource; title: string }[] = [
  { source: "ATTACHMENT", title: "Attachments" },
  ...ELEMENT_KINDS.map((kind) => ({ source: kind, title: KIND_TITLES[kind] })),
];

/**
 * One thing in the storyteller's play space: put there from the library, or
 * there from the start as one of the current scene's elements.
 * `key` is the source and the row's id, so the same row cannot go in twice.
 */
export type PlayItem = {
  key: string;
  /** The library tab it belongs to. */
  kind: RunLibrarySource;
  label: string;
  /** A second line: an element's title. */
  detail: string | null;
  /** An attachment's picture. */
  imageUrl: string | null;
  /**
   * An attachment's tags and whether it is its story's cover, for the
   * full-size preview the library opens from its picture. Absent for
   * everything else.
   */
  attachment?: { tags: string[]; isCover: boolean };
};

/**
 * What an attachment is called in a list: its file name, else the last part
 * of its address (a typed link has no file name), else a plain word.
 */
export function attachmentLabel(attachment: Attachment): string {
  if (attachment.fileName) return attachment.fileName;
  if (attachment.url) {
    try {
      const last = new URL(attachment.url).pathname.split("/").filter(Boolean).at(-1);
      if (last) return decodeURIComponent(last);
    } catch {
      // Not an address URL can read; fall through to the plain word.
    }
  }
  return "Attachment";
}
