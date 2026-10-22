"use server";

import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { likeContains } from "@/lib/filter-text";
import type { RunScene } from "@/lib/run";
import { publishLater } from "@/lib/realtime/publish";
import { publishSceneChanged } from "@/lib/realtime/publish-scene";
import { liveSceneTextSchema } from "@/lib/scene-schemas";
import { SCENE_LOCKED_STATUS, type SetSceneTextResult } from "@/lib/scenes";
import { sessionHeading } from "@/lib/stories";

const { stories, storyScenes, storySessions, vStoryScenes } = schema;

// The same int4 range as everywhere a story or scene id comes in.
const idSchema = z.number().int().min(-2147483648).max(2147483647);

const NOT_THIS_STORY = "That scene is not part of this story.";
const NOT_THIS_STORYS_SESSION = "That session is not part of this story.";
const SCENE_COMPLETE = "That scene is complete, so nothing in it can change.";
const COMPLETE_NEEDS_SESSION = "A complete scene was played in a session, so it keeps one.";

/**
 * The scene's status when it is a scene of this story told by the caller,
 * or null when it is not: the check both actions here start with, as the
 * run page's ownedScene is for its own.
 */
async function ownedSceneStatus(
  userId: string,
  idStory: number,
  idStoryScene: number,
): Promise<string | null> {
  const [row] = await db
    .select({ status: storyScenes.status })
    .from(storyScenes)
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .where(
      and(
        eq(storyScenes.idStoryScene, idStoryScene),
        eq(storyScenes.idStory, idStory),
        eq(stories.idCreatedByUser, userId),
      ),
    )
    .limit(1);
  return row?.status ?? null;
}

/** Field errors from a failed parse, keyed by the path the form names. */
function formErrors(issues: z.core.$ZodIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[issue.path.join(".")] ??= issue.message;
  return errors;
}

/**
 * The panel behind the scene's title on the live-edit page: the run page's
 * sa_setSceneText with the scene's title as well, since this page has no
 * other place to rename it. Every players' table hears the scene changed
 * and reads it afresh, the new title included.
 *
 * Refused for a scene that is not this story's or the caller is not its
 * storyteller, and for a complete one, whose panel the page shows read only
 * as the run page does; field errors come back for the form.
 */
export async function sa_setLiveSceneText(
  idStory: number,
  idStoryScene: number,
  input: unknown,
): Promise<SetSceneTextResult> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return { ok: false, errors: { root: NOT_THIS_STORY } };
  const status = await ownedSceneStatus(user.id, story.data, scene.data);
  if (status === null) return { ok: false, errors: { root: NOT_THIS_STORY } };
  if (status === SCENE_LOCKED_STATUS) return { ok: false, errors: { root: SCENE_COMPLETE } };

  const parsed = liveSceneTextSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error.issues) };
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
 * complete scene, which was played somewhere.
 */
export async function sa_setLiveSceneSession(
  idStory: number,
  idStoryScene: number,
  idStorySession: number | null,
): Promise<SetLiveSceneSessionResult> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  const session = idSchema.nullable().safeParse(idStorySession);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  if (!session.success) return { ok: false, error: NOT_THIS_STORYS_SESSION };

  const status = await ownedSceneStatus(user.id, story.data, scene.data);
  if (status === null) return { ok: false, error: NOT_THIS_STORY };
  if (session.data === null && status === SCENE_LOCKED_STATUS) {
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

// How many scenes the header's selector lists for one search.
const LIVE_SCENES_LIST_SIZE = 20;

// What the selector narrows by, bounded as the board's searches are: words,
// the statuses still switched on, and the sittings chosen.
const liveSceneSearchSchema = z.object({
  query: z.string().max(200),
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
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const parsed = liveSceneSearchSchema.safeParse(search);
  if (!story.success || !parsed.success) return [];

  const [owned] = await db
    .select({ owner: stories.idCreatedByUser })
    .from(stories)
    .where(eq(stories.idStory, story.data))
    .limit(1);
  if (owned?.owner !== user.id) return [];

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
    sessionHeading:
      row.idStorySession === null || row.sessionNumber === null
        ? null
        : sessionHeading({ number: row.sessionNumber, title: row.sessionTitle }),
  }));
}
