"use server";

import { redirect } from "next/navigation";
import { and, desc, eq, exists, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { idSchema, titleSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import { appendActivityLog } from "@/db/activity-log";
import { hasOpenSession } from "@/db/open-session";
import { presentCount, waitingCount } from "@/db/session-player-counts";
import { ownedSession, playingSession } from "@/db/story-access";
import { requireAccount } from "@/lib/authorize";
import { formatDayUtc } from "@/lib/dates";
import { newSessionTitle } from "@/lib/play";
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

const { stories, storyPlayers, storySessions, vStorySessions } = schema;

// The session at the table: its notes panel (SessionNotesPopover), written
// up by the storyteller and the players alike, and the storyteller's control
// of it from the run table's header, the title and the inactivity check.
// Then the opening of one, below: the stories the Play page's picker offers,
// the sessions the session popover offers to carry on, and sa_startPlaying,
// which makes one the story's current session and sends the storyteller to
// the table. Every action here starts with requireAccount(); the notes are
// read through the caller's seat, the controls through the story's
// storyteller.

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

// The title the picker sends for a new session. Only its length is held to
// anything: it is the storyteller's own text, renamed freely afterwards.
// Not the header's sessionTitleSchema, which clears an empty title to null:
// a new session always gets a title, the day's when none comes.
const newSessionTitleSchema = titleSchema("session");

/** What the Play page's picker shows per story: the id to link and a label. */
export type PlayableStory = {
  idStory: number;
  title: string;
  /** The caller tells this story, so Play opens the session popover. */
  isOwner: boolean;
  /** Who is at its table, for the Play button's count and glow, as on a card. */
  hasOpenSession: boolean;
  waitingCount: number;
  presentCount: number;
};

/**
 * Every active story the caller owns or plays in, newest first. Unpaged, unlike
 * the card lists in stories/actions.ts: this fills a select, which has no
 * "More" button, and a person is in few enough stories for that to be fine.
 * Retired stories are left out because there is no table to open for them.
 */
export async function sa_listPlayableStories(): Promise<PlayableStory[]> {
  const user = await requireAccount();

  // A correlated EXISTS rather than a join, so a story the caller both owns
  // and has a player row in still comes back once.
  const playsIn = db
    .select({ one: storyPlayers.idStoryPlayer })
    .from(storyPlayers)
    .where(and(eq(storyPlayers.idStory, stories.idStory), eq(storyPlayers.idUser, user.id)));

  return (
    db
      .select({
        idStory: stories.idStory,
        title: stories.title,
        // NULL = userId is NULL in SQL, and Boolean(null) is false, so a
        // story with no recorded creator has no owner rather than an error.
        isOwner: eq(stories.idCreatedByUser, user.id).mapWith(Boolean),
        // The same counts a story card's Play shows, worked out the same way
        // (cardColumns in db/story-cards.ts): everyone waiting but the
        // caller, and everyone present at an open session.
        hasOpenSession,
        waitingCount: waitingCount(stories.idStory, user.id),
        presentCount: presentCount(),
      })
      .from(stories)
      .where(
        and(or(eq(stories.idCreatedByUser, user.id), exists(playsIn)), eq(stories.isActive, true)),
      )
      // The seed inserts its stories in one statement, so updated_at ties are
      // common; id_story breaks them the same way the card lists do.
      .orderBy(desc(stories.updatedAt), desc(stories.idStory))
  );
}

/** A session the storyteller can carry on with, as the session picker lists it. */
export type UnfinishedSession = {
  idStorySession: number;
  /** Its place in the story's opening order, as the story page numbers it. */
  number: number;
  title: string | null;
  status: string;
};

/**
 * The sessions of a story the caller tells that are not DONE, most recently
 * touched first, for the picker's second select. A story that is not the
 * caller's, or is not there, has none: only its storyteller opens sessions.
 */
export async function sa_listUnfinishedSessions(idStory: number): Promise<UnfinishedSession[]> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStory);
  if (!id.success) return [];

  return (
    db
      // v_story_sessions numbers each session as the Timeline does. Its
      // columns are nullable to Drizzle but never null for a row of the
      // table, so the ones the picker needs are typed as the table has them.
      .select({
        idStorySession: sql<number>`${vStorySessions.idStorySession}`,
        number: sql<number>`${vStorySessions.sessionNumber}`.mapWith(Number),
        title: vStorySessions.title,
        status: sql<string>`${vStorySessions.status}`,
      })
      .from(vStorySessions)
      .innerJoin(stories, eq(stories.idStory, vStorySessions.idStory))
      .where(
        and(
          eq(vStorySessions.idStory, id.data),
          eq(stories.idCreatedByUser, user.id),
          ne(vStorySessions.status, SESSION_STATUS.DONE),
        ),
      )
      // Sessions opened in one statement share an updated_at, so the id
      // breaks the tie the same way the session lists do.
      .orderBy(desc(vStorySessions.updatedAt), desc(vStorySessions.idStorySession))
  );
}

