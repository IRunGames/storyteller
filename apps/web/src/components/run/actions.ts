"use server";

import { and, desc, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
import { idSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import { insertChat } from "@/db/chats";
import { spaceFor } from "@/db/scene-space";
import { createScene } from "@/db/scenes";
import { ownedScene, ownedStory, playingSession, shownSession } from "@/db/story-access";
import { requireAccount } from "@/lib/authorize";
import { sceneEntryText } from "@/lib/chat";
import { formErrors } from "@/lib/forms";
import {
  CHANGE_FAILED,
  NOT_THIS_STORY,
  NO_SESSION_FOR_SCENE,
  NO_SUCH_STACK,
  SCENE_COMPLETE,
} from "@/lib/messages";
import type { PublicChat } from "@/lib/realtime/chat-events";
import { publishChat, publishLater } from "@/lib/realtime/publish";
import { publishSceneChanged } from "@/lib/realtime/publish-scene";
import {
  EMPTY_PLAY_SPACE,
  RUN_SCENES_LIST_SIZE,
  type RunPlaySpace,
  type RunScene,
} from "@/lib/run";
import { stackKey, withStackWide } from "@/lib/scene-elements";
import { runSceneSchema, sceneTextWithTitleSchema } from "@/lib/scene-schemas";
import { type SetSceneTextResult } from "@/lib/scenes";
import { sceneStacksSchema, stackWideSchema } from "@/lib/stack-schemas";
import { SCENE_LOCKED_STATUS } from "@/lib/status";
import { sessionHeadingOf } from "@/lib/stories";

const { sceneElements, stories, storyScenes, storySessions, vStoryScenes } = schema;

// The storyteller's table and the scene it is on: opening the play space,
// choosing and making scenes, and writing up the scene itself (its text and
// its stacks). What is in the scene is components/scene-elements/actions.ts,
// the element library components/elements/actions.ts, the session's
// controls components/sessions/actions.ts, and the join link the run
// page's own actions.ts beside it. Every action here starts with
// requireAccount() and answers only the story's storyteller.

/** The executor inside db.transaction, for a helper that may run within a caller's transaction. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The scene status a scene is in while it is being played. The table moves
// a scene to it when the storyteller chooses it; the workflow lets every
// status reach it.
const ACTIVE = "ACTIVE";

const EMPTY = EMPTY_PLAY_SPACE;

/**
 * The panel behind the scene's title: the scene's description and notes,
 * written as it is played, and the title too when the panel renames the
 * scene, as the storyboard's card does. A complete scene takes it all: the
 * notes on a scene are often written once it is done, and its name is
 * settled on the board where the whole story is read, so this is the one
 * panel that asks ownedScene to allow a locked scene. The tables' panels
 * send text alone and the name stays. The players' table hears the scene
 * changed and reads it afresh, the new title included.
 *
 * Refused for a scene that is not this story's or the caller is not its
 * storyteller; field errors come back for the form.
 */
export async function sa_setSceneText(
  idStory: number,
  idStoryScene: number,
  input: unknown,
): Promise<SetSceneTextResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return { ok: false, errors: { root: NOT_THIS_STORY } };
  const owned = await ownedScene(user.id, scene.data, { idStory: story.data, allowLocked: true });
  if (!owned.ok) return { ok: false, errors: { root: NOT_THIS_STORY } };

  const parsed = sceneTextWithTitleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error) };
  const { title } = parsed.data;
  const text = { description: parsed.data.description || null, notes: parsed.data.notes || null };

  await db
    .update(storyScenes)
    .set({
      ...(title === undefined ? {} : { sceneTitle: title }),
      sceneDescription: text.description,
      notes: text.notes,
      idUpdatedByUser: user.id,
    })
    .where(and(eq(storyScenes.idStoryScene, scene.data), eq(storyScenes.idStory, story.data)));
  publishLater(() => publishSceneChanged(story.data));
  return title === undefined ? { ok: true, text } : { ok: true, text, title };
}

/**
 * Makes a scene of the story the one the session is on: moves it to ACTIVE
 * unless it already is (the workflow stamps active_at as it does), records
 * this sitting as the one it was played in when it has none yet, and points
 * the session at it. A scene played in an earlier sitting keeps that one;
 * story_scenes.id_story_session is where it was first played.
 *
 * A COMPLETE scene is only looked at: the session points at it, so the
 * table shows it, but it stays complete and no sitting is recorded for it.
 *
 * The scene the session was on before is left as it was. Whether it is
 * finished is the storyteller's call, made on its own pill.
 *
 * When the session really moves (it was on another scene, or on none), the
 * table chat gets its divider, "Entering <scene>", saved against the new
 * scene in the same transaction and answered for the caller to publish once
 * its own answer has gone. Null when the session was already on this scene,
 * so loading it again adds no second divider.
 *
 * Given a caller's transaction it runs inside it, so a scene made at the table
 * (sa_createRunScene) is inserted and moved onto as one write; on its own it
 * opens a transaction of its own.
 */
