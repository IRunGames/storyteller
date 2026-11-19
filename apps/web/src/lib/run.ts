import type { PictureState } from "@/lib/annotations";
import type { Attachment } from "@/lib/attachments";
import {
  ELEMENT_KINDS,
  ELEMENT_SORT_KEYS,
  type ElementKind,
  type ElementSort,
} from "@/lib/elements";
import type { RunLibrarySource, SceneItem } from "@/lib/scene-elements";
import type { SceneText } from "@/lib/scenes";

// The storyteller's table, /stories/[id]/run: the pieces its library panel
// and play space share. The player's table is /stories/[id]/play; see
// lib/play.ts. What both tables read of a scene's elements (their statuses,
// the items, a pill's text, the stacks) is lib/scene-elements.ts.

/** How many matches each of the library panel's tabs lists. */
export const RUN_LIST_SIZE = 10;

/** How many of the story's scenes the header's scene selector lists. */
export const RUN_SCENES_LIST_SIZE = 10;

/** The session being played, as the header shows it and renames it. */
export type RunSession = {
  idStorySession: number;
  /** 1 for the story's first session, counted in the order they opened. */
  number: number;
  title: string | null;
  /** As the database has it, a story_sessions workflow key, for the chip beside the title. */
  status: string;
};

/** One scene as the header's scene selector lists it. */
export type RunScene = {
  idStoryScene: number;
  title: string;
  /** As the database has it, a story_scenes workflow key. */
  status: string;
  /**
   * Its description and notes, for the panel behind its title. Carried by
   * the scene the table is on (sa_openRunPlaySpace, sa_loadRunScene); the
   * selector's list leaves them out.
   */
  text?: SceneText;
  /**
   * The sitting it was played in, as the Timeline heads it ("3. Kildealg"),
   * or null for none. Carried by the selector's list, which shows it under
   * the title.
   */
  sessionHeading?: string | null;
};

/**
 * The scene the table is on, and what the play space holds for it: the
 * scene's tags, one stack each (playStacks), and its cover, which the play
 * space shows behind the stacks.
 */
export type RunPlaySpace = {
  scene: RunScene | null;
  tags: string[];
  /**
   * The stacks widened to the whole space (story_scenes.wide_tags, by
   * stackKey). Optional so a space built by hand, as the tests' fixtures
   * are, need not say; the loaders always do, and absent reads as none.
   */
  wideTags?: string[];
  coverUrl: string | null;
  inPlay: SceneItem[];
};

/** What the play space shows with no scene at the table. */
export const EMPTY_PLAY_SPACE: RunPlaySpace = { scene: null, tags: [], coverUrl: null, inPlay: [] };

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
 * What the Attachments tab can be sorted by. The file name sorts A to Z by
 * the label the list shows (attachmentLabel); the dates newest first, as
 * the element sorts do.
 */
export const ATTACHMENT_SORT_KEYS = ["file_name", "updated", "created"] as const;
export type AttachmentSort = (typeof ATTACHMENT_SORT_KEYS)[number];

export const ATTACHMENT_SORT_LABELS: Record<AttachmentSort, string> = {
  file_name: "File name",
  updated: "Updated",
  created: "Created",
};

export const DEFAULT_ATTACHMENT_SORT: AttachmentSort = "updated";
export const DEFAULT_ELEMENT_SORT: ElementSort = "name";

/** Whether a stored preference is one of the attachment sorts. */
export function isAttachmentSort(value: unknown): value is AttachmentSort {
  return typeof value === "string" && (ATTACHMENT_SORT_KEYS as readonly string[]).includes(value);
}

/** Whether a stored preference is one of the element sorts. */
export function isElementSort(value: unknown): value is ElementSort {
  return typeof value === "string" && (ELEMENT_SORT_KEYS as readonly string[]).includes(value);
}

/**
 * A holder's attachments in the order the library's sort menu asks for.
 * Sorted here rather than by sa_listAttachments because the field holds
 * every row of the holder already and the sort is only how they are drawn,
 * so changing it costs no request. The sort is stable: rows that tie (two
 * with no timestamp, or the same name) keep the order the server listed
 * them in.
 */
export function sortAttachments(rows: Attachment[], sort: AttachmentSort): Attachment[] {
  const compare: (a: Attachment, b: Attachment) => number =
    sort === "file_name"
      ? (a, b) => attachmentLabel(a).localeCompare(attachmentLabel(b))
      : sort === "created"
        ? (a, b) => newestFirst(a.createdAt, b.createdAt)
        : (a, b) => newestFirst(a.updatedAt, b.updatedAt);
  return [...rows].sort(compare);
}

/** Later ISO stamps first; a row without one ties with any other. */
function newestFirst(a: string | null, b: string | null): number {
  if (a === null || b === null) return 0;
  return a < b ? 1 : a > b ? -1 : 0;
}

/** Everything about one of the story's elements, for the info popovers. */
export type ElementDetail = {
  idElement: number;
  kind: string;
  name: string;
  initialName: string | null;
  title: string | null;
  description: string | null;
  notes: string | null;
  /** Its picture's address (elements.id_attachment), or null for none. */
  imageUrl: string | null;
  status: string;
  tags: string[];
  /** Its external link, and the words for it. */
  url: string | null;
  urlText: string | null;
  /**
   * Its picture as the annotation controls need it, or null for none. The
   * server always says; absent reads as none, as in a test's fixture.
   */
  picture?: PictureState | null;
};

/** An element's link to a scene (scene_elements): how it stands there. */
export type SceneLink = {
  idSceneElement: number;
  status: string;
  tags: string[];
  /** Whether the players' table shows the element's description. */
  showInfo: boolean;
  /** The link's own external link for this scene, and the words for it. */
  url: string | null;
  urlText: string | null;
  /** The link's own words for its pill; null to show the element's field. */
  label: string | null;
  createdAt: Date | null;
};

/**
 * Everything the element panel shows, from a pill or from the library: the
 * element as the story holds it, and its link to the scene the table is on,
 * or null when it is not in that scene (or there is none).
 */
export type ElementPanelDetail = { element: ElementDetail; link: SceneLink | null };

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
