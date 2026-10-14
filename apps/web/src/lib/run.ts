import type { Attachment } from "@/lib/attachments";
import { ELEMENT_KINDS, type ElementKind } from "@/lib/elements";

// The storyteller's table, /run/[id]: the pieces its library panel and play
// space share. The player's table is /play/[id]; see lib/play.ts.

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
};

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
  /** An element linked to the scene: its scene_elements status, which the pill's status menu shows. */
  sceneStatus?: string;
  /**
   * An element linked to the scene: whether the players' table shows its
   * description (scene_elements.show_info), which the pill's info toggle sets.
   */
  showInfo?: boolean;
  /** The players' table: the element's description, when show_info lets them see it. */
  info?: string | null;
  /**
   * An element linked to the scene: its fields the pill can show, which the
   * pill's name lists as a dropdown, and the one it shows in this scene
   * (scene_elements.element_showing). The label and detail are worked out
   * from them by pillText. Absent for anything only in the page's state.
   */
  fields?: ElementFields;
  showing?: ElementShowing;
};

/**
 * The element fields a pill can show, as scene_elements.element_showing
 * names them (its CHECK holds the same three), in the dropdown's order.
 */
export const ELEMENT_SHOWING = ["initial_name", "name", "title"] as const;
export type ElementShowing = (typeof ELEMENT_SHOWING)[number];

/** What a new link shows, the column's default: a first appearance. */
export const DEFAULT_ELEMENT_SHOWING: ElementShowing = "initial_name";

export function isElementShowing(value: unknown): value is ElementShowing {
  return ELEMENT_SHOWING.includes(value as ElementShowing);
}

/** An element's showable fields by their column names; only the name is never empty. */
export type ElementFields = { initial_name: string | null; name: string; title: string | null };

/**
 * A linked element's pill text for the field it shows. A field the element
 * has left empty falls back to the name, so a pill is never blank, and
 * `highlighted` is then false: the highlight says the players know the
 * element by something other than its name. The title goes on the second
 * line unless it is already the first.
 */
export function pillText(
  fields: ElementFields,
  showing: ElementShowing,
): { label: string; detail: string | null; highlighted: boolean } {
  const label = fields[showing] || fields.name;
  return {
    label,
    detail: fields.title && fields.title !== label ? fields.title : null,
    highlighted: label !== fields.name,
  };
}

/** A linked element's item showing another of its fields, label and detail with it. */
export function withShowing(item: PlayItem, showing: ElementShowing): PlayItem {
  if (!item.fields) return item;
  const { label, detail } = pillText(item.fields, showing);
  return { ...item, showing, label, detail };
}

/**
 * The preference behind the library's Add as invisible switch: elements the
 * storyteller adds to the scene start hidden from the players.
 */
export const RUN_ADD_INVISIBLE = "run.addInvisible";

/**
 * The preference behind the library's Add showing info switch: elements the
 * storyteller adds to the scene start with their description shown to the
 * players (scene_elements.show_info). Off unless chosen: what the players
 * are to know of an element is the storyteller's to give out.
 */
export const RUN_ADD_SHOW_INFO = "run.addShowInfo";

/**
 * The preference behind the library's All / Scene only switch: whether its
 * element tabs list every element in the story or only the ones linked to
 * the scene the table is on.
 */
export const RUN_LIBRARY_SCENE_ONLY = "run.librarySceneOnly";

/**
 * The scene elements workflow's statuses, in the order the pill's status
 * menu lists them (the seed holds the same four, each reachable from the
 * others): in play, hidden from the players, used up for now, switched off.
 */
export const SCENE_ELEMENT_STATUSES = ["READY", "INVISIBLE", "TAPPED", "DISABLED"] as const;
export type SceneElementStatus = (typeof SCENE_ELEMENT_STATUSES)[number];

export function isSceneElementStatus(value: unknown): value is SceneElementStatus {
  return SCENE_ELEMENT_STATUSES.includes(value as SceneElementStatus);
}

/** The scene_elements status of an element in play, the workflow's default. */
export const SCENE_ELEMENT_SHOWN = "READY";
/** The scene_elements status of an element hidden from the players. */
export const SCENE_ELEMENT_HIDDEN = "INVISIBLE";
/** The scene_elements status of an element used up for now, until the storyteller readies it. */
export const SCENE_ELEMENT_TAPPED = "TAPPED";
/** The scene_elements status of an element switched off in the scene. */
export const SCENE_ELEMENT_DISABLED = "DISABLED";

/** The element id in an element item's key, `KIND:id`. */
export function elementIdOf(item: PlayItem): number {
  return Number(item.key.slice(item.key.indexOf(":") + 1));
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
};

/** An element's link to a scene (scene_elements): how it stands there. */
export type SceneLink = {
  idSceneElement: number;
  status: string;
  tags: string[];
  /** Whether the players' table shows the element's description. */
  showInfo: boolean;
  createdAt: Date | null;
};

/**
 * Everything the element panel shows, from a pill or from the library: the
 * element as the story holds it, and its link to the scene the table is on,
 * or null when it is not in that scene (or there is none).
 */
export type ElementPanelDetail = { element: ElementDetail; link: SceneLink | null };

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
