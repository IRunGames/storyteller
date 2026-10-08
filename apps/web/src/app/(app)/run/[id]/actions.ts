"use server";

import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { ELEMENT_KINDS, isElementKind } from "@/lib/elements";
import { RUN_SCENES_LIST_SIZE, type PlayItem, type RunPlaySpace, type RunScene } from "@/lib/run";
import { runSceneSchema } from "@/lib/scene-schemas";

const { stories, storyScenes, storySessions, vSceneElements } = schema;

// The same int4 range as everywhere a story or scene id comes in.
const idSchema = z.number().int().min(-2147483648).max(2147483647);

// The session statuses in which a session is being played, the same two
// hasOpenSession reads; see db/open-session.ts for why they are named here.
const PLAYING = ["OPEN", "RESUMED"];

// The scene status a scene is in while it is being played. The table moves
// a scene to it when the storyteller chooses it; the workflow lets every
// status reach it.
const ACTIVE = "ACTIVE";

const EMPTY: RunPlaySpace = { scene: null, inPlay: [] };

const NO_SESSION = "Start a session before choosing a scene.";
const NOT_THIS_STORY = "That scene is not part of this story.";

/**
 * The session being played at a story the caller tells, or null: when the
 * story is someone else's, when it has no current session, or when that
 * session is paused or finished.
 */
async function playingSession(userId: string, idStory: number): Promise<number | null> {
  const [row] = await db
    .select({ idStorySession: storySessions.idStorySession })
    .from(stories)
    .innerJoin(storySessions, eq(storySessions.idStorySession, stories.idStorySession))
    .where(
      and(
        eq(stories.idStory, idStory),
        eq(stories.idCreatedByUser, userId),
        inArray(storySessions.status, PLAYING),
      ),
    )
    .limit(1);
  return row?.idStorySession ?? null;
}

/** Whether the caller is the storyteller who created the story. */
async function ownsStory(userId: string, idStory: number): Promise<boolean> {
  const [row] = await db
    .select({ owner: stories.idCreatedByUser })
    .from(stories)
    .where(eq(stories.idStory, idStory))
    .limit(1);
  return row?.owner === userId;
}

/**
 * The play space for one scene of the story: the elements brought into it
 * (scene_elements) in the kinds' order, People to
 * Ephemera, as the library tabs list them, and by name within a kind. The
 * elements' keys are the library's own, so one already here cannot be added
 * again from the library.
 */
async function spaceFor(idStory: number, idStoryScene: number): Promise<RunPlaySpace> {
  const [scene] = await db
    .select({
      idStoryScene: storyScenes.idStoryScene,
      title: storyScenes.sceneTitle,
      status: storyScenes.status,
    })
    .from(storyScenes)
    .where(and(eq(storyScenes.idStoryScene, idStoryScene), eq(storyScenes.idStory, idStory)))
    .limit(1);
  if (!scene) return EMPTY;

  const rows = await db
    .select({
      idElement: vSceneElements.idElement,
      kind: vSceneElements.kind,
      name: vSceneElements.name,
      title: vSceneElements.title,
    })
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
  const elements = rows
    .filter((row) => isElementKind(row.kind) && row.idElement !== null && row.name !== null)
    .sort((a, b) => order(a.kind!) - order(b.kind!))
    .map((row): PlayItem => ({
      key: `${row.kind}:${row.idElement}`,
      kind: row.kind as PlayItem["kind"],
      label: row.name!,
      detail: row.title,
      imageUrl: null,
    }));

  return {
    scene: { idStoryScene: scene.idStoryScene, title: scene.title, status: scene.status },
    inPlay: elements,
  };
}

/**
 * Makes a scene of the story the one the session is on: moves it to ACTIVE
 * unless it already is (the workflow stamps active_at as it does), records
 * this sitting as the one it was played in when it has none yet, and points
 * the session at it. A scene played in an earlier sitting keeps that one;
 * story_scenes.id_story_session is where it was first played.
 *
 * The scene the session was on before is left as it was. Whether it is
 * finished is the storyteller's call, made on its own pill.
 */
async function putSessionOn(
  userId: string,
  idStorySession: number,
  idStoryScene: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(storyScenes)
      .set({ status: ACTIVE, idUpdatedByUser: userId })
      .where(and(eq(storyScenes.idStoryScene, idStoryScene), ne(storyScenes.status, ACTIVE)));
    await tx
      .update(storyScenes)
      .set({ idStorySession, idUpdatedByUser: userId })
      .where(and(eq(storyScenes.idStoryScene, idStoryScene), isNull(storyScenes.idStorySession)));
    await tx
      .update(storySessions)
      .set({ idStoryScene, idUpdatedByUser: userId })
      .where(eq(storySessions.idStorySession, idStorySession));
  });
}

