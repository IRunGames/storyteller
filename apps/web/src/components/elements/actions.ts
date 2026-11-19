"use server";

import { and, asc, desc, eq, exists, ilike, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { idSchema, offsetSchema, searchSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { clearCover, setCover, storyPictureUrl } from "@/db/covers";
import { elementOrderBy } from "@/db/element-order";
import { listStatusOptions } from "@/db/status-options";
import { ownedElement, ownedScene, ownedStory } from "@/db/story-access";
import { requireAccount } from "@/lib/authorize";
import { isTransitionRefusal } from "@/lib/db-errors";
import { elementTagsSchema, runStoryElementSchema } from "@/lib/element-schemas";
import {
  ELEMENT_HISTORY_PAGE_SIZE,
  ELEMENT_SORT_KEYS,
  elementColumns,
  isElementKind,
  type ElementKind,
  type ElementSort,
  type StoryElement,
} from "@/lib/elements";
import { likeContains } from "@/lib/filter-text";
import { formErrors } from "@/lib/forms";
import {
  NOT_THIS_STORY,
  NOT_THIS_STORYS_ELEMENT,
  NOT_THIS_STORYS_PICTURE,
  STATUS_REFUSED,
} from "@/lib/messages";
import { publishLater } from "@/lib/realtime/publish";
import { publishElementChanged } from "@/lib/realtime/publish-scene";
import { RUN_LIST_SIZE, type ElementDetail, type ElementPanelDetail } from "@/lib/run";
import { SCENE_ELEMENT_HIDDEN } from "@/lib/scene-elements";
import { SCENE_LOCKED_STATUS } from "@/lib/status";
import { sessionHeadingOf } from "@/lib/stories";

const {
  elements,
  stories,
  storyPlayers,
  sceneElements,
  storyScenes,
  vSceneElements,
  vStoryScenes,
} = schema;

// An element of the story as the storyteller's table and the element panel
// read and change it, apart from any scene: its fields, its status in the
// story, its picture, its tags and its history. What a link to a scene
// holds is components/scene-elements/actions.ts; what the prep board's forms
// write is components/prep/actions.ts. Every action here starts with
// requireAccount().

/** One scene an element has been in, as the panel's History lists it. */
export type ElementHistoryRow = {
  idStoryScene: number;
  title: string;
  /** As the database has it, a story_scenes workflow key. */
  status: string;
  /** The sitting it was played in, "3. Kildealg", or null while it waits. */
  sessionHeading: string | null;
  /** When it was last played, as an ISO string, or null for a scene never played. */
  at: string | null;
};

export type ElementHistoryPage = { rows: ElementHistoryRow[]; hasMore: boolean };

/**
 * The scenes of the story an element is linked to, other than the one
 * given, most recently played first (active_at, which the scene workflow
 * restamps each time a scene goes into play) with scenes never played last,
 * ELEMENT_HISTORY_PAGE_SIZE at a time from `offset`. For the element panel's
 * History, at the storyteller's table and on a scene's preview. One more
 * row than the page is asked for, so `hasMore` is known without a count.
 *
 * The storyteller sees every link; a player only the scenes played to
 * completion in which the element is not hidden: a scene still waiting or
 * in play is prep, which the prep board keeps from them
 * (components/prep/actions.ts), and a hidden link is one their table never
 * showed. Null when the story is not the
 * caller's to tell or play, or the element is not the story's, the two one
 * answer as loadPlayStory's are.
 */
export async function sa_listElementHistory(
  idStory: number,
  idElement: number,
  exceptIdStoryScene: number | null,
  offset: number,
): Promise<ElementHistoryPage | null> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const element = idSchema.safeParse(idElement);
  const except = idSchema.nullable().safeParse(exceptIdStoryScene);
  const skip = offsetSchema.safeParse(offset);
  if (!story.success || !element.success || !except.success || !skip.success) return null;

  const seated = exists(
    db
      .select({ one: storyPlayers.idStoryPlayer })
      .from(storyPlayers)
      .where(and(eq(storyPlayers.idStory, stories.idStory), eq(storyPlayers.idUser, user.id))),
  );
  const [access] = await db
    .select({ isOwner: eq(stories.idCreatedByUser, user.id).mapWith(Boolean) })
    .from(stories)
    .where(and(eq(stories.idStory, story.data), or(eq(stories.idCreatedByUser, user.id), seated)))
    .limit(1);
  if (!access) return null;
  const [owned] = await db
    .select({ idElement: elements.idElement })
    .from(elements)
    .where(and(eq(elements.idElement, element.data), eq(elements.idStory, story.data)))
    .limit(1);
  if (!owned) return null;

  const rows = await db
    .select({
      idStoryScene: vStoryScenes.idStoryScene,
      title: vStoryScenes.sceneTitle,
      status: vStoryScenes.status,
      idStorySession: vStoryScenes.idStorySession,
      sessionNumber: vStoryScenes.sessionNumber,
      sessionTitle: vStoryScenes.sessionTitle,
      activeAt: vStoryScenes.activeAt,
    })
    .from(sceneElements)
    .innerJoin(vStoryScenes, eq(vStoryScenes.idStoryScene, sceneElements.idStoryScene))
    .where(
      and(
        eq(sceneElements.idElement, element.data),
        eq(vStoryScenes.idStory, story.data),
        except.data === null ? undefined : ne(sceneElements.idStoryScene, except.data),
        access.isOwner ? undefined : ne(sceneElements.status, SCENE_ELEMENT_HIDDEN),
        access.isOwner ? undefined : eq(vStoryScenes.status, SCENE_LOCKED_STATUS),
      ),
    )
    .orderBy(sql`${vStoryScenes.activeAt} desc nulls last`, desc(vStoryScenes.idStoryScene))
    .limit(ELEMENT_HISTORY_PAGE_SIZE + 1)
    .offset(skip.data);

  const page = rows.slice(0, ELEMENT_HISTORY_PAGE_SIZE);
  return {
    hasMore: rows.length > ELEMENT_HISTORY_PAGE_SIZE,
    rows: page.map((row) => ({
      idStoryScene: row.idStoryScene!,
      title: row.title ?? "",
      status: row.status ?? "",
      sessionHeading: sessionHeadingOf(row),
      at: row.activeAt ? row.activeAt.toISOString() : null,
    })),
  };
}

/**
 * The scene's elements of one kind, for the library's Scene only: the first
 * RUN_LIST_SIZE that match the search box, in the sort the library's menu
 * asks for (elementOrderBy), by name unless told otherwise. The view holds
 * the element's columns but not every one the sorts need, so the elements
 * table is joined for the order. Nothing for a scene that is not the
 * caller's, nor for a search that is out of bounds.
 */
export async function sa_listSceneLibraryElements(
  idStory: number,
  idStoryScene: number,
  kind: ElementKind,
  query: string = "",
  sort: ElementSort = "name",
): Promise<StoryElement[]> {
  const user = await requireAccount();
  // The same bound as sa_listStoryElements' search, refused the same way.
  const needle = searchSchema.safeParse(query);
  const order = z.enum(ELEMENT_SORT_KEYS).safeParse(sort);
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!needle.success || !order.success || !story.success || !scene.success) return [];
  if (!isElementKind(kind)) return [];
  // A read: a complete scene's library is still read.
  const owned = await ownedScene(user.id, scene.data, { idStory: story.data, allowLocked: true });
  if (!owned.ok) return [];

  const rows = await db
    .select({
      idElement: vSceneElements.idElement,
      status: vSceneElements.elementStatus,
      name: vSceneElements.name,
      title: vSceneElements.title,
      description: vSceneElements.description,
    })
    .from(vSceneElements)
    .innerJoin(elements, eq(elements.idElement, vSceneElements.idElement))
    .where(
      and(
        eq(vSceneElements.idStoryScene, scene.data),
        eq(vSceneElements.idStory, story.data),
        eq(vSceneElements.kind, kind),
        needle.data === ""
          ? undefined
          : ilike(vSceneElements.elementSearchText, likeContains(needle.data)),
      ),
    )
    .orderBy(...elementOrderBy(order.data))
    .limit(RUN_LIST_SIZE);
  // The view's columns are all nullable to Drizzle; a link always has its
  // element. An element in the scene more than once is one row per link
  // here, and listed once.
  const seen = new Set<number>();
  return rows
    .filter((row) => (seen.has(row.idElement!) ? false : (seen.add(row.idElement!), true)))
    .map((row) => ({
      idElement: row.idElement!,
      status: row.status ?? "",
      name: row.name ?? "",
      title: row.title,
      description: row.description,
    }));
}

