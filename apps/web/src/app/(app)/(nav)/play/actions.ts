"use server";

import { redirect } from "next/navigation";
import { and, desc, eq, exists, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { sessionNumber } from "@/db/session-number";
import { requireUser } from "@/lib/authorize";
import { formatDayUtc } from "@/lib/dates";
import { newSessionTitle } from "@/lib/play";

const { stories, storyPlayers, storySessions } = schema;

// stories.id_story and story_sessions.id_story_session are int4; an id
// outside that range is a query error to Postgres rather than a missing row.
const idSchema = z.number().int().min(-2147483648).max(2147483647);

// The title the picker sends for a new session. Only its length is held to
// anything: it is the storyteller's own text, renamed freely afterwards.
const titleSchema = z.string().trim().min(1).max(200);

/** What the Play page's picker shows per story: the id to link and a label. */
export type PlayableStory = {
  idStory: number;
  title: string;
  /** The caller tells this story, so the picker offers its sessions. */
  isOwner: boolean;
};

/**
 * Every active story the caller owns or plays in, newest first. Unpaged, unlike
 * the card lists in stories/actions.ts: this fills a select, which has no
 * "More" button, and a person is in few enough stories for that to be fine.
 * Retired stories are left out because there is no table to open for them.
 */
export async function sa_listPlayableStories(): Promise<PlayableStory[]> {
  const user = await requireUser();

  // A correlated EXISTS rather than a join, so a story the caller both owns
  // and has a player row in still comes back once.
  const playsIn = db
    .select({ one: storyPlayers.idStoryPlayer })
    .from(storyPlayers)
    .where(
      and(
        eq(storyPlayers.idStory, stories.idStory),
        eq(storyPlayers.idUser, user.id),
      ),
    );

  return (
    db
      .select({
        idStory: stories.idStory,
        title: stories.title,
        // NULL = userId is NULL in SQL, and Boolean(null) is false, so a
        // story with no recorded creator has no owner rather than an error.
        isOwner: eq(stories.idCreatedByUser, user.id).mapWith(Boolean),
      })
      .from(stories)
      .where(
        and(
          or(eq(stories.idCreatedByUser, user.id), exists(playsIn)),
          eq(stories.isActive, true),
        ),
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
  const user = await requireUser();
  const id = idSchema.safeParse(idStory);
  if (!id.success) return [];

  return (
    db
      .select({
        idStorySession: storySessions.idStorySession,
        number: sessionNumber(),
        title: storySessions.title,
        status: storySessions.status,
      })
      .from(storySessions)
      .innerJoin(stories, eq(stories.idStory, storySessions.idStory))
      .where(
        and(
          eq(storySessions.idStory, id.data),
          eq(stories.idCreatedByUser, user.id),
          ne(storySessions.status, "DONE"),
        ),
      )
      // Sessions opened in one statement share an updated_at, so the id
      // breaks the tie the same way the session lists do.
      .orderBy(desc(storySessions.updatedAt), desc(storySessions.idStorySession))
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
 * not close it, and it stays in the picker until it is marked DONE.
 */
export async function sa_startPlaying(
  idStory: number,
  idStorySession: number | null,
  title?: string,
): Promise<StartPlayingResult> {
  const user = await requireUser();
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
          title: titleSchema.safeParse(title).data ?? newSessionTitle(formatDayUtc(new Date())),
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
      if (!existing || existing.status === "DONE") {
        return { ok: false, error: "That session has ended. Choose another or create a new one." };
      }
      if (existing.status === "SUSPENDED") {
        await tx
          .update(storySessions)
          .set({ status: "RESUMED", idUpdatedByUser: user.id })
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

  // Outside the transaction: redirect() throws to navigate, which would
  // otherwise roll it back.
  redirect(`/play/${story.data}`);
}