/**
 * What the storyteller's play space opens with: the scene the table is on,
 * then the elements brought into it, so the storyteller starts from what
 * they prepared for this moment rather than an empty space.
 *
 * The scene is the current session's id_story_scene, reached through the
 * story's pointer to that session, and only while the session is being
 * played: a paused or finished session has no table to put anything on.
 * With no such session, or a session on no scene, the space starts empty.
 *
 * Empty for anyone but the story's storyteller, as for a story that is not
 * there: the scene and its elements are their preparation.
 */
export async function sa_getRunPlaySpace(idStory: number): Promise<RunPlaySpace> {
  const user = await requireUser();

  const id = idSchema.safeParse(idStory);
  if (!id.success) return EMPTY;

  const session = await playingSession(user.id, id.data);
  if (session === null) return EMPTY;

  const [row] = await db
    .select({ idStoryScene: storySessions.idStoryScene })
    .from(storySessions)
    .where(eq(storySessions.idStorySession, session))
    .limit(1);
  if (row?.idStoryScene == null) return EMPTY;

  // spaceFor holds the scene to this story, which nothing in the database
  // does for a session's scene.
  return spaceFor(id.data, row.idStoryScene);
}

/**
 * The story's RUN_SCENES_LIST_SIZE most recently touched scenes, newest
 * first, for the header's scene selector. updated_at moves on every change,
 * a status included, so the scenes in play rise to the top. Nothing for
 * anyone but the storyteller.
 */
export async function sa_listRunScenes(idStory: number): Promise<RunScene[]> {
  const user = await requireUser();

  const id = idSchema.safeParse(idStory);
  if (!id.success) return [];
  if (!(await ownsStory(user.id, id.data))) return [];

  return db
    .select({
      idStoryScene: storyScenes.idStoryScene,
      title: storyScenes.sceneTitle,
      status: storyScenes.status,
    })
    .from(storyScenes)
    .where(eq(storyScenes.idStory, id.data))
    .orderBy(desc(storyScenes.updatedAt), desc(storyScenes.idStoryScene))
    .limit(RUN_SCENES_LIST_SIZE);
}

export type LoadRunSceneResult = { ok: true; space: RunPlaySpace } | { ok: false; error: string };

/**
 * Puts the session on a scene the storyteller chose from the header, and
 * answers with the play space for it. A PENDING or COMPLETE scene becomes
 * ACTIVE and an ACTIVE one is loaded as it is; the selector asks before it
 * sends a COMPLETE one, since that undoes a scene the storyteller finished.
 *
 * Refused when the scene is not this story's or the caller is not its
 * storyteller, which are one answer, and when no session is being played,
 * since there is no table to put the scene on.
 */
export async function sa_loadRunScene(
  idStory: number,
  idStoryScene: number,
): Promise<LoadRunSceneResult> {
  const user = await requireUser();

  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };

  const [owned] = await db
    .select({ idStoryScene: storyScenes.idStoryScene })
    .from(storyScenes)
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .where(
      and(
        eq(storyScenes.idStoryScene, scene.data),
        eq(storyScenes.idStory, story.data),
        eq(stories.idCreatedByUser, user.id),
      ),
    )
    .limit(1);
  if (!owned) return { ok: false, error: NOT_THIS_STORY };

  const session = await playingSession(user.id, story.data);
  if (session === null) return { ok: false, error: NO_SESSION };

  await putSessionOn(user.id, session, scene.data);
  return { ok: true, space: await spaceFor(story.data, scene.data) };
}

export type CreateRunSceneResult =
  { ok: true; space: RunPlaySpace } | { ok: false; errors: Record<string, string> };

/**
 * Writes a new scene from the header's Create new scene, in the session
 * being played, and puts the table on it at once, ACTIVE: a scene made at
 * the table is made to be played now. It is inserted with the workflow's
 * default and then moved, so the move stamps active_at as any other does.
 *
 * Field errors come back for the form, and a missing session as `root`.
 * Throws for a story the caller does not tell, as sa_createStoryScene does:
 * the page never offers the form to anyone else.
 */
export async function sa_createRunScene(
  idStory: number,
  input: unknown,
): Promise<CreateRunSceneResult> {
  const user = await requireUser();
  const id = idSchema.parse(idStory);
  if (!(await ownsStory(user.id, id))) {
    throw new Error("Only the storyteller who created a story can add scenes to it");
  }

  const parsed = runSceneSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
    return { ok: false, errors };
  }

  const session = await playingSession(user.id, id);
  if (session === null) return { ok: false, errors: { root: NO_SESSION } };

  const [created] = await db
    .insert(storyScenes)
    .values({
      idStory: id,
      sceneTitle: parsed.data.title,
      sceneDescription: parsed.data.description || null,
      idStorySession: session,
      idCreatedByUser: user.id,
      idUpdatedByUser: user.id,
    })
    .returning({ idStoryScene: storyScenes.idStoryScene });

  await putSessionOn(user.id, session, created.idStoryScene);
  return { ok: true, space: await spaceFor(id, created.idStoryScene) };
}