export type UpdateStoryElementResult =
  { ok: true; element: ElementDetail } | { ok: false; errors: Record<string, string> };

/**
 * The library info popover's edit: the element's own fields and its status
 * in the story, whether or not it is in any scene, so nothing about a scene
 * is read or written. A status that has not changed is not written, as
 * sa_updateSceneElement does not, and one off the workflow comes back as
 * the field's error. The element comes back as it now is.
 *
 * A story the caller does not tell, and an element not in it, come back as
 * `root`.
 */
export async function sa_updateStoryElement(
  idStory: number,
  idElement: number,
  input: unknown,
): Promise<UpdateStoryElementResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const element = idSchema.safeParse(idElement);
  if (!story.success) return { ok: false, errors: { root: NOT_THIS_STORY } };
  if (!element.success) return { ok: false, errors: { root: NOT_THIS_STORYS_ELEMENT } };
  if ((await ownedStory(user.id, story.data)) === null) {
    return { ok: false, errors: { root: NOT_THIS_STORY } };
  }

  const parsed = runStoryElementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error) };
  const values = parsed.data;
  const options = await listStatusOptions("elements");
  if (!options.some((option) => option.key === values.status)) {
    return { ok: false, errors: { status: "Choose one of the element's statuses." } };
  }

  const current = await ownedElement(user.id, element.data, { idStory: story.data });
  if (!current) return { ok: false, errors: { root: NOT_THIS_STORYS_ELEMENT } };

  try {
    await db
      .update(elements)
      .set({
        ...elementColumns(values),
        ...(values.status !== current.status ? { status: values.status } : {}),
        idUpdatedByUser: user.id,
      })
      .where(and(eq(elements.idElement, element.data), eq(elements.idStory, story.data)));
  } catch (error) {
    // The transition trigger raises rather than returns; see sa_updateSceneElement.
    // Anything else that went wrong is still an error.
    if (!isTransitionRefusal(error)) throw error;
    return { ok: false, errors: { root: STATUS_REFUSED } };
  }

  publishLater(() => publishElementChanged(story.data, element.data));

  const detail = await elementDetail(story.data, element.data);
  if (!detail) return { ok: false, errors: { root: NOT_THIS_STORYS_ELEMENT } };
  return { ok: true, element: detail };
}

