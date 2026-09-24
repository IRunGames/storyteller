"use server";

import { and, desc, eq, exists, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";

const { stories, storyPlayers } = schema;

/** What the Play page's picker shows per story: the id to link and a label. */
export type PlayableStory = {
  idStory: number;
  title: string;
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
      .select({ idStory: stories.idStory, title: stories.title })
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