async function putSessionOn(
  userId: string,
  idStorySession: number,
  idStoryScene: number,
  tx?: Tx,
): Promise<PublicChat | null> {
  const body = async (tx: Tx): Promise<PublicChat | null> => {
    const [before] = await tx
      .select({ idStoryScene: storySessions.idStoryScene, idStory: storySessions.idStory })
      .from(storySessions)
      .where(eq(storySessions.idStorySession, idStorySession))
      .limit(1);
    await tx
      .update(storyScenes)
      .set({ status: ACTIVE, idUpdatedByUser: userId })
      .where(
        and(
          eq(storyScenes.idStoryScene, idStoryScene),
          notInArray(storyScenes.status, [ACTIVE, SCENE_LOCKED_STATUS]),
        ),
      );
    await tx
      .update(storyScenes)
      .set({ idStorySession, idUpdatedByUser: userId })
      .where(
        and(
          eq(storyScenes.idStoryScene, idStoryScene),
          isNull(storyScenes.idStorySession),
          ne(storyScenes.status, SCENE_LOCKED_STATUS),
        ),
      );
    await tx
      .update(storySessions)
      .set({ idStoryScene, idUpdatedByUser: userId })
      .where(eq(storySessions.idStorySession, idStorySession));

    if (!before || before.idStoryScene === idStoryScene) return null;
    const [scene] = await tx
      .select({ title: storyScenes.sceneTitle })
      .from(storyScenes)
      .where(eq(storyScenes.idStoryScene, idStoryScene))
      .limit(1);
    return insertChat(
      {
        idStory: before.idStory,
        idStoryScene,
        text: sceneEntryText(scene?.title ?? "a new scene"),
        isSystem: true,
        userId,
      },
      tx,
    );
  };
  return tx ? body(tx) : db.transaction(body);
}

/** The divider putSessionOn saved, sent to every table; nothing when there was none. */
function publishEntry(idStory: number, entry: PublicChat | null): void {
  if (entry) publishLater(() => publishChat(idStory, entry));
}

/**
 * What the storyteller's play space opens with: the scene the table is on,
 * its tags and cover, and the elements brought into it, so the storyteller
 * starts from what they prepared for this moment rather than an empty space.
 * Named for what it may do: opening the table can put the session on a
 * scene, which is a write, so it is not a plain get.
 *
 * The scene is the current session's id_story_scene, reached through the
 * story's pointer to that session, while the session is being played or
 * paused: a pause is a break at the table, which stays on its scene. A
 * finished session, or none, starts the space empty.
 *
 * A session being played on no scene is put on the story's ACTIVE scene, if
 * it has one, the way choosing it from the header would (putSessionOn), so a
 * table opened on a story with a scene in play lands on that scene rather
 * than on nothing. With more than one, the most recently touched is taken,
 * which is the first the header's selector lists. Without one the space
 * starts empty: nothing is made active behind the storyteller's back.
 *
 * Empty for anyone but the story's storyteller, as for a story that is not
 * there: the scene and its elements are their preparation.
 */
export async function sa_openRunPlaySpace(idStory: number): Promise<RunPlaySpace> {
  const user = await requireAccount();

  const id = idSchema.safeParse(idStory);
  if (!id.success) return EMPTY;

  // A paused session still shows the scene it was on, so a reload during
  // the break opens on it; see shownSession.
  const shown = await shownSession(user.id, id.data);
  if (shown === null) return EMPTY;
  const session = shown.idStorySession;

  if (shown.idStoryScene !== null) {
    // spaceFor holds the scene to this story, which nothing in the database
    // does for a session's scene.
    return spaceFor(id.data, shown.idStoryScene);
  }
  // Putting the session on the active scene below is a write, which a
  // paused session does not take.
  if (!shown.isPlaying) return EMPTY;

  const [active] = await db
    .select({ idStoryScene: storyScenes.idStoryScene })
    .from(storyScenes)
    .where(and(eq(storyScenes.idStory, id.data), eq(storyScenes.status, ACTIVE)))
    .orderBy(desc(storyScenes.updatedAt), desc(storyScenes.idStoryScene))
    .limit(1);
  if (!active) return EMPTY;

  const entry = await putSessionOn(user.id, session, active.idStoryScene);
  // The players' table follows the session's scene too; see
  // lib/realtime/publish-scene.ts.
  publishLater(() => publishSceneChanged(id.data));
  publishEntry(id.data, entry);
  return spaceFor(id.data, active.idStoryScene);
}

/**
 * The story's RUN_SCENES_LIST_SIZE most recently touched scenes, newest
 * first, for the header's scene selector. updated_at moves on every change,
 * a status included, so the scenes in play rise to the top. Nothing for
 * anyone but the storyteller.
 */
