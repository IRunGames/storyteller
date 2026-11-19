"use server";

import { randomBytes } from "node:crypto";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { idSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import { removeSeat } from "@/db/seats";
import { ownedStory } from "@/db/story-access";
import { requireAccount } from "@/lib/authorize";
import { recountTable, removeGuestsFrom } from "@/lib/guests";
import { joinCap } from "@/lib/join";
import { WAITING_STALE_SECONDS } from "@/lib/play";
import { publishLater } from "@/lib/realtime/publish";
import { publishSceneChanged } from "@/lib/realtime/publish-scene";

const { stories, storyPlayers, user: users } = schema;

// The story's join link and who came in by it: the link button in the run
// table's header, which hands the link out, counts its seats and lists and
// removes the people who took one. Beside the run page, since only its
// header hands the link out. Every action here
// starts with requireAccount() and answers only the story's storyteller.

export type JoinLink = {
  /** The code in /join/<code>; the page builds the link from its own origin. */
  code: string;
  /** Seats the link has given out so far. */
  joined: number;
  /** How many it may give out, by the storyteller's plan (lib/join.ts). */
  cap: number;
};

/** How many seats the story's link has given out. */
async function seatsFromLink(idStory: number): Promise<number> {
  const [taken] = await db
    .select({ n: count() })
    .from(storyPlayers)
    .where(and(eq(storyPlayers.idStory, idStory), eq(storyPlayers.isFromLink, true)));
  return taken.n;
}

/**
 * The story's join link, for the storyteller to hand to people without an
 * account, made the first time it is asked for and kept after that, so a
 * link already sent keeps working: coalesce in the UPDATE leaves one that is
 * there alone, and two tabs asking at once get the same code. Nine random
 * bytes make a 12-character base64url code, too many to guess. Named for
 * what it does, since asking may write; sa_getJoinCount reads alone. Null
 * for anyone but the story's storyteller.
 */
export async function sa_getOrCreateJoinLink(idStory: number): Promise<JoinLink | null> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStory);
  if (!id.success) return null;

  const fresh = randomBytes(9).toString("base64url");
  const [story] = await db
    .update(stories)
    .set({ joinCode: sql`coalesce(${stories.joinCode}, ${fresh})` })
    .where(and(eq(stories.idStory, id.data), eq(stories.idCreatedByUser, user.id)))
    .returning({ code: stories.joinCode });
  if (!story?.code) return null;

  return { code: story.code, joined: await seatsFromLink(id.data), cap: joinCap(user.idUserType) };
}

/**
 * How many seats the story's link has given out and how many it may, for
 * the chip on the storyteller's link button. Unlike sa_getOrCreateJoinLink
 * it makes no code, so the table can ask on every load. Null for anyone but
 * the story's storyteller.
 */
export async function sa_getJoinCount(
  idStory: number,
): Promise<Pick<JoinLink, "joined" | "cap"> | null> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStory);
  if (!id.success) return null;
  if ((await ownedStory(user.id, id.data)) === null) return null;
  return { joined: await seatsFromLink(id.data), cap: joinCap(user.idUserType) };
}

/** Where someone who came in by the link is: their presence row's status, or null for nowhere. */
export type LinkPlayerStatus = "PRESENT" | "AWAY" | "WAITING" | "LEFT" | null;

export type LinkPlayer = {
  idUser: string;
  name: string;
  /** Came in with no account (is_anonymous); removing them deletes them. */
  isGuest: boolean;
  status: LinkPlayerStatus;
};

/**
 * Everyone seated at the story by its join link, guests and accounts alike,
 * with where each is now: their row at the session being played, or failing
 * that their waiting-room row, as long as its heartbeat is fresh
 * (WAITING_STALE_SECONDS), since a closed waiting room leaves its row
 * WAITING. Loaded only when the storyteller asks, from the link button.
 * Empty for anyone but the story's storyteller.
 */
export async function sa_listLinkPlayers(idStory: number): Promise<LinkPlayer[]> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStory);
  if (!id.success) return [];

  const atSession = sql<string | null>`(
    select sp.status from session_players sp
    where sp.id_story_session = ${stories.idStorySession}
      and sp.id_created_by_user = ${storyPlayers.idUser}
    limit 1
  )`;
  const waiting = sql<string | null>`(
    select sp.status from session_players sp
    where sp.id_story = ${stories.idStory}
      and sp.id_story_session is null
      and sp.id_created_by_user = ${storyPlayers.idUser}
      and (sp.status <> 'WAITING'
        or sp.updated_at > now() - make_interval(secs => ${WAITING_STALE_SECONDS}))
    limit 1
  )`;
  const rows = await db
    .select({
      idUser: users.id,
      name: sql<string>`coalesce(${users.nickName}, ${users.name})`,
      isGuest: users.isAnonymous,
      status: sql<string | null>`coalesce(${atSession}, ${waiting})`,
    })
    .from(storyPlayers)
    .innerJoin(stories, eq(stories.idStory, storyPlayers.idStory))
    .innerJoin(users, eq(users.id, storyPlayers.idUser))
    .where(
      and(
        eq(storyPlayers.idStory, id.data),
        eq(storyPlayers.isFromLink, true),
        eq(stories.idCreatedByUser, user.id),
      ),
    )
    .orderBy(asc(storyPlayers.idStoryPlayer));
  return rows.map((row) => ({ ...row, status: row.status as LinkPlayerStatus }));
}

export type RemoveLinkPlayerResult = { ok: true } | { ok: false; error: string };

/**
 * Takes someone who came in by the link out of the story: their seat and
 * their presence at its sessions and waiting room (removeSeat). A guest
 * seated nowhere else is deleted as well (lib/guests.ts), so their cookie
 * stops working; someone with an account keeps it and simply has no seat
 * here. Every table is told the scene changed, so the removed person's table
 * reloads and finds it is no longer theirs, and the head count is published
 * again when they were at the table. Only seats from the link: the
 * storyteller removes invited players from the story's page.
 */
export async function sa_removeLinkPlayer(
  idStory: number,
  idUser: string,
): Promise<RemoveLinkPlayerResult> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStory);
  const who = z.string().uuid().safeParse(idUser);
  const notHere = { ok: false, error: "That is not someone who joined by the link." } as const;
  if (!id.success || !who.success) return notHere;

  const [seat] = await db
    .select({ isGuest: users.isAnonymous })
    .from(storyPlayers)
    .innerJoin(stories, eq(stories.idStory, storyPlayers.idStory))
    .innerJoin(users, eq(users.id, storyPlayers.idUser))
    .where(
      and(
        eq(storyPlayers.idStory, id.data),
        eq(storyPlayers.idUser, who.data),
        eq(storyPlayers.isFromLink, true),
        eq(stories.idCreatedByUser, user.id),
      ),
    )
    .limit(1);
  if (!seat) return notHere;

  if (seat.isGuest) {
    await removeGuestsFrom(id.data, [who.data]);
  } else {
    const removed = await db.transaction((tx) => removeSeat(id.data, who.data, tx));
    if (removed.wasPresent) recountTable(id.data);
  }
  publishLater(() => publishSceneChanged(id.data));
  return { ok: true };
}
