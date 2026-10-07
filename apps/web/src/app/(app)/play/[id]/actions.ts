"use server";

import { and, eq, exists, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { hasOpenSession } from "@/db/open-session";
import { waitingCount } from "@/db/session-player-counts";
import { requireUser } from "@/lib/authorize";
import {
  isUnplayable,
  WAITING_STALE_SECONDS,
  type PlayStory,
  type WaitingRoomState,
} from "@/lib/play";

const { stories, storyPlayers, sessionPlayers } = schema;

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
      imageUrl: attachmentUrl("STORY", stories.idStory),
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
