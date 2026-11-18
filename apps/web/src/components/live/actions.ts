"use server";

import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { idSchema, searchSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import { clearCover } from "@/db/covers";
import { spaceFor } from "@/db/scene-space";
import { createScene } from "@/db/scenes";
import { ownedScene, ownedStory } from "@/db/story-access";
import { requireAccount } from "@/lib/authorize";
import { likeContains } from "@/lib/filter-text";
import type { RunPlaySpace, RunScene } from "@/lib/run";
import { publishLater } from "@/lib/realtime/publish";
import { publishSceneChanged } from "@/lib/realtime/publish-scene";
import { liveSceneTextSchema, runSceneSchema } from "@/lib/scene-schemas";
import { duplicateSceneTitle, type SetSceneTextResult } from "@/lib/scenes";
import { sessionHeadingOf } from "@/lib/stories";
import { formErrors } from "@/lib/forms";
import { SCENE_LOCKED_STATUS, SCENE_PENDING_STATUS } from "@/lib/status";
import {
  COMPLETE_NEEDS_SESSION,
  NOT_THIS_STORY,
  NOT_THIS_STORYS_SESSION,
  SCENE_COMPLETE,
} from "@/lib/messages";

const { attachmentUses, sceneElements, storyScenes, storySessions, vStoryScenes } = schema;

// The live-edit page's own writes to a scene: its text and title, the
// sitting it is in, a copy of it, its cover, and the selector's search and
// Create new scene. Every action here starts with requireAccount() and
// holds the scene to a story the caller tells (ownedScene).

/**
 * The panel behind the scene's title on the live-edit page: the run page's
 * sa_setSceneText with the scene's title as well, since this page has no
 * other place to rename it. Every players' table hears the scene changed
 * and reads it afresh, the new title included.
 *
 * Refused for a scene that is not this story's or the caller is not its
 * storyteller, and for a complete one, whose panel the page shows read only
 * (ownedScene's lock, which the run page's panel alone sets aside); field
 * errors come back for the form.
 */
export async function sa_setLiveSceneText(
  idStory: number,
  idStoryScene: number,
  input: unknown,
): Promise<SetSceneTextResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return { ok: false, errors: { root: NOT_THIS_STORY } };
  const owned = await ownedScene(user.id, scene.data, { idStory: story.data });
  if (!owned.ok) {
    const root = owned.reason === "locked" ? SCENE_COMPLETE : NOT_THIS_STORY;
    return { ok: false, errors: { root } };
  }

  const parsed = liveSceneTextSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error) };
  const text = { description: parsed.data.description || null, notes: parsed.data.notes || null };

  await db
    .update(storyScenes)
    .set({
      sceneTitle: parsed.data.title,
      sceneDescription: text.description,
      notes: text.notes,
      idUpdatedByUser: user.id,
    })
    .where(and(eq(storyScenes.idStoryScene, scene.data), eq(storyScenes.idStory, story.data)));
  publishLater(() => publishSceneChanged(story.data));
  return { ok: true, text, title: parsed.data.title };
}

export type SetLiveSceneSessionResult =
  { ok: true; idStorySession: number | null } | { ok: false; error: string };

/**
 * The session select in the live-edit page's header: the sitting the scene
 * was played in (story_scenes.id_story_session), or null for none, saved as
 * it is chosen. The session's own pointer to the scene it is on is left
 * alone: choosing where a scene was played is not putting the table on it.
 *
 * Refused for a scene that is not this story's or the caller is not its
 * storyteller, for a session of another story, and for no session on a
 * complete scene, which was played somewhere. A complete scene's sitting
 * may otherwise be changed: where it was played is a fact about the record,
 * not the record itself.
 */
export async function sa_setLiveSceneSession(
  idStory: number,
  idStoryScene: number,
  idStorySession: number | null,
): Promise<SetLiveSceneSessionResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  const session = idSchema.nullable().safeParse(idStorySession);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  if (!session.success) return { ok: false, error: NOT_THIS_STORYS_SESSION };

  const owned = await ownedScene(user.id, scene.data, { idStory: story.data, allowLocked: true });
  if (!owned.ok) return { ok: false, error: NOT_THIS_STORY };
  if (session.data === null && owned.scene.status === SCENE_LOCKED_STATUS) {
    return { ok: false, error: COMPLETE_NEEDS_SESSION };
  }

  if (session.data !== null) {
    const [row] = await db
      .select({ idStorySession: storySessions.idStorySession })
      .from(storySessions)
      .where(
        and(eq(storySessions.idStorySession, session.data), eq(storySessions.idStory, story.data)),
      )
      .limit(1);
    if (!row) return { ok: false, error: NOT_THIS_STORYS_SESSION };
  }

  await db
    .update(storyScenes)
    .set({ idStorySession: session.data, idUpdatedByUser: user.id })
    .where(and(eq(storyScenes.idStoryScene, scene.data), eq(storyScenes.idStory, story.data)));
  return { ok: true, idStorySession: session.data };
}