/** The element as the story holds it, for the panel; null when it is not the story's. */
async function elementDetail(idStory: number, idElement: number): Promise<ElementDetail | null> {
  const [row] = await db
    .select({
      idElement: elements.idElement,
      kind: elements.kind,
      name: elements.name,
      initialName: elements.initialName,
      title: elements.title,
      description: elements.description,
      notes: elements.notes,
      imageUrl: attachmentUrl("ELEMENT", "elements", "id_element"),
      status: elements.status,
      tags: elements.tags,
      url: elements.url,
      urlText: elements.urlText,
    })
    .from(elements)
    .where(and(eq(elements.idElement, idElement), eq(elements.idStory, idStory)))
    .limit(1);
  return row ?? null;
}

/**
 * Everything the element panel shows, from a pill or from the library: the
 * element as the story holds it, whether or not it is in a scene, and its
 * link to the scene the table is on (`idStoryScene`, null for none), or null
 * when it is not in that scene. The link decides whether the panel shows
 * the scene's part: its status, its stack tags and Remove from scene.
 * Asked for as the panel opens, so the play space and the library stay
 * light and the panel shows what is stored now, the status menu's last
 * choice included. The link is the one named (a pill's), or, from the
 * library, the element's first link to the scene, since an element may be
 * in a scene more than once. Null when the story is not the caller's or the
 * element is not the story's.
 */
