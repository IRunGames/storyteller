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

/**
 * The scene the table is on, and what the play space holds for it: the
 * scene's tags, one stack each (playStacks), and its cover, which the play
 * space shows behind the stacks.
 */
export type RunPlaySpace = {
  scene: RunScene | null;
  tags: string[];
  coverUrl: string | null;
  inPlay: PlayItem[];
};

/** What the play space shows with no scene at the table. */
export const EMPTY_PLAY_SPACE: RunPlaySpace = { scene: null, tags: [], coverUrl: null, inPlay: [] };

/** The stack a scene with no tags shows its elements in. */
export const DEFAULT_STACK_TITLE = "Default";

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
  /**
   * An element linked to the scene: its scene_elements tags, which choose
   * the stacks it shows in. Absent for anything only in the page's state.
   */
  sceneTags?: string[];
  /** An element linked to the scene: its scene_elements status, which the eye shows. */
  sceneStatus?: string;
  /**
   * The element's name, when the label is its initial name instead: the pill
   * shows the initial name in bold with a reveal icon whose tooltip gives
   * this. Absent when the label is the name itself.
   */
  realName?: string;
};

/**
 * The preference behind the library's Add as invisible switch: elements the
 * storyteller adds to the scene start hidden from the players.
 */
export const RUN_ADD_INVISIBLE = "run.addInvisible";

/** The scene_elements status of an element hidden from the players. */
export const SCENE_ELEMENT_HIDDEN = "INVISIBLE";
/** The scene_elements status of an element switched off in the scene; the pill shows a lock. */
export const SCENE_ELEMENT_DISABLED = "DISABLED";
/** The status the eye shows a hidden element at again, and the lock unlocks to. */
export const SCENE_ELEMENT_SHOWN = "READY";

/** The element id in an element item's key, `KIND:id`. */
export function elementIdOf(item: PlayItem): number {
  return Number(item.key.slice(item.key.indexOf(":") + 1));
}

/** An element linked to a scene, everything about it, for the pill's info popover. */
export type SceneElementDetail = {
  element: {
    idElement: number;
    kind: string;
    name: string;
    initialName: string | null;
    title: string | null;
    description: string | null;
    notes: string | null;
    status: string;
    tags: string[];
  };
  /** The scene_elements row: how the element stands in this scene. */
  link: { idSceneElement: number; status: string; tags: string[]; createdAt: Date | null };
};

/**
 * One stack of the play space: a scene tag and the items filed under it.
 * `tag` is null for the Default stack of a scene with no tags, whose new
 * elements are linked with none.
 */
export type PlayStack = { tag: string | null; title: string; items: PlayItem[] };

/**
 * The play space's stacks: one per scene tag in the scene's order, or a
 * single Default stack when the scene has none. An item goes in every stack
 * whose tag it carries. Every linked element is given one as it is linked,
 * but one that carries none of the scene's tags (its tag since taken off the
 * scene, say), or anything the page holds without a link, goes in the first
 * stack rather than nowhere.
 */
export function playStacks(tags: string[], items: PlayItem[]): PlayStack[] {
  const stacks: PlayStack[] =
    tags.length > 0
      ? tags.map((tag) => ({ tag, title: tag, items: [] }))
      : [{ tag: null, title: DEFAULT_STACK_TITLE, items: [] }];
  for (const item of items) {
    const homes = stacks.filter(
      (stack) => stack.tag !== null && item.sceneTags?.includes(stack.tag),
    );
    for (const stack of homes.length > 0 ? homes : [stacks[0]]) stack.items.push(item);
  }
  return stacks;
}
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