export type DuplicateLiveSceneResult =
  { ok: true; idStoryScene: number } | { ok: false; error: string };

/**
 * The Duplicate beside the header's selector: a new scene made from this
 * one, to be prepared, named with " (copy)" after the title
 * (duplicateSceneTitle) and carrying the scene's description, notes,
 * stacks and pictures, and every element in it with its link as it stands
 * in the scene: standing, stack, which field its pill shows, whether its
 * info and its picture are shown, its link, and the link's own pictures.
 * A scene is often split in two or run again with the same cast, and
 * building the second by hand is the work this saves. The copy is pending
 * whatever the original's status, said outright rather than left to the
 * column's default, since it is a scene still to be played, and it is in
 * the original's sitting, except that a complete original's sitting is
 * history, so its copy waits in no session for the storyteller to place.
 * One transaction, so the copy is whole or not there. Nothing is
 * published: no table is on a scene that did not exist a moment ago.
 *
 * Refused for a scene that is not this story's or the caller is not its
 * storyteller. A complete scene may be copied: the copy is new, the
 * original untouched.
 */
export async function sa_duplicateLiveScene(
  idStory: number,
  idStoryScene: number,
): Promise<DuplicateLiveSceneResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  const owned = await ownedScene(user.id, scene.data, { idStory: story.data, allowLocked: true });
  if (!owned.ok) return { ok: false, error: NOT_THIS_STORY };
  const source = owned.scene;

  const created = await db.transaction(async (tx) => {
    const [notes] = await tx
      .select({ notes: storyScenes.notes })
      .from(storyScenes)
      .where(eq(storyScenes.idStoryScene, scene.data))
      .limit(1);
    // The tags are written out even when empty: the standard-tags trigger
    // fills an empty array with the story's, and a copy keeps its original's.
    const copy = await createScene(
      {
        idStory: story.data,
        status: SCENE_PENDING_STATUS,
        idStorySession: source.status === SCENE_LOCKED_STATUS ? null : source.idStorySession,
        title: duplicateSceneTitle(source.title),
        description: source.description,
        notes: notes?.notes ?? null,
        tags: source.tags,
        userId: user.id,
      },
      tx,
    );

    const links = await tx
      .select({
        idSceneElement: sceneElements.idSceneElement,
        idElement: sceneElements.idElement,
        status: sceneElements.status,
        tags: sceneElements.tags,
        elementShowing: sceneElements.elementShowing,
        showInfo: sceneElements.showInfo,
        showImage: sceneElements.showImage,
        url: sceneElements.url,
        urlText: sceneElements.urlText,
        label: sceneElements.label,
        // The link's own copy of the stat blocks, as play left it, not the
        // element's baseline: the copy is of the scene as it stands.
        statBlocks: sceneElements.statBlocks,
      })
      .from(sceneElements)
      .where(eq(sceneElements.idStoryScene, scene.data))
      .orderBy(sceneElements.idSceneElement);
    // Which new link stands for which old one, for the links' pictures
    // below. One insert per link: an element may be in the scene more than
    // once, so the element cannot say which copy is which.
    const copied = new Map<number, number>();
    for (const { idSceneElement, ...link } of links) {
      const [made] = await tx
        .insert(sceneElements)
        .values({
          ...link,
          idStoryScene: copy,
          idCreatedByUser: user.id,
          idUpdatedByUser: user.id,
        })
        .returning({ idSceneElement: sceneElements.idSceneElement });
      copied.set(idSceneElement, made.idSceneElement);
    }

    // The scene's pictures and the links', each use on the copy of its
    // holder, in the holder's own order (sort_order kept). id_story is the
    // trigger's to fill, as every insert here leaves it.
    const uses = await tx
      .select({
        idAttachment: attachmentUses.idAttachment,
        kind: attachmentUses.kind,
        idExternal: attachmentUses.idExternal,
        sortOrder: attachmentUses.sortOrder,
        tags: attachmentUses.tags,
      })
      .from(attachmentUses)
      .where(
        or(
          and(eq(attachmentUses.kind, "STORY_SCENE"), eq(attachmentUses.idExternal, scene.data)),
          and(
            eq(attachmentUses.kind, "SCENE_ELEMENT"),
            inArray(attachmentUses.idExternal, [...copied.keys(), -1]),
          ),
        ),
      );
    if (uses.length > 0) {
      await tx.insert(attachmentUses).values(
        uses.map((use) => ({
          idAttachment: use.idAttachment,
          kind: use.kind,
          idExternal: use.kind === "STORY_SCENE" ? copy : copied.get(use.idExternal)!,
          sortOrder: use.sortOrder,
          tags: use.tags,
          idCreatedByUser: user.id,
          idUpdatedByUser: user.id,
        })),
      );
    }
    return copy;
  });

  return { ok: true, idStoryScene: created };
}

export type ClearLiveSceneCoverResult = { ok: true } | { ok: false; error: string };