export async function sa_getElementDetail(
  idStory: number,
  idElement: number,
  idStoryScene: number | null = null,
  idSceneElement: number | null = null,
): Promise<ElementPanelDetail | null> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const element = idSchema.safeParse(idElement);
  const scene = idSchema.nullable().safeParse(idStoryScene);
  const named = idSchema.nullable().safeParse(idSceneElement);
  if (!story.success || !element.success || !scene.success || !named.success) return null;
  if ((await ownedStory(user.id, story.data)) === null) return null;

  const row = await elementDetail(story.data, element.data);
  if (!row) return null;

  // The scene comes from the page, so it only counts when it is this
  // story's: nothing in the database holds a link's two halves to one story.
  const [link] =
    scene.data === null
      ? []
      : await db
          .select({
            idSceneElement: sceneElements.idSceneElement,
            status: sceneElements.status,
            tags: sceneElements.tags,
            showInfo: sceneElements.showInfo,
            url: sceneElements.url,
            urlText: sceneElements.urlText,
            label: sceneElements.label,
            createdAt: sceneElements.createdAt,
          })
          .from(sceneElements)
          .innerJoin(storyScenes, eq(storyScenes.idStoryScene, sceneElements.idStoryScene))
          .where(
            and(
              eq(sceneElements.idStoryScene, scene.data),
              eq(sceneElements.idElement, row.idElement),
              eq(storyScenes.idStory, story.data),
              named.data === null ? undefined : eq(sceneElements.idSceneElement, named.data),
            ),
          )
          .orderBy(asc(sceneElements.idSceneElement))
          .limit(1);
  return { element: row, link: link ?? null };
}

export type SetElementImageResult =
  { ok: true; imageUrl: string | null } | { ok: false; error: string };

/**
 * A pill's + for a picture, and the info panel's Add picture and −: makes
 * one of the story's attachments the element's picture, its ELEMENT use in
 * attachment_uses tagged cover (setCover), picked from the story's pool or a
 * scene's pictures, or with null takes the picture away (clearCover). An
 * element shows one picture, so whatever use it had goes first; the
 * attachment is only used, not moved, so it stays in its lists either way.
 * The picture is the element's, in every scene, and not part of what a scene
 * holds, so a complete scene does not refuse it.
 *
 * Refused when the story is not the caller's, the element is not the
 * story's, or the attachment is not one of the story's finished ones.
 */
export async function sa_setElementImage(
  idStory: number,
  idElement: number,
  idAttachment: number | null,
): Promise<SetElementImageResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const element = idSchema.safeParse(idElement);
  const attachment = idSchema.nullable().safeParse(idAttachment);
  if (!story.success || (await ownedStory(user.id, story.data)) === null) {
    return { ok: false, error: NOT_THIS_STORY };
  }
  if (!element.success) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };
  if (!attachment.success) return { ok: false, error: NOT_THIS_STORYS_PICTURE };
  if ((await ownedElement(user.id, element.data, { idStory: story.data })) === null) {
    return { ok: false, error: NOT_THIS_STORYS_ELEMENT };
  }

  const url = attachment.data === null ? null : await storyPictureUrl(story.data, attachment.data);
  if (attachment.data !== null && url === null) {
    return { ok: false, error: NOT_THIS_STORYS_PICTURE };
  }

  const holder = { kind: "ELEMENT", idExternal: element.data } as const;
  await db.transaction(async (tx) => {
    if (attachment.data === null) await clearCover(holder, user.id, {}, tx);
    else await setCover(holder, attachment.data, user.id, tx);
  });
  publishLater(() => publishElementChanged(story.data, element.data));
  return { ok: true, imageUrl: url };
}

export type SetElementTagsResult = { ok: true; tags: string[] } | { ok: false; error: string };

/**
 * The element panel's Tags editor: the element's own tags (elements.tags),
 * replaced whole with what the editor now holds, trimmed, lower-cased and
 * deduplicated (elementTagsSchema). The tags as saved come back for the
 * row. The players' table is told, since the element went out whole.
 *
 * Refused when the story is not the caller's, when the element is not the
 * story's, and for a tag the schema will not take, with its message.
 */
export async function sa_setElementTags(
  idStory: number,
  idElement: number,
  tags: unknown,
): Promise<SetElementTagsResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const element = idSchema.safeParse(idElement);
  if (!story.success || (await ownedStory(user.id, story.data)) === null) {
    return { ok: false, error: NOT_THIS_STORY };
  }
  if (!element.success) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };
  const parsed = elementTagsSchema.safeParse(tags);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Those tags could not be saved.",
    };
  }

  const updated = await db
    .update(elements)
    .set({ tags: parsed.data, idUpdatedByUser: user.id })
    .where(and(eq(elements.idElement, element.data), eq(elements.idStory, story.data)))
    .returning({ tags: elements.tags });
  if (updated.length === 0) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };
  publishLater(() => publishElementChanged(story.data, element.data));
  return { ok: true, tags: updated[0].tags };
}
