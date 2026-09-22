"use server";

import { and, desc, eq, exists, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";

const { games, gamePlayers } = schema;

/** What the Play page's picker shows per story: the id to link and a label. */
export type PlayableStory = {
  idGame: number;
  gameTitle: string;
};

/**
 * Every active game the caller owns or plays in, newest first. Unpaged, unlike
 * the card lists in stories/actions.ts: this fills a select, which has no
 * "More" button, and a person is in few enough games for that to be fine.
 * Retired games are left out because there is no table to open for them.
 */
export async function sa_listPlayableStories(): Promise<PlayableStory[]> {
  const user = await requireUser();

  // A correlated EXISTS rather than a join, so a game the caller both owns
  // and has a player row in still comes back once.
  const playsIn = db
    .select({ one: gamePlayers.idGamePlayer })
    .from(gamePlayers)
    .where(
      and(
        eq(gamePlayers.idGame, games.idGame),
        eq(gamePlayers.idUser, user.id),
      ),
    );

  return (
    db
      .select({ idGame: games.idGame, gameTitle: games.gameTitle })
      .from(games)
      .where(
        and(
          or(eq(games.idCreatedByUser, user.id), exists(playsIn)),
          eq(games.isActive, true),
        ),
      )
      // The seed inserts its games in one statement, so updated_at ties are
      // common; id_game breaks them the same way the card lists do.
      .orderBy(desc(games.updatedAt), desc(games.idGame))
  );
}
