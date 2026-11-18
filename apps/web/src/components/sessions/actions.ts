"use server";

import { and, eq, exists, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { idSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import { appendActivityLog } from "@/db/activity-log";
import { ownedSession, playingSession } from "@/db/story-access";
import { requireAccount } from "@/lib/authorize";
import { sessionNotesSchema, sessionTitleSchema } from "@/lib/session-schemas";
import { formErrors } from "@/lib/forms";
import {
  NOT_AN_ANSWER,
  NOT_THIS_STORYS_SESSION,
  SESSION_NOT_AT_YOUR_TABLE,
  SESSION_NOT_BEING_PLAYED,
} from "@/lib/messages";
import { publishLater } from "@/lib/realtime/publish";
import { publishSceneChanged, publishSessionUpdated } from "@/lib/realtime/publish-scene";
import { SESSION_PLAYING_STATUSES, SESSION_STATUS } from "@/lib/status";

const { stories, storyPlayers, storySessions } = schema;

// The session at the table: its notes panel (SessionNotesPopover), written
// up by the storyteller and the players alike, and the storyteller's control
// of it from the run table's header, the title and the inactivity check.
// Every action here starts with requireAccount(); the notes are read through
// the caller's seat, the controls through the story's storyteller.

/** The session's notes and lingering questions as stored; null for one not written. */
export type SessionNotes = { notes: string | null; lingeringQuestions: string | null };

export type SetSessionNotesResult =
  { ok: true; notes: SessionNotes } | { ok: false; errors: Record<string, string> };

/**
 * The session's notes as the caller may write them up: of a story they tell
 * or have a seat in. Null otherwise, as for an id that names nothing, so a
 * stranger gets no hint the session is there. A reader of a public story has
 * no seat and gets null too: the panel is the table's, and reading a
 * finished session is the session page's business (sa_getStorySession).
 */
async function notesAtUsersTable(
  userId: string,
  idStorySession: number,
): Promise<SessionNotes | null> {
  // The id is parsed by the callers, which also write with it.
  // A correlated EXISTS, as the play actions use, so a storyteller who also
  // has a player row still comes back once.
  const seated = exists(
    db
      .select({ one: storyPlayers.idStoryPlayer })
      .from(storyPlayers)
      .where(and(eq(storyPlayers.idStory, stories.idStory), eq(storyPlayers.idUser, userId))),
  );

  const [row] = await db
    .select({ notes: storySessions.notes, lingeringQuestions: storySessions.lingeringQuestions })
    .from(storySessions)
    .innerJoin(stories, eq(stories.idStory, storySessions.idStory))
    .where(
      and(
        eq(storySessions.idStorySession, idStorySession),
        or(eq(stories.idCreatedByUser, userId), seated),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The panel's fields as it opens, or null when the session is not at a table
 * of the caller's. An id outside int4, which Postgres cannot compare, is no
 * session rather than a query error.
 */
export async function sa_getSessionNotes(idStorySession: number): Promise<SessionNotes | null> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStorySession);
  if (!id.success) return null;
  return notesAtUsersTable(user.id, id.data);
}

/**
 * Saves the panel. The same seat check as the read, so the storyteller and
 * the players write where they read and nobody else writes at all; the
 * schema runs again here, as every form's does. Empty text is stored as
 * null, as the Timeline's edit panel stores it.
 */
export async function sa_setSessionNotes(
  idStorySession: number,
  input: unknown,
): Promise<SetSessionNotesResult> {
  const user = await requireAccount();
  // Parsed once, and the parsed id is what the UPDATE names, so the row
  // checked is the row written.
  const id = idSchema.safeParse(idStorySession);
  if (!id.success || (await notesAtUsersTable(user.id, id.data)) === null) {
    return { ok: false, errors: { root: SESSION_NOT_AT_YOUR_TABLE } };
  }

  const parsed = sessionNotesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: formErrors(parsed.error) };
  }
  const notes = {
    notes: parsed.data.notes || null,
    lingeringQuestions: parsed.data.lingeringQuestions || null,
  };

  await db
    .update(storySessions)
    .set({ ...notes, idUpdatedByUser: user.id })
    .where(eq(storySessions.idStorySession, id.data));
  return { ok: true, notes };
}

export type SetSessionTitleResult =
  { ok: true; title: string | null } | { ok: false; error: string };

/**
 * The header's session title, renamed in place: trimmed, and cleared to null
 * when left empty, so the header goes back to "Session 3". Any session of
 * the story can be renamed, being played or not; the header only offers the
 * one at the table. The title as saved comes back.
 *
 * Refused when the title is too long, and when the session is not one of
 * this story's or the caller is not its storyteller.
 */
export async function sa_setSessionTitle(
  idStory: number,
  idStorySession: number,
  title: string,
): Promise<SetSessionTitleResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const session = idSchema.safeParse(idStorySession);
  if (!story.success || !session.success) return { ok: false, error: NOT_THIS_STORYS_SESSION };
  const parsed = sessionTitleSchema.safeParse(title);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if ((await ownedSession(user.id, session.data, { idStory: story.data })) === null) {
    return { ok: false, error: NOT_THIS_STORYS_SESSION };
  }

  const [updated] = await db
    .update(storySessions)
    .set({ title: parsed.data, idUpdatedByUser: user.id })
    .where(eq(storySessions.idStorySession, session.data))
    .returning({ title: storySessions.title });
  // Every write at the table tells the players' table over MQTT once the
  // answer has gone out; see lib/realtime/publish-scene.ts.
  publishLater(() => publishSessionUpdated(story.data, session.data, updated.title));
  return { ok: true, title: updated.title };
}

