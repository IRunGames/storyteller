"use server";

import { and, eq, exists, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { hasOpenSession } from "@/db/open-session";
import { waitingCount } from "@/db/session-player-counts";
import { currentScene, sceneItems } from "@/db/scene-items";
import { requireUser } from "@/lib/authorize";
import {
  isUnplayable,
  WAITING_STALE_SECONDS,
  type PlayStory,
  type WaitingRoomState,
} from "@/lib/play";
import { EMPTY_PLAY_SCENE, type PlayScene } from "@/lib/play-scene";
import { publishLater } from "@/lib/realtime/publish";
import {
  publishElementChanged,
  publishSceneChanged,
  publishSceneElement,
} from "@/lib/realtime/publish-scene";
import { elementSchema } from "@/lib/element-schemas";
import { sceneTextSchema } from "@/lib/scene-schemas";
import { SCENE_LOCKED_STATUS, type SetSceneTextResult } from "@/lib/scenes";
import { toPublicElement, toPublicSceneElement } from "@/lib/realtime/events";
import { storyStateTopic } from "@/lib/realtime/topics";
import { SCENE_ELEMENT_HIDDEN, SCENE_ELEMENT_SHOWN, SCENE_ELEMENT_TAPPED } from "@/lib/run";

const { stories, storyPlayers, sessionPlayers, storyScenes, elements, sceneElements } = schema;

// stories.id_story is int4; an id outside that range is a query error to
// Postgres rather than a missing row, so it is turned away before the query.
const idStorySchema = z.number().int().min(-2147483648).max(2147483647);

/**
 * The story as the table and the waiting room see it, or null when there is
 * no such story or the caller is neither its storyteller nor one of its
 * players. The two cases are one answer on purpose: a stranger gets the same
 * not-found page as a bad id, not a hint that the story is there.
 */
async function loadPlayStory(userId: string, idStory: number): Promise<PlayStory | null> {
  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return null;

  // A correlated EXISTS, as the play picker uses, so a storyteller who also
  // has a player row still comes back once.
  const seated = exists(
    db
      .select({ one: storyPlayers.idStoryPlayer })
      .from(storyPlayers)
      .where(and(eq(storyPlayers.idStory, stories.idStory), eq(storyPlayers.idUser, userId))),
  );

  const [story] = await db
    .select({
      idStory: stories.idStory,
      title: stories.title,
      imageUrl: attachmentUrl("STORY", "stories", "id_story"),
      // NULL = userId is NULL in SQL, and Boolean(null) is false, so a story
      // with no recorded creator has no owner rather than an error.
      isOwner: eq(stories.idCreatedByUser, userId).mapWith(Boolean),
      isActive: stories.isActive,
      isArchived: stories.isArchived,
      hasOpenSession,
      idStorySession: stories.idStorySession,
    })
    .from(stories)
    .where(and(eq(stories.idStory, id.data), or(eq(stories.idCreatedByUser, userId), seated)))
    .limit(1);

  return story ?? null;
}

/**
 * The story behind /play/[id], for the page to choose between the table, the
 * waiting room and the dialog that says the story cannot be played. Null
 * sends the page to not-found.
 */
export async function sa_getPlayStory(idStory: number): Promise<PlayStory | null> {
  const user = await requireUser();
  return loadPlayStory(user.id, idStory);
}

export type ActivateStoryResult = { ok: true } | { ok: false; error: string };

/**
 * Switches a story the caller created back on, from the dialog that stops
 * the table opening for an inactive one. Archiving is left alone: an
 * archived story comes back through the edit form, where the storyteller can
 * see what else they are restoring. The creator is checked in the UPDATE's
 * WHERE, so a story that is not theirs, or is not there, changes nothing and
 * says so.
 */
export async function sa_activateStory(idStory: number): Promise<ActivateStoryResult> {
  const user = await requireUser();
  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return { ok: false, error: "That story could not be found." };

  const updated = await db
    .update(stories)
    .set({ isActive: true, idUpdatedByUser: user.id })
    .where(and(eq(stories.idStory, id.data), eq(stories.idCreatedByUser, user.id)))
    .returning({ idStory: stories.idStory });
  if (updated.length === 0) {
    return { ok: false, error: "Only the storyteller who created this story can make it active." };
  }
  return { ok: true };
}

// The caller's waiting row for a story: the one with no session yet. The
// partial unique index session_players_waiting_player_key allows one.
function waitingRow(idStory: number, userId: string) {
  return and(
    eq(sessionPlayers.idStory, idStory),
    eq(sessionPlayers.idCreatedByUser, userId),
    isNull(sessionPlayers.idStorySession),
  );
}

/**
 * One heartbeat from the waiting room: keeps the caller's row WAITING, and
 * reports how many are waiting and whether the table has opened. Null when
 * the caller may not wait here at all, which the page has already checked; a
 * null here means the story went away or they lost their place in it while
 * waiting.
 *
 * The storyteller has no row: they open the table, they do not wait at it,
 * and the page sends them straight through. Nor does a player once the table
 * has opened; the room hands them to /play/[id], which seats them with
 * sa_joinSession.
 */
export async function sa_waitForSession(idStory: number): Promise<WaitingRoomState | null> {
  const user = await requireUser();
  const story = await loadPlayStory(user.id, idStory);
  if (!story) return null;

  const state = {
    hasOpenSession: story.hasOpenSession,
    isUnplayable: isUnplayable(story),
  };
  if (story.isOwner || state.hasOpenSession || state.isUnplayable) {
    return { ...state, waitingSince: new Date(), waitingCount: 0 };
  }

  // Nothing moves a quiet row out of WAITING: a closed tab leaves its row
  // there until the player comes back or leaves. Freshness is read from the
  // heartbeat instead, in two places. A row whose last beat is older than
  // WAITING_STALE_SECONDS is not counted (db/session-player-counts.ts), and when its
  // player does come back, waiting_at is set afresh here so the clock does
  // not count the absence. The CASE reads the row as it was before this
  // update.
  const stale = sql`now() - make_interval(secs => ${WAITING_STALE_SECONDS})`;

  // WAITING to WAITING is no transition, so the workflow neither checks it
  // nor restamps waiting_at, which is why the CASE does that by hand; the
  // update still lets set_updated_at stamp the heartbeat. From AWAY or LEFT
  // it is a real move, and the workflow stamps a fresh waiting_at itself.
  const [row] = await db
    .insert(sessionPlayers)
    .values({ idStory: story.idStory, idCreatedByUser: user.id, idUpdatedByUser: user.id })
    .onConflictDoUpdate({
      target: [sessionPlayers.idStory, sessionPlayers.idCreatedByUser],
      targetWhere: isNull(sessionPlayers.idStorySession),
      set: {
        status: "WAITING",
        idUpdatedByUser: user.id,
        waitingAt: sql`case when ${sessionPlayers.updatedAt} < ${stale} then now() else ${sessionPlayers.waitingAt} end`,
      },
    })
    .returning({ waitingAt: sessionPlayers.waitingAt });

  const [count] = await db
    .select({ waiting: waitingCount(stories.idStory) })
    .from(stories)
    .where(eq(stories.idStory, story.idStory));

  return {
    ...state,
    // The workflow stamps waiting_at on the insert and on every move into
    // WAITING, so it is only null if the workflow was taken off the table.
    waitingSince: row.waitingAt ?? new Date(),
    waitingCount: count?.waiting ?? 1,
  };
}

/**
 * Takes the caller out of the waiting room when they give up or leave the
 * page, so the count drops at once rather than when their heartbeat goes
 * quiet. The waiting row is deleted rather than moved to LEFT: it was never
 * attached to a session, so there is no attendance in it to keep, and
 * coming back starts a new row with a new clock. Only ever the caller's own
 * waiting row; a row already attached to a session is not touched, and an
 * absent one is a no-op.
 */
export async function sa_leaveWaitingRoom(idStory: number): Promise<void> {
  const user = await requireUser();
  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return;

  await db.delete(sessionPlayers).where(waitingRow(id.data, user.id));
}

/**
 * Seats a player at the story's session being played, as /play/[id] renders
 * the table for them. The session is the story's own pointer, never an id
 * the client sent, and nothing happens unless it is being played and the
 * caller is one of the story's players; the storyteller is not a player of
 * their own story and gets no row.
 *
 * A player who already has a row for this session (they were at the table,
 * dropped out, and came back) is moved back to PRESENT on it, and a waiting
 * row they left behind goes to LEFT, since they are no longer waiting.
 * Otherwise their waiting row, if they came through the room, is attached
 * to the session and moved to PRESENT, keeping its waiting_at as a record of
 * how long they waited for it; failing both, a new PRESENT row is made.
 */
export async function sa_joinSession(idStory: number): Promise<void> {
  const user = await requireUser();
  const story = await loadPlayStory(user.id, idStory);
  if (!story || story.isOwner || !story.hasOpenSession || story.idStorySession === null) return;
  const idStorySession = story.idStorySession;

  await db.transaction(async (tx) => {
    const atSession = and(
      eq(sessionPlayers.idStorySession, idStorySession),
      eq(sessionPlayers.idCreatedByUser, user.id),
    );
    const [existing] = await tx
      .select({ status: sessionPlayers.status })
      .from(sessionPlayers)
      .where(atSession)
      .limit(1);

    if (existing) {
      if (existing.status !== "PRESENT") {
        await tx
          .update(sessionPlayers)
          .set({ status: "PRESENT", idUpdatedByUser: user.id })
          .where(atSession);
      }
      await tx
        .update(sessionPlayers)
        .set({ status: "LEFT", idUpdatedByUser: user.id })
        .where(
          and(
            waitingRow(story.idStory, user.id),
            inArray(sessionPlayers.status, ["WAITING", "AWAY"]),
          ),
        );
      return;
    }

    const attached = await tx
      .update(sessionPlayers)
      .set({ idStorySession, status: "PRESENT", idUpdatedByUser: user.id })
      .where(waitingRow(story.idStory, user.id))
      .returning({ id: sessionPlayers.idSessionPlayer });
    if (attached.length > 0) return;

    // Another tab of theirs may have seated them since the select above;
    // the unique index turns the second insert into a no-op.
    await tx
      .insert(sessionPlayers)
      .values({
        idStory: story.idStory,
        idStorySession,
        status: "PRESENT",
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      })
      .onConflictDoNothing();
  });
}

/**
 * The scene being played as the players' table shows it: the scene the
 * story's current session is on, its tags and cover, and the elements in it
 * the players may see, each whole with its link, as the state topic
 * publishes them. INVISIBLE links are left out here as they are there.
 * Empty, with the session, when the session is on no scene, and empty
 * altogether when nothing is being played. Null for a story the caller
 * neither tells nor plays in, as sa_getPlayStory answers.
 *
 * The owner gets it too, so the storyteller can open /play/[id] in another
 * window and see what the players see; the page sends them to /run/[id]
 * itself.
 */
export async function sa_getPlayScene(idStory: number): Promise<PlayScene | null> {
  const user = await requireUser();
  const story = await loadPlayStory(user.id, idStory);
  if (!story) return null;

  const current = await currentScene(story.idStory);
  if (current === null) return EMPTY_PLAY_SCENE;
  if (current.idStoryScene === null) {
    return { ...EMPTY_PLAY_SCENE, idStorySession: current.idStorySession };
  }

  const [scene] = await db
    .select({
      idStoryScene: storyScenes.idStoryScene,
      title: storyScenes.sceneTitle,
      status: storyScenes.status,
      tags: storyScenes.tags,
      coverUrl: attachmentUrl("STORY_SCENE", "story_scenes", "id_story_scene"),
      description: storyScenes.sceneDescription,
      notes: storyScenes.notes,
    })
    .from(storyScenes)
    .where(
      and(
        eq(storyScenes.idStoryScene, current.idStoryScene),
        eq(storyScenes.idStory, story.idStory),
      ),
    )
    .limit(1);
  if (!scene) return { ...EMPTY_PLAY_SCENE, idStorySession: current.idStorySession };

  const rows = await sceneItems(story.idStory, scene.idStoryScene, [SCENE_ELEMENT_HIDDEN]);
  return {
    idStorySession: current.idStorySession,
    scene: {
      idStoryScene: scene.idStoryScene,
      title: scene.title,
      status: scene.status,
      text: { description: scene.description, notes: scene.notes },
    },
    tags: scene.tags,
    coverUrl: scene.coverUrl,
    items: rows.map((row) => ({
      element: toPublicElement(row.element, row.imageUrl, row.link.showInfo),
      sceneElement: toPublicSceneElement(row.link),
    })),
  };
}

const NOT_AT_THIS_TABLE = "You are not at this story's table.";

/**
 * The panel behind the scene's title on the players' table: a player, or
 * the storyteller looking on, writes up the scene's description and notes
 * as it is played. Anyone the story seats may (loadPlayStory), for any scene
 * of the story; every table hears the scene changed and reads it afresh.
 * Field errors come back for the form.
 */
export async function sa_setPlaySceneText(
  idStory: number,
  idStoryScene: number,
  input: unknown,
): Promise<SetSceneTextResult> {
  const user = await requireUser();
  const story = await loadPlayStory(user.id, idStory);
  const scene = idStorySchema.safeParse(idStoryScene);
  if (!story || !scene.success) return { ok: false, errors: { root: NOT_AT_THIS_TABLE } };

  const parsed = sceneTextSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join(".") || "root", issue.message]),
      ),
    };
  }
  const text = { description: parsed.data.description || null, notes: parsed.data.notes || null };

  const updated = await db
    .update(storyScenes)
    .set({ sceneDescription: text.description, notes: text.notes, idUpdatedByUser: user.id })
    .where(and(eq(storyScenes.idStoryScene, scene.data), eq(storyScenes.idStory, story.idStory)))
    .returning({ idStoryScene: storyScenes.idStoryScene });
  if (updated.length === 0) return { ok: false, errors: { root: NOT_AT_THIS_TABLE } };
  publishLater(() => publishSceneChanged(story.idStory));
  return { ok: true, text };
}