export async function sa_listRunScenes(idStory: number): Promise<RunScene[]> {
  const user = await requireAccount();

  const id = idSchema.safeParse(idStory);
  if (!id.success) return [];
  if ((await ownedStory(user.id, id.data)) === null) return [];

  // The view, for the sitting each scene was played in as the Timeline
  // numbers it, which the selector shows under the title.
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
    .where(eq(vStoryScenes.idStory, id.data))
    .orderBy(desc(vStoryScenes.updatedAt), desc(vStoryScenes.idStoryScene))
    .limit(RUN_SCENES_LIST_SIZE);
  return rows.map((row) => ({
    idStoryScene: row.idStoryScene!,
    title: row.title!,
    status: row.status!,
    sessionHeading: sessionHeadingOf(row),
  }));
}

/**
 * One scene's play space for its edit page, where its elements are shown in
 * their stacks beside the form: the same space the table would load, read
 * as it stands. Unlike sa_loadRunScene it needs no session and moves
 * nothing, since editing a scene is preparation, not playing it.
 *
 * Empty for a scene that is not this story's or a caller who is not its
 * storyteller, which are one answer, as sa_openRunPlaySpace gives.
 */
export async function sa_getScenePlaySpace(
  idStory: number,
  idStoryScene: number,
): Promise<RunPlaySpace> {
  const user = await requireAccount();

  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return EMPTY;
  const owned = await ownedScene(user.id, scene.data, { idStory: story.data, allowLocked: true });
  if (!owned.ok) return EMPTY;

  return spaceFor(story.data, scene.data);
}

export type LoadRunSceneResult = { ok: true; space: RunPlaySpace } | { ok: false; error: string };

/**
 * Puts the session on a scene the storyteller chose from the header, and
 * answers with the play space for it. A PENDING scene becomes ACTIVE, and
 * an ACTIVE or COMPLETE one is loaded as it is: a complete scene stays
 * complete, and the table shows it locked.
 *
 * Refused when the scene is not this story's or the caller is not its
 * storyteller, which are one answer, and when no session is being played,
 * since there is no table to put the scene on.
 */
export async function sa_loadRunScene(
  idStory: number,
  idStoryScene: number,
): Promise<LoadRunSceneResult> {
  const user = await requireAccount();

  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  const owned = await ownedScene(user.id, scene.data, { idStory: story.data, allowLocked: true });
  if (!owned.ok) return { ok: false, error: NOT_THIS_STORY };

  const session = await playingSession(user.id, story.data);
  if (session === null) return { ok: false, error: NO_SESSION_FOR_SCENE };

  const entry = await putSessionOn(user.id, session, scene.data);
  publishLater(() => publishSceneChanged(story.data));
  publishEntry(story.data, entry);
  return { ok: true, space: await spaceFor(story.data, scene.data) };
}

export type CreateRunSceneResult =
  { ok: true; space: RunPlaySpace } | { ok: false; errors: Record<string, string> };

/**
 * Writes a new scene from the header's Create new scene, in the session
 * being played, and puts the table on it at once, ACTIVE: a scene made at
 * the table is made to be played now. It is inserted with the workflow's
 * default and then moved, so the move stamps active_at as any other does.
 * With no session being played the scene is made all the same, in the
 * workflow's default and in no sitting, as the board's New scene makes one,
 * and the table shows it to be prepared; nothing is made active.
 *
 * Field errors come back for the form, and a story the caller does not tell
 * as `root`.
 */
export async function sa_createRunScene(
  idStory: number,
  input: unknown,
): Promise<CreateRunSceneResult> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStory);
  if (!id.success || (await ownedStory(user.id, id.data)) === null) {
    return { ok: false, errors: { root: NOT_THIS_STORY } };
  }

  const parsed = runSceneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: formErrors(parsed.error) };
  }

  const session = await playingSession(user.id, id.data);

  // The insert and the move onto the scene land together: a move the
  // workflow trigger refuses leaves no scene behind that the table never
  // went to.
  const { idStoryScene, entry } = await db.transaction(async (tx) => {
    const idStoryScene = await createScene(
      {
        idStory: id.data,
        title: parsed.data.title,
        description: parsed.data.description,
        idStorySession: session,
        userId: user.id,
      },
      tx,
    );
    const entry = session !== null ? await putSessionOn(user.id, session, idStoryScene, tx) : null;
    return { idStoryScene, entry };
  });

  if (session !== null) {
    publishLater(() => publishSceneChanged(id.data));
    publishEntry(id.data, entry);
  }
  return { ok: true, space: await spaceFor(id.data, idStoryScene) };
}

export type SetSceneStacksResult =
  { ok: true; tags: string[] } | { ok: false; errors: Record<string, string> };

