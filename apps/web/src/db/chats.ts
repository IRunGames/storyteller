import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";

import { db } from "./index";
import type { CurrentScene } from "./scene-items";
import { chats, stories, storySessions, user, userPreferences } from "./schema";
import { PROFILE_PREFERENCE_KEYS, avatarSrc, chosenProfileColor } from "@/lib/profile";
import type { PublicChat } from "@/lib/realtime/chat-events";

// The table chat's reads and writes, which the players' table, the
// storyteller's scene moves and the untap action all need, kept here for the
// reason attachment-url.ts gives: a "use server" module may only export
// server actions, so the two routes cannot lend each other a helper. No
// owner or player check here: the callers have made theirs.

/** How many lines the chat opens with, and how many more each Previous… loads. */
export const CHAT_PAGE_SIZE = 100;

/** The database, or a transaction on it, either of which can run these. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A page of lines, oldest first, and whether there are older ones still. */
export type ChatPage = { chats: PublicChat[]; hasPrevious: boolean };

/**
 * A line as every table may see it. The story's storyteller is named
 * "Storyteller", as the chat's sample has it, and anyone else by their
 * nickname, else their name. The sender's colour and picture are the ones
 * their profile card shows (lib/profile.ts), read from their preferences
 * the way the card reads them, so a line looks like the person who said it.
 */
function chatQuery(executor: Executor) {
  return executor
    .select({
      idChat: chats.idChat,
      idStoryScene: chats.idStoryScene,
      idUser: chats.idCreatedByUser,
      from: sql<string>`CASE WHEN ${chats.idCreatedByUser} = ${stories.idCreatedByUser} THEN 'Storyteller' ELSE coalesce(nullif(${user.nickName}, ''), ${user.name}, '') END`,
      text: chats.chatText,
      isSystem: chats.isSystem,
      isEdited: chats.isEdited,
      createdAt: chats.createdAt,
      storedColor: sql<
        string | null
      >`${userPreferences.preferences} ->> ${PROFILE_PREFERENCE_KEYS.color}`,
      storedAvatar: sql<
        string | null
      >`${userPreferences.preferences} ->> ${PROFILE_PREFERENCE_KEYS.avatarUrl}`,
      image: user.image,
    })
    .from(chats)
    .innerJoin(stories, eq(stories.idStory, chats.idStory))
    .leftJoin(user, eq(user.id, chats.idCreatedByUser))
    .leftJoin(userPreferences, eq(userPreferences.idUser, chats.idCreatedByUser));
}

type ChatRow = Awaited<ReturnType<ReturnType<typeof chatQuery>["where"]>>[number];

function toPublicChat({ storedColor, storedAvatar, image, ...row }: ChatRow): PublicChat {
  return {
    ...row,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    color: chosenProfileColor(storedColor ?? undefined),
    picture: avatarSrc(storedAvatar ?? undefined, image),
  };
}

/** One line by its id, as every table may see it, or null when it is not there. */
export async function chatById(
  idChat: number,
  executor: Executor = db,
): Promise<PublicChat | null> {
  const [row] = await chatQuery(executor).where(eq(chats.idChat, idChat)).limit(1);
  return row ? toPublicChat(row) : null;
}

/**
 * Saves one line, stamped with the sender, and answers with it as every
 * table may see it, ready to publish. Takes a transaction when the line is
 * part of a larger write, as the divider is part of moving to a scene.
 */
export async function insertChat(
  values: {
    idStory: number;
    idStoryScene: number | null;
    text: string;
    isSystem: boolean;
    userId: string;
  },
  executor: Executor = db,
): Promise<PublicChat> {
  const [created] = await executor
    .insert(chats)
    .values({
      idStory: values.idStory,
      idStoryScene: values.idStoryScene,
      chatText: values.text,
      isSystem: values.isSystem,
      idCreatedByUser: values.userId,
      idUpdatedByUser: values.userId,
    })
    .returning({ idChat: chats.idChat });
  const chat = await chatById(created.idChat, executor);
  // Read back in the same transaction that wrote it, so it is there.
  return chat!;
}

/**
 * The lines of the scene being played, CHAT_PAGE_SIZE at a time, newest
 * page first. With the session on no scene, the lines said on no scene
 * since this session opened, so an earlier sitting's are not brought back.
 * `before` is the id of the oldest line the table holds, for the page before
 * it; the comparison reads that row's own created_at rather than taking one
 * from the client, since JSON's milliseconds would cut the database's
 * microseconds short and skip lines said within the same millisecond.
 */
export async function listChats(
  idStory: number,
  current: CurrentScene,
  before?: number,
): Promise<ChatPage> {
  const conditions: SQL[] = [eq(chats.idStory, idStory)];
  if (current.idStoryScene !== null) {
    conditions.push(eq(chats.idStoryScene, current.idStoryScene));
  } else {
    conditions.push(isNull(chats.idStoryScene));
    conditions.push(
      sql`${chats.createdAt} >= (SELECT coalesce(${storySessions.openAt}, ${storySessions.createdAt}) FROM ${storySessions} WHERE ${storySessions.idStorySession} = ${current.idStorySession})`,
    );
  }
  if (before !== undefined) {
    conditions.push(
      sql`(${chats.createdAt}, ${chats.idChat}) < (SELECT c.created_at, c.id_chat FROM chats c WHERE c.id_chat = ${before})`,
    );
  }

  const rows = await chatQuery(db)
    .where(and(...conditions))
    .orderBy(desc(chats.createdAt), desc(chats.idChat))
    .limit(CHAT_PAGE_SIZE + 1);
  return {
    chats: rows.slice(0, CHAT_PAGE_SIZE).reverse().map(toPublicChat),
    hasPrevious: rows.length > CHAT_PAGE_SIZE,
  };
}