/**
 * The cover icon in the corner of the live-edit page's play space: takes the
 * cover off the scene (clearCover). The picture stays among the scene's
 * pictures, only its use loses the cover tag, as the Cover button on its
 * card would take it off (sa_setAttachmentCover), so nothing is lost that
 * was not asked for; it can be made the cover again from the scene's
 * Pictures. A scene with no cover is left as it is. Every table is told the
 * scene changed, since the players' table draws the scene behind its cover
 * and the scene may be the one being played.
 *
 * Refused for a scene that is not this story's or the caller is not its
 * storyteller; a complete scene's cover may still be taken off, as it could
 * from its Pictures.
 */
export async function sa_clearLiveSceneCover(
  idStory: number,
  idStoryScene: number,
): Promise<ClearLiveSceneCoverResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  const owned = await ownedScene(user.id, scene.data, { idStory: story.data, allowLocked: true });
  if (!owned.ok) return { ok: false, error: NOT_THIS_STORY };

  await clearCover({ kind: "STORY_SCENE", idExternal: scene.data }, user.id);
  publishLater(() => publishSceneChanged(story.data));
  return { ok: true };
}

export type CreateLiveSceneResult =
  { ok: true; space: RunPlaySpace } | { ok: false; errors: Record<string, string> };

/**
 * The live-edit page's selector's Create new scene, which makes the scene
 * to be prepared rather than played: in the workflow's default and in no
 * sitting, whether or not a session is being played, and with the session
 * left on whatever scene it was on, unlike the run table's sa_createRunScene.
 * The page then goes to the new scene's own live-edit page.
 *
 * Field errors come back for the form, and a story the caller does not tell
 * as `root`.
 */
export async function sa_createLiveScene(
  idStory: number,
  input: unknown,
): Promise<CreateLiveSceneResult> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStory);
  if (!id.success || (await ownedStory(user.id, id.data)) === null) {
    return { ok: false, errors: { root: NOT_THIS_STORY } };
  }

  const parsed = runSceneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error) };

  const idStoryScene = await createScene({
    idStory: id.data,
    title: parsed.data.title,
    description: parsed.data.description,
    userId: user.id,
  });
  return { ok: true, space: await spaceFor(id.data, idStoryScene) };
}

// How many scenes the header's selector lists for one search.
const LIVE_SCENES_LIST_SIZE = 20;

// What the selector narrows by, bounded as the board's searches are: words,
// the statuses still switched on, and the sittings chosen.
const liveSceneSearchSchema = z.object({
  query: searchSchema,
  statuses: z.array(z.string().min(1).max(64)).max(50),
  sessions: z.array(idSchema).max(500),
});

/**
 * The live-edit page's scene selector: the story's scenes that match what
 * was typed (v_story_scenes.search_text, as the board's Scenes column
 * searches) and hold one of the statuses still switched on. The scenes in
 * no session, the ones still being prepared, are always among them; the
 * sessions chosen add the scenes played in those, so with none chosen,
 * where the selector starts, it is the unplayed ones alone. The unplayed
 * come first, then each sitting's scenes, the latest sitting first, and
 * within each the most recently touched first: LIVE_SCENES_LIST_SIZE of
 * them, each with the sitting it was played in.
 *
 * Nothing for anyone but the story's storyteller, nor for a search that is
 * out of bounds.
 */
export async function sa_searchLiveScenes(
  idStory: number,
  search: { query: string; statuses: string[]; sessions: number[] },
): Promise<RunScene[]> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const parsed = liveSceneSearchSchema.safeParse(search);
  if (!story.success || !parsed.success) return [];
  if ((await ownedStory(user.id, story.data)) === null) return [];

  const { query, statuses, sessions } = parsed.data;
  const needle = query.trim();
  // No status switched on lists nothing, as the board's pills do.
  if (statuses.length === 0) return [];

  const rows = await db
    .select({
      idStoryScene: vStoryScenes.idStoryScene,
      title: vStoryScenes.sceneTitle,
      status: vStoryScenes.status,
      idStorySession: vStoryScenes.idStorySession,
      sessionNumber: vStoryScenes.sessionNumber,
      sessionTitle: vStoryScenes.sessionTitle,
    })
    .from(vStoryScenes)
    .where(
      and(
        eq(vStoryScenes.idStory, story.data),
        inArray(vStoryScenes.status, statuses),
        sessions.length === 0
          ? isNull(vStoryScenes.idStorySession)
          : or(isNull(vStoryScenes.idStorySession), inArray(vStoryScenes.idStorySession, sessions)),
        needle === "" ? undefined : ilike(vStoryScenes.searchText, likeContains(needle)),
      ),
    )
    // session_number is null for a scene in no session, which NULLS FIRST
    // puts ahead of the sittings, newest of them first.
    .orderBy(
      sql`${vStoryScenes.sessionNumber} desc nulls first`,
      desc(vStoryScenes.updatedAt),
      desc(vStoryScenes.idStoryScene),
    )
    .limit(LIVE_SCENES_LIST_SIZE);

  return rows.map((row) => ({
    idStoryScene: row.idStoryScene!,
    title: row.title!,
    status: row.status!,
    sessionHeading: sessionHeadingOf(row),
  }));
}