/**
 * Manage stacks and the In select's Create new stack: the scene's stacks,
 * which are its tags, in the order given. With `saveForStory` they also
 * become the story's standard_tags, which every scene made afterwards starts
 * with (standard_tags_for_story); scenes already made keep their own.
 *
 * A renamed stack takes its links with it: each of the scene's links filed
 * under the old name is filed under the new one. Links filed under a stack
 * that is taken away keep that tag: the play space shows them in the first
 * stack, and putting the stack back puts them back in it.
 *
 * Errors come back keyed by the field, as a form's do; a scene the caller
 * does not tell comes back as `root`, and a complete one on `tags`, where
 * the dialog shows it.
 */
export async function sa_setSceneStacks(
  idStory: number,
  idStoryScene: number,
  input: unknown,
): Promise<SetSceneStacksResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return { ok: false, errors: { root: NOT_THIS_STORY } };
  const owned = await ownedScene(user.id, scene.data, { idStory: story.data });
  if (!owned.ok) {
    return owned.reason === "locked"
      ? { ok: false, errors: { tags: SCENE_COMPLETE } }
      : { ok: false, errors: { root: NOT_THIS_STORY } };
  }

  const parsed = sceneStacksSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error) };
  const { tags, renames, saveForStory } = parsed.data;
  // A rename is of a stack the scene has; one it lacks means the dialog's
  // list is out of date.
  const moves = renames.filter((rename) => rename.from !== rename.to);
  if (moves.some((rename) => !owned.scene.tags.includes(rename.from))) {
    return { ok: false, errors: { tags: NO_SUCH_STACK } };
  }

  // The widened stacks follow the stacks: a renamed one stays wide under its
  // new name, one taken away is forgotten, and the Default stack's "" is no
  // tag, so it stays whatever the tags become.
  const renamed = new Map(moves.map((rename) => [rename.from, rename.to]));
  const wideTags = owned.scene.wideTags
    .map((key) => renamed.get(key) ?? key)
    .filter((key) => key === stackKey(null) || tags.includes(key));

  await db.transaction(async (tx) => {
    await tx
      .update(storyScenes)
      .set({ tags, wideTags, idUpdatedByUser: user.id })
      .where(and(eq(storyScenes.idStoryScene, scene.data), eq(storyScenes.idStory, story.data)));
    // The scene's links filed under a renamed stack follow it. In two
    // passes, through a placeholder no stack can be called (stackNameSchema
    // refuses control characters, and these start with one), so a swap (a
    // to b, b to a) does not fold both into one.
    const held = moves.map((_, index) => `\u0001rename-${index}`);
    for (const [index, rename] of moves.entries()) {
      await tx
        .update(sceneElements)
        .set({ tags: sql`array_replace(${sceneElements.tags}, ${rename.from}, ${held[index]})` })
        .where(eq(sceneElements.idStoryScene, scene.data));
    }
    for (const [index, rename] of moves.entries()) {
      await tx
        .update(sceneElements)
        .set({ tags: sql`array_replace(${sceneElements.tags}, ${held[index]}, ${rename.to})` })
        .where(eq(sceneElements.idStoryScene, scene.data));
    }
    if (saveForStory) {
      await tx
        .update(stories)
        .set({ standardTags: tags, idUpdatedByUser: user.id })
        .where(and(eq(stories.idStory, story.data), eq(stories.idCreatedByUser, user.id)));
    }
  });
  publishLater(() => publishSceneChanged(story.data));
  return { ok: true, tags };
}

export type SetStackWideResult = { ok: true; wideTags: string[] } | { ok: false; error: string };

/**
 * The expand button on a stack's heading: the stack is widened to the whole
 * play space, or narrowed back, on every table at once. The wide stacks are
 * the scene's (story_scenes.wide_tags), so the players' table and the
 * display table draw them as the storyteller's does, a table opened later
 * too, and the scene comes back as it was left. A complete scene takes it:
 * how its stacks are shown is not what is in them. The players' table hears
 * the scene changed and reads it afresh.
 */
export async function sa_setStackWide(
  idStory: number,
  idStoryScene: number,
  input: unknown,
): Promise<SetStackWideResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  const parsed = stackWideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: CHANGE_FAILED };
  const owned = await ownedScene(user.id, scene.data, { idStory: story.data, allowLocked: true });
  if (!owned.ok) return { ok: false, error: NOT_THIS_STORY };

  const wideTags = withStackWide(owned.scene.wideTags, parsed.data.tag, parsed.data.wide);
  await db
    .update(storyScenes)
    .set({ wideTags, idUpdatedByUser: user.id })
    .where(and(eq(storyScenes.idStoryScene, scene.data), eq(storyScenes.idStory, story.data)));
  publishLater(() => publishSceneChanged(story.data));
  return { ok: true, wideTags };
}
