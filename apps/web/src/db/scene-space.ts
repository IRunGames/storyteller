import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { attachmentUrl, sceneElementImageUrl } from "./attachment-url";
import { sceneElements, storyScenes, vSceneElements } from "./schema";
import { ELEMENT_KINDS, isElementKind } from "@/lib/elements";
import {
  DEFAULT_ELEMENT_SHOWING,
  isElementShowing,
  pillLink,
  pillText,
  playItemKey,
  type SceneItem,
} from "@/lib/scene-elements";
import { EMPTY_PLAY_SPACE, type RunPlaySpace } from "@/lib/run";

// The storyteller's read model of a scene: its play space and the pills in
// it, built from v_scene_elements. The run table's actions build it after
// every write that hands a pill back, so it lives here, outside any "use
// server" module, where the actions split by concern can all reach it.

/**
 * Whether a link carries any stat block: its jsonb has a key. Read beside
 * the view's columns, which do not carry the blocks themselves; the view's
 * row is named by its table, as attachmentUrl names its source, since the
 * select list leaves columns bare.
 */
export function linkHasStatBlocks(source: string) {
  return sql<boolean>`(
    select link.stat_blocks <> '{}'::jsonb
    from ${sceneElements} link
    where link.id_scene_element = ${sql.identifier(source)}.id_scene_element
  )`;
}

/** Everything a pill shows, as one row of v_scene_elements carries it: the select list, used whole. */
export const linkedColumns = {
  idElement: vSceneElements.idElement,
  kind: vSceneElements.kind,
  name: vSceneElements.name,
  initialName: vSceneElements.initialName,
  title: vSceneElements.title,
  tags: vSceneElements.tags,
  status: vSceneElements.status,
  showing: vSceneElements.elementShowing,
  showInfo: vSceneElements.showInfo,
  imageUrl: sceneElementImageUrl("v_scene_elements", "v_scene_elements"),
  url: vSceneElements.elementUrl,
  urlText: vSceneElements.elementUrlText,
  sceneUrl: vSceneElements.url,
  sceneUrlText: vSceneElements.urlText,
  idSceneElement: vSceneElements.idSceneElement,
  hasStatBlocks: linkHasStatBlocks("v_scene_elements"),
  label: vSceneElements.label,
};

/**
 * One row as linkedColumns selects it: every field as the view's column has
 * it, nullable, since the view's columns are all nullable to Drizzle. Spelled
 * out rather than inferred from the select, so a reader sees the shape.
 */
export type LinkedViewRow = {
  idElement: number | null;
  kind: string | null;
  name: string | null;
  initialName: string | null;
  title: string | null;
  tags: string[] | null;
  status: string | null;
  showing: string | null;
  showInfo: boolean | null;
  imageUrl: string | null;
  url: string | null;
  urlText: string | null;
  sceneUrl: string | null;
  sceneUrlText: string | null;
  idSceneElement: number | null;
  hasStatBlocks: boolean | null;
  label: string | null;
};

/**
 * What linkedItem is built from: the element's fields and the link's. Every
 * field is here; the builders below fill the ones a read did not have.
 */
export type LinkedRow = {
  idElement: number;
  kind: string;
  name: string;
  initialName: string | null;
  title: string | null;
  tags: string[];
  status: string;
  showing: string | null;
  /** Whether the players see its description; the column's default when not read. */
  showInfo: boolean | null;
  /** The picture the pill shows: the link's own cover in this scene, else the element's. */
  imageUrl: string | null;
  /** The element's external link, and the link's own for this scene (pillLink). */
  url: string | null;
  urlText: string | null;
  sceneUrl: string | null;
  sceneUrlText: string | null;
  /** The link's own id and whether it carries a stat block. */
  idSceneElement: number | null;
  hasStatBlocks: boolean | null;
  /** The link's own label (scene_elements.label), one of the fields the pill may show. */
  label: string | null;
};

/**
 * A LinkedRow from whatever a write has in hand: the fields it knows, with
 * the rest absent, which reads as "none" or "the default". The five places
 * that used to build the seventeen fields by hand each pass what they have.
 */
export function linkedRowOf(
  known: Pick<LinkedRow, "idElement" | "kind" | "name"> & Partial<LinkedRow>,
): LinkedRow {
  return {
    initialName: null,
    title: null,
    tags: [],
    status: "",
    showing: null,
    showInfo: null,
    imageUrl: null,
    url: null,
    urlText: null,
    sceneUrl: null,
    sceneUrlText: null,
    idSceneElement: null,
    hasStatBlocks: null,
    label: null,
    ...known,
  };
}

/**
 * A row of v_scene_elements as a LinkedRow, or null for one with no element
 * behind it, which the view's nullable columns allow in type though a link
 * always has its element.
 */
