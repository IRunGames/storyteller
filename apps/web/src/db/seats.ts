import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { sessionPlayers, storyFavorites, storyPlayers } from "./schema";

/** Anything that can delete: the pool, or the transaction a caller is already inside. */
type Executor = Pick<typeof db, "delete">;

/** What taking a seat away found: whether there was one, and whether its holder was at the table. */
export type RemovedSeat = { wasSeated: boolean; wasPresent: boolean };

/**
 * Takes one person's seat at a story away, whole: their story_players row,
 * their presence at its sessions and in its waiting room (session_players),
 * and their favorite of it, which is a seat at a table they no longer have
 * and would otherwise keep the story on a page they can no longer play
 * from. Four actions used to do some of this each (the story page's Remove
 * and Leave, the link button's Remove, and the guests' removal), and only
 * one of them recounted the table. The caller publishes: the table's head
 * count when `wasPresent`, since the chat header counts the seats, and the
 * scene when the removed person's table should find it is no longer theirs.
 * Removing someone who is not seated is not an error: the rows are gone
 * either way, which is what the caller wanted.
 */
export async function removeSeat(
  idStory: number,
  idUser: string,
  executor: Executor = db,
): Promise<RemovedSeat> {
  const gone = await executor
    .delete(sessionPlayers)
    .where(and(eq(sessionPlayers.idStory, idStory), eq(sessionPlayers.idCreatedByUser, idUser)))
    .returning({ status: sessionPlayers.status });
  const seats = await executor
    .delete(storyPlayers)
    .where(and(eq(storyPlayers.idStory, idStory), eq(storyPlayers.idUser, idUser)))
    .returning({ id: storyPlayers.idStoryPlayer });
  await executor
    .delete(storyFavorites)
    .where(and(eq(storyFavorites.idStory, idStory), eq(storyFavorites.idUser, idUser)));
  return {
    wasSeated: seats.length > 0,
    wasPresent: gone.some((row) => row.status === "PRESENT"),
  };
}
