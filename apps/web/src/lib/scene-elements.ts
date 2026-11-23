import { isWebUrl, type ElementKind } from "@/lib/elements";

// An element in a scene (scene_elements) as the tables show it: the
// workflow's statuses, the items of the library panel and the play space,
// a pill's text and link, and the play space's stacks. The storyteller's
// table and the players' read these alike, which is why they are here and
// not in lib/run.ts, which is the storyteller's table alone.

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

/** What a tab of the library panel lists: the story's attachments, or one kind of element. */
export type RunLibrarySource = "ATTACHMENT" | ElementKind;

/**
 * What every item carries, in the storyteller's library panel and in a play
 * space alike. `key` is the source, the row's id and, for an element linked
 * to the scene, the link's id (playItemKey): an element may be in a scene
 * more than once, one pill per link, and the pills are told apart by it.
 */
type Item = {
  key: string;
  /** The library tab it belongs to. */
  kind: RunLibrarySource;
  label: string;
  /** A second line: an element's title. */
  detail: string | null;
  /** An attachment's picture. */
  imageUrl: string | null;
};

/**
 * One row of the storyteller's library panel: one of the story's
 * attachments, or one of its elements. An element's row goes into the play
 * space as it is when there is no scene to link it to (TableLibraryPanel),
 * which a SceneItem allows: it is one with none of a link's fields.
 */
export type LibraryItem = Item & {
  /**
   * An attachment's tags and whether it is its story's cover, for the
   * full-size preview the library opens from its picture. Absent for
   * everything else.
   */
  attachment?: { tags: string[]; isCover: boolean };
};

/**
 * One thing in a play space, the storyteller's or the players': one of the
 * current scene's elements, or at the storyteller's table one put there from
 * the library and held in the page's state alone.
 */
