"use server";

import { and, eq, exists, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAccount } from "@/lib/authorize";
import { sessionNotesSchema } from "@/lib/session-schemas";

const { stories, storyPlayers, storySessions } = schema;

// The tables' session panel (SessionNotesPopover): the notes and lingering
// questions of the session being played, written up as it goes by the
// storyteller and the players alike. Every action here starts with
// requireAccount(), and reads the session through the caller's seat.

const idSchema = z.int32();

/** The session's notes and lingering questions as stored; null for one not written. */
export type SessionNotes = { notes: string | null; lingeringQuestions: string | null };

export type SetSessionNotesResult =
  { ok: true; notes: SessionNotes } | { ok: false; errors: Record<string, string> };

const NOT_AT_THIS_TABLE = "This session is not at a table of yours.";

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
  const id = idSchema.safeParse(idStorySession);
  if (!id.success) return null;

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
        eq(storySessions.idStorySession, id.data),
        or(eq(stories.idCreatedByUser, userId), seated),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The panel's fields as it opens, or null when the session is not at a table of the caller's. */
export async function sa_getSessionNotes(idStorySession: number): Promise<SessionNotes | null> {
  const user = await requireAccount();
  return notesAtUsersTable(user.id, idStorySession);
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
  if ((await notesAtUsersTable(user.id, idStorySession)) === null) {
    return { ok: false, errors: { root: NOT_AT_THIS_TABLE } };
  }

  const parsed = sessionNotesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join(".") || "root", issue.message]),
      ),
    };
  }
  const notes = {
    notes: parsed.data.notes || null,
    lingeringQuestions: parsed.data.lingeringQuestions || null,
  };

  await db
    .update(storySessions)
    .set({ ...notes, idUpdatedByUser: user.id })
    .where(eq(storySessions.idStorySession, idStorySession));
  return { ok: true, notes };
}