export type SetElementNotesResult =
  { ok: true; notes: string | null } | { ok: false; error: string };

const NOT_THIS_STORYS_ELEMENT = "That element is not part of this story.";
const NOT_IN_THIS_SCENE = "That element is not in this scene.";

/**
 * The Notes field in a pill's info popover on the players' table: the
 * players' own notes on the element (elements.notes), written as the scene
 * is played. Anyone the story seats may (loadPlayStory), the storyteller
 * looking on included. A player may only write on an element they can see,
 * by the rule sa_getPlayScene reads by: linked to the scene the session is
 * on, and not hidden there. The storyteller sees every element, so the
 * rule is not applied to them. Trimmed, and empty stored as null, as the
 * column holds it.
 *
 * Every change is appended to the element's activity_log through the
 * database's own _append_activity_log, as a `notes_change_log` entry with
 * the caller's id as its userId and, by the function's own lookup, their
 * name, and the notes before and after under activityData. Notes the same
 * as those stored write nothing, log nothing and send nothing, so the log
 * holds only changes. A change sends the element to every table, as an
 * edit of it would.
 *
 * Refused when the caller is not at the story's table, the element is not
 * the story's, a player cannot see it, or the notes are too long; the
 * refusal is the field's message.
 */
export async function sa_setPlayElementNotes(
  idStory: number,
  idElement: number,
  input: unknown,
): Promise<SetElementNotesResult> {
  const user = await requireUser();
  const story = await loadPlayStory(user.id, idStory);
  const element = idStorySchema.safeParse(idElement);
  if (!story) return { ok: false, error: NOT_AT_THIS_TABLE };
  if (!element.success) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };
  const parsed = elementSchema.shape.notes.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const notes = parsed.data || null;

  const [current] = await db
    .select({ notes: elements.notes })
    .from(elements)
    .where(and(eq(elements.idElement, element.data), eq(elements.idStory, story.idStory)))
    .limit(1);
  if (!current) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };
  if (!story.isOwner && !(await playerSees(story.idStory, element.data))) {
    return { ok: false, error: NOT_IN_THIS_SCENE };
  }
  if (current.notes === notes) return { ok: true, notes };

  // The write and its log entry land together or not at all. The function
  // reads and rewrites activity_log itself, by the row's primary key, so
  // the update names only the notes.
  await db.transaction(async (tx) => {
    await tx
      .update(elements)
      .set({ notes, idUpdatedByUser: user.id })
      .where(eq(elements.idElement, element.data));
    await tx.execute(sql`
      select _append_activity_log(
        table_name := 'elements',
        field_name := 'activity_log',
        record_id := ${String(element.data)},
        activity_category := 'notes_change_log',
        activity_details := 'notes',
        activity_source := 'play element info',
        user_id := ${user.id},
        activity_data := ${JSON.stringify({ previousNotes: current.notes, notes })}::jsonb
      )
    `);
  });
  publishLater(() => publishElementChanged(story.idStory, element.data));
  return { ok: true, notes };
}

