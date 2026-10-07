import { and, eq, exists, inArray } from "drizzle-orm";

import { db } from "./index";
import { stories, storySessions } from "./schema";

/**
 * Whether the story on the outer row has a session being played: its current
 * session (stories.id_story_session) is OPEN or RESUMED. A session that came
 * back from a pause is at the table just as much as one that never paused.
 * A correlated EXISTS, so it never duplicates or drops the outer row, and it
 * reads the pointer rather than searching story_sessions for such a row: the
 * pointer is what the table runs on, so the card, the table and the waiting
 * room can never disagree.
 *
 * The workflow in s_statuses says what a session may be and what it may
 * become, but not which of its statuses mean play is under way, so that
 * judgement has nowhere else to live yet; a flag on s_statuses would be the
 * place for it. Until there is one, a workflow renamed in the database has to
 * be followed up in three places by hand: here, SESSION_STATUS_WORDING in
 * lib/stories.ts, which turns these same two keys into words, and the scene
 * order in sa_getStorySession, which reads the active_at column that the
 * ACTIVE key gives its name to.
 *
 * It lives here rather than in stories/actions.ts because play/[id] needs it
 * too, and a "use server" module may only export server actions; see
 * attachment-url.ts.
 */
export const hasOpenSession = exists(
  db
    .select({ one: storySessions.idStorySession })
    .from(storySessions)
    .where(
      and(
        eq(storySessions.idStorySession, stories.idStorySession),
        inArray(storySessions.status, ["OPEN", "RESUMED"]),
      ),
    ),
).mapWith(Boolean);
