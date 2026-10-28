"use server";

import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { requireUser } from "@/lib/authorize";
import { getSession } from "@/lib/require-session";
import { joinCap, TABLE_FULL } from "@/lib/join";
import { nicknameSchema } from "@/lib/join-schemas";

const { stories, storyPlayers, user: users } = schema;

// The codes sa_getJoinLink makes are 12 base64url characters; anything that
// could not be one is turned away before it reaches the query.
const codeSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const GONE = "This link does not lead to a table any more.";

// The seats a story's link has given out, which its cap is counted against.
const fromLink = (idStory: number) =>
  and(eq(storyPlayers.idStory, idStory), eq(storyPlayers.isFromLink, true));

export type JoinStory = {
  idStory: number;
  title: string;
  imageUrl: string | null;
  /** Every seat the link may give out is taken. */
  isFull: boolean;
  /** The visitor already tells or plays this story, so the link just takes them to it. */
  isAtTable: boolean;
};

/**
 * The story a join link names, for /join/[code] to show before anyone has
 * an account. This is the one action that does not start with requireUser():
 * whoever holds the link may see the story's title and cover, which is what
 * the storyteller handed the link out for. Nothing else about the story
 * leaves here. A signed-in visitor is also told whether they are already at
 * the table, read from the session alone, so the page can send them on.
 * Archived stories have no table, so their links lead nowhere.
 */
export async function sa_getJoinStory(code: string): Promise<JoinStory | null> {
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) return null;

  const [story] = await db
    .select({
      idStory: stories.idStory,
      title: stories.title,
      imageUrl: attachmentUrl("STORY", "stories", "id_story"),
      idCreatedByUser: stories.idCreatedByUser,
      ownerType: users.idUserType,
    })
    .from(stories)
    .leftJoin(users, eq(users.id, stories.idCreatedByUser))
    .where(and(eq(stories.joinCode, parsed.data), eq(stories.isArchived, false)))
    .limit(1);
  if (!story) return null;

  const [[taken], session] = await Promise.all([
    db.select({ n: count() }).from(storyPlayers).where(fromLink(story.idStory)),
    getSession(),
  ]);
  const viewer = session?.user.id ?? null;
  let isAtTable = viewer !== null && viewer === story.idCreatedByUser;
  if (viewer !== null && !isAtTable) {
    const [seat] = await db
      .select({ one: storyPlayers.idStoryPlayer })
      .from(storyPlayers)
      .where(and(eq(storyPlayers.idStory, story.idStory), eq(storyPlayers.idUser, viewer)))
      .limit(1);
    isAtTable = seat !== undefined;
  }

  return {
    idStory: story.idStory,
    title: story.title,
    imageUrl: story.imageUrl,
    isFull: taken.n >= joinCap(story.ownerType ?? 0),
    isAtTable,
  };
}

export type JoinByLinkResult = { ok: true; idStory: number } | { ok: false; error: string };

/**
 * Takes a seat at the story a join link names. The join form calls it once
 * the visitor has a session: their own, or the anonymous one it has just
 * signed them into. A guest's nickname names their user row, since a guest
 * has no profile to set one on; someone with an account keeps their own.
 *
 * The storyteller and anyone already seated are let through without a new
 * seat, so following the link again is harmless. Otherwise the seats the
 * link has given out are counted against the storyteller's plan
 * (lib/join.ts), with the story row locked for the length of the
 * transaction so two people joining at once cannot both take the last seat.
 */
export async function sa_joinByLink(code: string, nickname: string): Promise<JoinByLinkResult> {
  const user = await requireUser();
  const parsedCode = codeSchema.safeParse(code);
  if (!parsedCode.success) return { ok: false, error: GONE };
  const name = nicknameSchema.safeParse(nickname);
  if (user.isAnonymous && !name.success) {
    return { ok: false, error: name.error.issues[0].message };
  }

  return db.transaction(async (tx) => {
    const [story] = await tx
      .select({ idStory: stories.idStory, idCreatedByUser: stories.idCreatedByUser })
      .from(stories)
      .where(and(eq(stories.joinCode, parsedCode.data), eq(stories.isArchived, false)))
      .for("update")
      .limit(1);
    if (!story) return { ok: false, error: GONE } as const;

    if (user.isAnonymous && name.success) {
      await tx
        .update(users)
        .set({ name: name.data, nickName: name.data })
        .where(eq(users.id, user.id));
    }

    if (story.idCreatedByUser === user.id) return { ok: true, idStory: story.idStory } as const;

    const [seat] = await tx
      .select({ one: storyPlayers.idStoryPlayer })
      .from(storyPlayers)
      .where(and(eq(storyPlayers.idStory, story.idStory), eq(storyPlayers.idUser, user.id)))
      .limit(1);
    if (seat) return { ok: true, idStory: story.idStory } as const;

    const [owner] = story.idCreatedByUser
      ? await tx
          .select({ idUserType: users.idUserType })
          .from(users)
          .where(eq(users.id, story.idCreatedByUser))
      : [];
    const [taken] = await tx
      .select({ n: count() })
      .from(storyPlayers)
      .where(fromLink(story.idStory));
    if (taken.n >= joinCap(owner?.idUserType ?? 0))
      return { ok: false, error: TABLE_FULL } as const;

    await tx
      .insert(storyPlayers)
      .values({ idStory: story.idStory, idUser: user.id, isFromLink: true });
    return { ok: true, idStory: story.idStory } as const;
  });
}
