import { and, eq, inArray, lt, notExists, sql } from "drizzle-orm";

import { db } from "./index";
import {
  session,
  sessionPlayers,
  storyPlayers,
  user,
  userPreferences,
  userSystems,
} from "./schema";

/**
 * Hands what a guest did at the table to the account they have just signed
 * up for or logged into: their seats, their presence at sessions and their
 * chat lines. Better Auth's anonymous plugin calls this from onLinkAccount
 * (lib/auth.ts) and then deletes the anonymous user.
 *
 * It has to run before that delete, for two reasons. chats and
 * session_players point at the user with ON DELETE SET NULL, so lines left
 * behind would lose their author. story_players, user_preferences and
 * user_systems point at it with no ON DELETE action at all, so a row left
 * behind would make the delete fail and leave the guest half-linked.
 *
 * A seat or a presence row the account already has for the same story or
 * session wins over the guest's, since the unique indexes allow only one;
 * the guest's copy is dropped. Preferences and liked systems are not
 * carried over: a guest has no page to set them on, and the account's own
 * are the ones to keep.
 */
export async function moveGuestToUser(fromId: string, toId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update story_players g set id_user = ${toId}
      where g.id_user = ${fromId}
        and not exists (
          select 1 from story_players a where a.id_user = ${toId} and a.id_story = g.id_story
        )`);
    await tx.execute(sql`delete from story_players where id_user = ${fromId}`);

    // Two unique indexes on session_players, one per session and one for
    // the waiting row of a story (db/custom/create_session_players_table.sql),
    // so a clash is checked the same two ways.
    await tx.execute(sql`
      delete from session_players g
      where g.id_created_by_user = ${fromId}
        and exists (
          select 1 from session_players a
          where a.id_created_by_user = ${toId}
            and (
              (g.id_story_session is not null and a.id_story_session = g.id_story_session)
              or (g.id_story_session is null and a.id_story_session is null and a.id_story = g.id_story)
            )
        )`);
    await tx.execute(sql`
      update session_players set id_created_by_user = ${toId} where id_created_by_user = ${fromId}`);
    await tx.execute(sql`
      update session_players set id_updated_by_user = ${toId} where id_updated_by_user = ${fromId}`);

    await tx.execute(sql`
      update chats set id_created_by_user = ${toId} where id_created_by_user = ${fromId}`);
    await tx.execute(sql`
      update chats set id_updated_by_user = ${toId} where id_updated_by_user = ${fromId}`);

    await tx.execute(sql`delete from user_preferences where id_user = ${fromId}`);
    await tx.execute(sql`delete from user_systems where id_user = ${fromId}`);
  });
}

/**
 * Deletes guests and what holds them in place: their seats, their presence
 * at sessions and in waiting rooms, and their preferences and liked systems,
 * which would otherwise block the delete (see moveGuestToUser). Their
 * Better Auth sessions go with the user row by cascade, so the cookie a
 * guest still holds stops working. Lines they wrote in a chat stay, with no
 * author, as ON DELETE SET NULL leaves them.
 *
 * Only anonymous users are deleted: an id that is not a guest's is passed
 * over, so an account cannot be deleted through here by mistake.
 *
 * Returns the stories at whose table one of them was PRESENT, so the caller
 * can publish those tables' new head counts.
 */
export async function deleteGuests(ids: string[]): Promise<number[]> {
  if (ids.length === 0) return [];
  return db.transaction(async (tx) => {
    const guests = (
      await tx
        .select({ id: user.id })
        .from(user)
        .where(and(inArray(user.id, ids), eq(user.isAnonymous, true)))
    ).map((row) => row.id);
    if (guests.length === 0) return [];

    const present = await tx
      .delete(sessionPlayers)
      .where(inArray(sessionPlayers.idCreatedByUser, guests))
      .returning({ idStory: sessionPlayers.idStory, status: sessionPlayers.status });
    await tx.delete(storyPlayers).where(inArray(storyPlayers.idUser, guests));
    await tx.delete(userPreferences).where(inArray(userPreferences.idUser, guests));
    await tx.delete(userSystems).where(inArray(userSystems.idUser, guests));
    await tx.delete(user).where(inArray(user.id, guests));

    return [
      ...new Set(present.filter((row) => row.status === "PRESENT").map((row) => row.idStory)),
    ];
  });
}

/**
 * Takes guests out of one story: their seat there and their presence at its
 * sessions and waiting room. A guest left with no seat anywhere is then
 * deleted (deleteGuests), since a guest is nothing but their seats; one
 * still seated at another story keeps that seat and their user. With `ids`,
 * only those guests; without, every guest seated at the story, as when its
 * session ends. Someone with an account is never touched.
 *
 * Returns whether one of them was PRESENT at the story's table, so the
 * caller knows to publish its new head count, and which of them were
 * deleted outright.
 */
export async function removeGuestsFromStory(
  idStory: number,
  ids?: string[],
): Promise<{ wasPresent: boolean; deleted: string[] }> {
  const seated = await db
    .select({ id: user.id })
    .from(storyPlayers)
    .innerJoin(user, eq(user.id, storyPlayers.idUser))
    .where(
      and(
        eq(storyPlayers.idStory, idStory),
        eq(user.isAnonymous, true),
        ids ? inArray(user.id, ids) : undefined,
      ),
    );
  const guests = seated.map((row) => row.id);
  if (guests.length === 0) return { wasPresent: false, deleted: [] };

  const present = await db.transaction(async (tx) => {
    const gone = await tx
      .delete(sessionPlayers)
      .where(
        and(eq(sessionPlayers.idStory, idStory), inArray(sessionPlayers.idCreatedByUser, guests)),
      )
      .returning({ status: sessionPlayers.status });
    await tx
      .delete(storyPlayers)
      .where(and(eq(storyPlayers.idStory, idStory), inArray(storyPlayers.idUser, guests)));
    return gone.some((row) => row.status === "PRESENT");
  });

  const stillSeated = new Set(
    (
      await db
        .select({ id: storyPlayers.idUser })
        .from(storyPlayers)
        .where(inArray(storyPlayers.idUser, guests))
    ).map((row) => row.id),
  );
  const unseated = guests.filter((id) => !stillSeated.has(id));
  await deleteGuests(unseated);
  return { wasPresent: present, deleted: unseated };
}

/**
 * Marks a guest's place at the story's table AWAY, as their page goes
 * (api/table/leave), and says whether there was one. Their table moves it
 * back to PRESENT as it loads again (sa_joinSession), so a reload undoes it.
 */
export async function markGuestAway(idStory: number, id: string): Promise<boolean> {
  const moved = await db
    .update(sessionPlayers)
    .set({ status: "AWAY", idUpdatedByUser: id })
    .where(
      and(
        eq(sessionPlayers.idStory, idStory),
        eq(sessionPlayers.idCreatedByUser, id),
        eq(sessionPlayers.status, "PRESENT"),
      ),
    )
    .returning({ id: sessionPlayers.idSessionPlayer });
  return moved.length > 0;
}

/** Whether the guest is still away from the story's table: no PRESENT row there. */
export async function isGuestAway(idStory: number, id: string): Promise<boolean> {
  const [present] = await db
    .select({ id: sessionPlayers.idSessionPlayer })
    .from(sessionPlayers)
    .where(
      and(
        eq(sessionPlayers.idStory, idStory),
        eq(sessionPlayers.idCreatedByUser, id),
        eq(sessionPlayers.status, "PRESENT"),
      ),
    )
    .limit(1);
  return present === undefined;
}

/**
 * Guests nobody can be any more: no Better Auth session left that has not
 * expired, so no cookie that still lets them in. A guest who closed the tab
 * rather than leaving ends up here once their session runs out, and so does
 * one a full table turned away. Made more than a day ago, so a guest in the
 * middle of signing in is never caught between their row and their session.
 */
export async function lapsedGuests(): Promise<string[]> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.isAnonymous, true),
        lt(user.createdAt, sql`now() - interval '1 day'`),
        notExists(
          db
            .select({ one: sql`1` })
            .from(session)
            .where(and(eq(session.userId, user.id), sql`${session.expiresAt} > now()`)),
        ),
      ),
    );
  return rows.map((row) => row.id);
}
