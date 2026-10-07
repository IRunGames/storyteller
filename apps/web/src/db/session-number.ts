import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "./index";
import { storySessions } from "./schema";

/**
 * The outer session's place in its story's opening order, counted the way
 * the story page's list sorts so the oldest is 1 and the newest is the
 * count. count(*) is a bigint, which the driver hands over as a string.
 *
 * It lives here rather than in stories/actions.ts because the Play page's
 * session picker numbers sessions the same way, and a "use server" module
 * may only export server actions; see attachment-url.ts.
 */
export function sessionNumber() {
  const earlier = alias(storySessions, "earlier");
  return sql<number>`(${db
    .select({ n: sql`count(*) + 1` })
    .from(earlier)
    .where(
      and(
        eq(earlier.idStory, storySessions.idStory),
        sql`(${earlier.createdAt}, ${earlier.idStorySession}) < (${storySessions.createdAt}, ${storySessions.idStorySession})`,
      ),
    )})`.mapWith(Number);
}