export type UntapSceneElementResult = { ok: true; status: string } | { ok: false; error: string };

const NOT_BEING_PLAYED = "That scene is not being played.";
const SCENE_COMPLETE = "That scene is complete, so nothing in it can change.";
const NOT_TAPPED = "That element is not tapped.";
const INFO_NOT_SHOWING = "That element's info is not showing.";

/**
 * The turned arrow at the start of a tapped player pill: a player readies
 * the card, moving its link to the scene from TAPPED back to READY. Only
 * for the scene the session is on, while it is not complete, and only for
 * a card the player can see (playerSees) whose info the storyteller is
 * showing, which is the rule the pill shows the button by; the storyteller
 * looking on is held to everything but the info rule, since they see it all.
 *
 * The database logs the move on the link's activity_log itself, but with no
 * user, so the untap appends its own `untap_log` entry through
 * _append_activity_log with the caller's id and, by the function's own
 * lookup, their name, together in one transaction with the move. The link
 * is then sent to every table, the storyteller's included.
 */
export async function sa_untapPlaySceneElement(
  idStory: number,
  idStoryScene: number,
  idElement: number,
): Promise<UntapSceneElementResult> {
  const user = await requireUser();
  const story = await loadPlayStory(user.id, idStory);
  const scene = idStorySchema.safeParse(idStoryScene);
  const element = idStorySchema.safeParse(idElement);
  if (!story || !scene.success) return { ok: false, error: NOT_AT_THIS_TABLE };
  if (!element.success) return { ok: false, error: NOT_IN_THIS_SCENE };

  const current = await currentScene(story.idStory);
  if (current === null || current.idStoryScene !== scene.data) {
    return { ok: false, error: NOT_BEING_PLAYED };
  }
  const [played] = await db
    .select({ status: storyScenes.status })
    .from(storyScenes)
    .where(and(eq(storyScenes.idStoryScene, scene.data), eq(storyScenes.idStory, story.idStory)))
    .limit(1);
  if (!played) return { ok: false, error: NOT_BEING_PLAYED };
  if (played.status === SCENE_LOCKED_STATUS) return { ok: false, error: SCENE_COMPLETE };

  const link = and(
    eq(sceneElements.idStoryScene, scene.data),
    eq(sceneElements.idElement, element.data),
  );
  const [row] = await db
    .select({
      idSceneElement: sceneElements.idSceneElement,
      status: sceneElements.status,
      showInfo: sceneElements.showInfo,
    })
    .from(sceneElements)
    .where(link)
    .limit(1);
  if (!row || row.status === SCENE_ELEMENT_HIDDEN) return { ok: false, error: NOT_IN_THIS_SCENE };
  if (row.status !== SCENE_ELEMENT_TAPPED) return { ok: false, error: NOT_TAPPED };
  if (!row.showInfo && !story.isOwner) return { ok: false, error: INFO_NOT_SHOWING };

  await db.transaction(async (tx) => {
    await tx
      .update(sceneElements)
      .set({ status: SCENE_ELEMENT_SHOWN, idUpdatedByUser: user.id })
      .where(link);
    await tx.execute(sql`
      select _append_activity_log(
        table_name := 'scene_elements',
        field_name := 'activity_log',
        record_id := ${String(row.idSceneElement)},
        activity_category := 'untap_log',
        activity_details := 'untapped',
        activity_source := 'play pill',
        user_id := ${user.id},
        activity_data := ${JSON.stringify({
          previousStatus: SCENE_ELEMENT_TAPPED,
          status: SCENE_ELEMENT_SHOWN,
        })}::jsonb
      )
    `);
  });
  publishLater(() => publishSceneElement(story.idStory, scene.data, element.data));
  return { ok: true, status: SCENE_ELEMENT_SHOWN };
}