export function fromViewRow(row: LinkedViewRow): LinkedRow | null {
  if (row.idElement === null || row.kind === null || row.name === null) return null;
  return linkedRowOf({
    idElement: row.idElement,
    kind: row.kind,
    name: row.name,
    initialName: row.initialName,
    title: row.title,
    tags: row.tags ?? [],
    status: row.status ?? "",
    showing: row.showing,
    showInfo: row.showInfo,
    imageUrl: row.imageUrl,
    url: row.url,
    urlText: row.urlText,
    sceneUrl: row.sceneUrl,
    sceneUrlText: row.sceneUrlText,
    idSceneElement: row.idSceneElement,
    hasStatBlocks: row.hasStatBlocks,
    label: row.label,
  });
}

/**
 * An element linked to the scene, as the play space holds it. The pill is
 * labelled with whichever field the link's element_showing names, the
 * element's initial name for a new link and the link's own label for a copy,
 * falling back to the name when that field is empty (pillText).
 * `showing` is null or unknown only for a row read before the column
 * existed, and shows the default. Keyed by the link as well as the element
 * (playItemKey), since an element may be in the scene more than once.
 */
export function linkedItem(row: LinkedRow): SceneItem {
  const fields = {
    initial_name: row.initialName,
    name: row.name,
    title: row.title,
    label: row.label,
  };
  const showing = isElementShowing(row.showing) ? row.showing : DEFAULT_ELEMENT_SHOWING;
  const { label, detail } = pillText(fields, showing);
  return {
    key: playItemKey(row.kind, row.idElement, row.idSceneElement),
    kind: row.kind as SceneItem["kind"],
    label,
    detail,
    imageUrl: row.imageUrl,
    sceneTags: row.tags,
    sceneStatus: row.status,
    showInfo: row.showInfo ?? true,
    ...(row.idSceneElement == null ? {} : { idSceneElement: row.idSceneElement }),
    hasStatBlocks: row.hasStatBlocks ?? false,
    link: pillLink(
      { url: row.sceneUrl, urlText: row.sceneUrlText },
      { url: row.url, urlText: row.urlText },
    ),
    fields,
    showing,
  };
}

/**
 * One link of a scene of the story with everything its pill shows, read for
 * a write that hands the pill back (Move to, the stacks dialog), or null
 * when the link is not the scene's. The story is checked because nothing in
 * the database holds a link's element to the scene's story.
 */
export async function linkedRow(
  idStory: number,
  idStoryScene: number,
  idSceneElement: number,
): Promise<LinkedRow | null> {
  const [row] = await db
    .select(linkedColumns)
    .from(vSceneElements)
    .where(
      and(
        eq(vSceneElements.idStoryScene, idStoryScene),
        eq(vSceneElements.idSceneElement, idSceneElement),
        eq(vSceneElements.idStory, idStory),
      ),
    )
    .limit(1);
  return row ? fromViewRow(row) : null;
}

/**
 * The play space for one scene of the story: its tags and cover, and the
 * elements brought into it (scene_elements) in the kinds' order, People to
 * Ephemera, as the library tabs list them, and by name within a kind. The
 * elements' keys are the library's own, so one already here cannot be added
 * again from the library. Empty for a scene that is not the story's.
 */
export async function spaceFor(idStory: number, idStoryScene: number): Promise<RunPlaySpace> {
  const [scene] = await db
    .select({
      idStoryScene: storyScenes.idStoryScene,
      title: storyScenes.sceneTitle,
      status: storyScenes.status,
      tags: storyScenes.tags,
      wideTags: storyScenes.wideTags,
      coverUrl: attachmentUrl("STORY_SCENE", "story_scenes", "id_story_scene"),
      description: storyScenes.sceneDescription,
      notes: storyScenes.notes,
    })
    .from(storyScenes)
    .where(and(eq(storyScenes.idStoryScene, idStoryScene), eq(storyScenes.idStory, idStory)))
    .limit(1);
  if (!scene) return EMPTY_PLAY_SPACE;

  const rows = await db
    .select(linkedColumns)
    .from(vSceneElements)
    .where(
      and(
        eq(vSceneElements.idStoryScene, scene.idStoryScene),
        // Nothing in the database holds a link's element to the scene's
        // story, so a link to another story's element is not this scene's.
        eq(vSceneElements.idStory, idStory),
      ),
    )
    .orderBy(asc(vSceneElements.name), asc(vSceneElements.idElement));

  const order = (kind: string) => ELEMENT_KINDS.indexOf(kind as (typeof ELEMENT_KINDS)[number]);
  const linked = rows
    .map(fromViewRow)
    .filter((row): row is LinkedRow => row !== null && isElementKind(row.kind))
    .sort((a, b) => order(a.kind) - order(b.kind))
    .map(linkedItem);

  return {
    scene: {
      idStoryScene: scene.idStoryScene,
      title: scene.title,
      status: scene.status,
      text: { description: scene.description, notes: scene.notes },
    },
    tags: scene.tags,
    wideTags: scene.wideTags,
    coverUrl: scene.coverUrl,
    inPlay: linked,
  };
}
