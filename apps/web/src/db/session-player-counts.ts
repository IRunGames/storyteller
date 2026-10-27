import { and, eq, gt, isNull, sql, type SQLWrapper } from "drizzle-orm";

import { db } from "./index";
import { sessionPlayers, stories } from "./schema";
import { WAITING_STALE_SECONDS } from "@/lib/play";

/**
 * How many players are in a story's waiting room: its session_players rows
 * with no session yet, WAITING, and a heartbeat newer than
 * WAITING_STALE_SECONDS. Nothing moves a quiet row out of WAITING, so the
 * heartbeat is what tells a player still there from a closed tab.
 *
 * excludeUserId leaves one person out. The story card passes the viewer, so
 * a player waiting in another tab is not counted as someone else waiting;
 * the waiting room passes nobody, since its count includes the reader.
 *
 * A correlated scalar subquery on the outer row's story, for the reason
 * favoritedBy in stories/actions.ts gives: it never duplicates or drops the
 * outer row, and so is presentCount below. Both live here because the card
 * (stories/actions.ts) and the play pages (play/[id]/actions.ts) must count
 * the same way, and a "use server" module may only export server actions.
 */
export function waitingCount(idStory: SQLWrapper, excludeUserId?: string) {
  return sql<number>`(
    select count(*) from ${sessionPlayers}
    where ${and(
      eq(sessionPlayers.idStory, idStory),
      isNull(sessionPlayers.idStorySession),
      eq(sessionPlayers.status, "WAITING"),
      gt(sessionPlayers.updatedAt, sql`now() - make_interval(secs => ${WAITING_STALE_SECONDS})`),
      // IS DISTINCT FROM, not <>: a row whose player was deleted has a null
      // id_created_by_user, and <> would drop it rather than count it.
      excludeUserId === undefined
        ? undefined
        : sql`${sessionPlayers.idCreatedByUser} is distinct from ${excludeUserId}`,
    )}
  )`.mapWith(Number);
}

/**
 * How many players are at the table: PRESENT session_players rows for the
 * story's current session (stories.id_story_session). The outer row must be
 * a stories row. Zero between sessions, when the pointer is null and so
 * matches nothing. PRESENT has no heartbeat to go stale on yet, so a player
 * who closed the table without leaving is still counted until something
 * moves them on. Whatever does move a player into or out of PRESENT must
 * also publish the table's new count (publishTableCount), as sa_joinSession
 * does, or the table chat's header falls behind.
 */
export function presentCount() {
  return sql<number>`(
    select count(*) from ${sessionPlayers}
    where ${and(
      eq(sessionPlayers.idStorySession, stories.idStorySession),
      eq(sessionPlayers.status, "PRESENT"),
    )}
  )`.mapWith(Number);
}

/**
 * How many are at a story's table, as the table chat's header shows it: the
 * players present (presentCount) and the storyteller. Zero while no session
 * is being played, since there is no table to be at.
 */
export async function atTableCount(idStory: number): Promise<number> {
  const [row] = await db
    .select({
      present: presentCount(),
      playing: sql<boolean>`${stories.idStorySession} is not null`,
    })
    .from(stories)
    .where(eq(stories.idStory, idStory))
    .limit(1);
  return row?.playing ? row.present + 1 : 0;
}
