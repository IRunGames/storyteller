import { sql } from "drizzle-orm";

import { db } from "./index";

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