export type SceneItem = Item & {
  /**
   * An element linked to the scene: its scene_elements tags, which choose
   * the stacks it shows in. Absent for anything only in the page's state.
   */
  sceneTags?: string[];
  /** An element linked to the scene: its scene_elements status, which the pill's status menu shows. */
  sceneStatus?: string;
  /** An element linked to the scene: the link's own id, the holder of its stat blocks. */
  idSceneElement?: number;
  /**
   * The storyteller's table: the pill's picture is the element's annotated
   * one, fog and pen over it (annotatedForStoryteller), so the pill opens the
   * annotator rather than the plain picture. Absent for any other.
   */
  annotated?: boolean;
  /**
   * An element linked to the scene: whether the link carries any stat block,
   * which gives the pill its die. As the page loaded or last saved it; a
   * block picked at the table shows once the page is read again.
   */
  hasStatBlocks?: boolean;
  /**
   * An element linked to the scene whose link carries the template's health
   * indicator: how full it is, 0 to 100 (healthLevel), drawn as a drop by the
   * name, white when full and dark red at 0. The players' table is given this
   * alone of the link's stats. Absent for no drop.
   */
  health?: number;
  /**
   * An element linked to the scene: whether the players' table shows its
   * description (scene_elements.show_info), which the pill's info toggle sets.
   */
  showInfo?: boolean;
  /** The players' table: the element's description, when show_info lets them see it. */
  info?: string | null;
  /** The players' table: their own notes on the element (elements.notes), from its info popover. */
  notes?: string | null;
  /**
   * The external link the pill offers (pillLink): the link's own for this
   * scene, else the element's. Null or absent for none.
   */
  link?: PillLink | null;
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
 * An item's key: the kind and the element's id, and the link's id after them
 * for an element linked to the scene, so two links of one element are two
 * items. Without a link (an element kept in the page's state alone, with no
 * scene at the table) the element's id is all there is.
 */
export function playItemKey(kind: string, idElement: number, idSceneElement?: number | null) {
  return idSceneElement == null ? `${kind}:${idElement}` : `${kind}:${idElement}:${idSceneElement}`;
}

/** The element id in an element item's key, `KIND:id` or `KIND:id:link` (playItemKey). */
export function elementIdOf(item: LibraryItem | SceneItem): number {
  return Number(item.key.split(":")[1]);
}

/**
 * The fields a pill can show, as scene_elements.element_showing names them
 * (its CHECK holds the same four), in the dropdown's order: the element's
 * initial name, name and title, and the link's own label, which a copy of an
 * element already in the scene is given as it is made ("Goblin 1").
 */
export const ELEMENT_SHOWING = ["initial_name", "name", "title", "label"] as const;
export type ElementShowing = (typeof ELEMENT_SHOWING)[number];

/** What a new link shows, the column's default: a first appearance. */
export const DEFAULT_ELEMENT_SHOWING: ElementShowing = "initial_name";

export function isElementShowing(value: unknown): value is ElementShowing {
  return ELEMENT_SHOWING.includes(value as ElementShowing);
}

/** The external link a pill offers: the address, and the words for its tooltip. */
export type PillLink = { url: string; text: string };

/** An external link as a row carries it: the address and the words for it, either empty. */
export type ElementLink = { url: string | null; urlText: string | null };

/**
 * The link a pill offers for an element in a scene: the link's own for this
 * scene when it has one, else the element's, and only an address that is a
 * well-formed web address (isWebUrl); anything else is kept but not
 * offered. The tooltip is the words given with the address, else the
 * address itself. Null for no link.
 */
export function pillLink(
  scene: ElementLink | null | undefined,
  element: ElementLink,
): PillLink | null {
  const chosen = scene?.url ? scene : element;
  if (!chosen.url || !isWebUrl(chosen.url)) return null;
  return { url: chosen.url, text: chosen.urlText || chosen.url };
}

/**
 * A pill's showable fields by their column names: the element's three, and
 * the link's own label (scene_elements.label); only the name is never empty.
 */
export type ElementFields = {
  initial_name: string | null;
  name: string;
  title: string | null;
  label: string | null;
};

/**
 * A linked element's pill text for the field it shows. A field left empty
 * falls back to the name, so a pill is never blank, and `highlighted` is
 * then false: the highlight says the players know the element by something
 * other than its name. The title goes on the second line unless it is
 * already the first.
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
export function withShowing(item: SceneItem, showing: ElementShowing): SceneItem {
  if (!item.fields) return item;
  const { label, detail } = pillText(item.fields, showing);
  return { ...item, showing, label, detail };
}

/** The stack a scene with no tags shows its elements in. */
export const DEFAULT_STACK_TITLE = "Default";

/**
 * How a stack is named in story_scenes.wide_tags: by its tag, or by "" for
 * the Default stack, whose tag is null. A real stack can never be called ""
 * (stackNameSchema wants at least one character), so the two never meet.
 */
export function stackKey(tag: string | null): string {
  return tag ?? "";
}

/** Whether the storyteller has widened the stack to the whole play space. */
export function isStackWide(wideTags: readonly string[] | undefined, tag: string | null): boolean {
  return wideTags?.includes(stackKey(tag)) ?? false;
}

/** The wide set with one stack widened or narrowed, as sa_setStackWide writes it. */
export function withStackWide(
  wideTags: readonly string[] | undefined,
  tag: string | null,
  wide: boolean,
): string[] {
  const key = stackKey(tag);
  const rest = (wideTags ?? []).filter((held) => held !== key);
  return wide ? [...rest, key] : rest;
}

/**
 * One stack of the play space: a scene tag and the items filed under it.
 * `tag` is null for the Default stack of a scene with no tags, whose new
 * elements are linked with none.
 */
export type PlayStack = { tag: string | null; title: string; items: SceneItem[] };

/**
 * The play space's stacks: one per scene tag in the scene's order, or a
 * single Default stack when the scene has none. An item goes in every stack
 * whose tag it carries. Every linked element is given one as it is linked,
 * but one that carries none of the scene's tags (its tag since taken off the
 * scene, say), or anything the page holds without a link, goes in the first
 * stack rather than nowhere.
 */
export function playStacks(tags: string[], items: SceneItem[]): PlayStack[] {
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