/**
 * Whether the players can see the element right now: the story's playing
 * session is on a scene, and the element is linked there other than as
 * INVISIBLE, which is what sa_getPlayScene lists and the topic publishes.
 */
async function playerSees(idStory: number, idElement: number): Promise<boolean> {
  const current = await currentScene(idStory);
  if (current === null || current.idStoryScene === null) return false;
  const [link] = await db
    .select({ idSceneElement: sceneElements.idSceneElement })
    .from(sceneElements)
    .where(
      and(
        eq(sceneElements.idStoryScene, current.idStoryScene),
        eq(sceneElements.idElement, idElement),
        ne(sceneElements.status, SCENE_ELEMENT_HIDDEN),
      ),
    )
    .limit(1);
  return link !== undefined;
}

/** How the browser reaches the broker and what it listens to there. */
export type StoryChannel = {
  /** The broker's WebSocket address, wss://host:port/mqtt. */
  url: string;
  username: string;
  password: string;
  /** The story's state topic. */
  topic: string;
};

/**
 * What the players' table needs to subscribe to the story's state topic:
 * the broker's WebSocket address and the subscribe-only login the
 * environment holds for players. Handed only to the story's storyteller and
 * its players, as the scene is, since the login can read any story's
 * topic (the broker's authorization rule is for story/#, not for one
 * story); null for anyone else, and null when the broker is not configured,
 * which the table takes as "no live updates".
 *
 * The login is a shared one because EMQX Serverless has no API for making
 * logins, so there is one per deployment rather than one per player; see the
 * plan for the per-story JWT that a Dedicated deployment would allow.
 */
export async function sa_getStoryChannel(idStory: number): Promise<StoryChannel | null> {
  const user = await requireUser();
  const story = await loadPlayStory(user.id, idStory);
  if (!story) return null;

  const address = process.env.MQTT_ADDRESS;
  const username = process.env.MQTT_PLAYER_USERNAME;
  const password = process.env.MQTT_PLAYER_PASSWORD;
  if (!address || !username || !password) return null;
  const port = process.env.MQTT_WS_TLS_PORT || "8084";

  return {
    url: `wss://${address}:${port}/mqtt`,
    username,
    password,
    topic: storyStateTopic(story.idStory),
  };
}