export type SuspendInactiveSessionResult =
  { ok: true; status: string } | { ok: false; error: string };

/**
 * The run table's inactivity check: the storyteller left the table untouched
 * for long enough, then said they are not playing or did not answer, so the
 * session being played is suspended, as the session chip would suspend it.
 *
 * The status trigger logs the move on the session's activity_log itself, but
 * says nothing of why, so the action appends its own `inactivity_log` entry
 * (appendActivityLog), in one transaction with the move, saying it was
 * suspended for inactivity and whether the storyteller answered. The
 * players' table is then told, as for any session status change.
 *
 * Only the story's current session, and only while it is being played: the
 * WHERE repeats both, so a session suspended or ended meanwhile (from another
 * window, say) matches nothing and is refused rather than moved again.
 */
export async function sa_suspendInactiveSession(
  idStory: number,
  idStorySession: number,
  answered: boolean,
): Promise<SuspendInactiveSessionResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const session = idSchema.safeParse(idStorySession);
  if (!story.success || !session.success) return { ok: false, error: NOT_THIS_STORYS_SESSION };
  // The answer goes into the activity log as the row's own record of why, so
  // it is held to a boolean rather than written as whatever arrived.
  const answer = z.boolean().safeParse(answered);
  if (!answer.success) return { ok: false, error: NOT_AN_ANSWER };
  if ((await playingSession(user.id, story.data)) !== session.data) {
    return { ok: false, error: SESSION_NOT_BEING_PLAYED };
  }

  const moved = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(storySessions)
      .set({ status: SESSION_STATUS.SUSPENDED, idUpdatedByUser: user.id })
      .where(
        and(
          eq(storySessions.idStorySession, session.data),
          eq(storySessions.idStory, story.data),
          inArray(storySessions.status, SESSION_PLAYING_STATUSES),
        ),
      )
      .returning({ status: storySessions.status });
    if (!row) return null;
    await appendActivityLog(
      {
        table: "story_sessions",
        recordId: session.data,
        category: "inactivity_log",
        details: "suspended for inactivity",
        source: "run table",
        userId: user.id,
        data: { answered: answer.data },
      },
      tx,
    );
    return row;
  });
  if (!moved) return { ok: false, error: SESSION_NOT_BEING_PLAYED };
  publishLater(() => publishSceneChanged(story.data));
  return { ok: true, status: moved.status };
}