export type StartPlayingResult = { ok: false; error: string };

/**
 * Opens the table for a story the caller tells, then sends them to it. With
 * no session given, a new one is created; it starts OPEN, the workflow's
 * default, and is titled with the title given, which the picker builds from
 * the storyteller's own day ("Oct 6, 2026 session"). Without a usable one it
 * falls back to the UTC day, the only day the server knows. With one, it must be this story's and not DONE: a SUSPENDED
 * session is RESUMED, and an OPEN or RESUMED one is carried on as it is.
 * Either way it becomes the story's current session (stories.id_story_session),
 * which is what the table and the waiting room read.
 *
 * Any other session still open is left as it was: moving the pointer does
 * not close it, and it stays in the picker until it is marked DONE. Every
 * table of the story is told the scene changed.
 */
export async function sa_startPlaying(
  idStory: number,
  idStorySession: number | null,
  title?: string,
): Promise<StartPlayingResult> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const session = idSchema.nullable().safeParse(idStorySession);
  if (!story.success || !session.success) {
    return { ok: false, error: "That story or session could not be found." };
  }

  const result = await db.transaction(async (tx): Promise<StartPlayingResult | null> => {
    const [owned] = await tx
      .select({ idStory: stories.idStory })
      .from(stories)
      .where(
        and(
          eq(stories.idStory, story.data),
          eq(stories.idCreatedByUser, user.id),
          eq(stories.isActive, true),
        ),
      )
      .limit(1);
    if (!owned) {
      return { ok: false, error: "Only the storyteller can open this story's table." };
    }

    let id: number;
    if (session.data === null) {
      const [created] = await tx
        .insert(storySessions)
        .values({
          idStory: story.data,
          title:
            newSessionTitleSchema.safeParse(title).data ??
            newSessionTitle(formatDayUtc(new Date())),
          idCreatedByUser: user.id,
          idUpdatedByUser: user.id,
        })
        .returning({ id: storySessions.idStorySession });
      id = created.id;
    } else {
      const [existing] = await tx
        .select({ status: storySessions.status })
        .from(storySessions)
        .where(
          and(
            eq(storySessions.idStorySession, session.data),
            eq(storySessions.idStory, story.data),
          ),
        )
        .limit(1);
      if (!existing || existing.status === SESSION_STATUS.DONE) {
        return { ok: false, error: "That session has ended. Choose another or create a new one." };
      }
      if (existing.status === SESSION_STATUS.SUSPENDED) {
        await tx
          .update(storySessions)
          .set({ status: SESSION_STATUS.RESUMED, idUpdatedByUser: user.id })
          .where(eq(storySessions.idStorySession, session.data));
      }
      id = session.data;
    }

    await tx
      .update(stories)
      .set({ idStorySession: id, idUpdatedByUser: user.id })
      .where(eq(stories.idStory, story.data));
    return null;
  });
  if (result) return result;
  // The players' waiting rooms and tables follow the story's pointer: a
  // table open on the session that was current before, or waiting for one,
  // hears the story is being played and reads the scene afresh.
  publishLater(() => publishSceneChanged(story.data));

  // Outside the transaction: redirect() throws to navigate, which would
  // otherwise roll it back. Straight to the storyteller's own table rather
  // than through /stories/[id]/play, which would only send them on.
  redirect(`/stories/${story.data}/run`);
}
