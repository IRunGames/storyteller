"use server";

import { redirect } from "next/navigation";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { idSchema, offsetSchema, searchSchema, titleSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { createInvitation, emailInvitation } from "@/db/invitations";
import { removeSeat } from "@/db/seats";
import { ownedSession, ownedStory, storyAccess, storyReadership } from "@/db/story-access";
import {
  cardOrder,
  cardQuery,
  favoritedBy,
  notArchived,
  playerCount,
  playerName,
  playMinutes,
  sessionCount,
} from "@/db/story-cards";
import { requireAccount, requireUser } from "@/lib/authorize";
import { likeContains } from "@/lib/filter-text";
import { recountTable } from "@/lib/guests";
import { publishLater } from "@/lib/realtime/publish";
import { publishSceneChanged, publishSessionUpdated } from "@/lib/realtime/publish-scene";
import { safeRedirect } from "@/lib/safe-redirect";
import {
  MY_STORIES_PAGE_SIZE,
  myStoryListQuerySchema,
  type StorySortKey,
} from "@/lib/story-list-schemas";
import {
  PAGE_SIZE,
  PLAYER_SEARCH_LIMIT,
  SESSIONS_PAGE_SIZE,
  systemLabel,
  type PlayerMatch,
  type StoryCardData,
  type StoryPlayer,
  type SessionForEdit,
  type StorySession,
  type StorySessionDetail,
  type UpdateSessionResult,
} from "@/lib/stories";
import { storyInviteSchema } from "@/lib/invitation-schemas";
import { SCENE_LOCKED_STATUS, SESSION_DONE_STATUS, SESSION_STATUS } from "@/lib/status";
import { sessionEditSchema } from "@/lib/session-schemas";
import { storySchema, type StoryValues } from "@/lib/story-schemas";
import { formErrors } from "@/lib/forms";
import { NOT_A_PLAYER, NOT_YOUR_SESSION, STORY_NOT_FOUND, STORY_NOT_YOURS } from "@/lib/messages";

const {
  invitations,
  stories,
  systems,
  storyPlayers,
  storyFavorites,
  storyScenes,
  storySessions,
  sessionPlayers,
  user: users,
  vStorySessions,
} = schema;

// Every export here is a server action: it is the only way the Stories pages
// touch the database, and each one starts by proving who is asking.

// A page size the caller may ask for. The floor keeps a zero-row page from
// looking like the end of the list, and the ceiling keeps one request from
// asking for the whole table.
const pageSizeSchema = z.number().int().min(1).max(100);

// One session row as every session list shows it, read from v_story_sessions,
// which numbers each session in its story and counts who came as the info
// panel lists them, so the Timeline's row and the panel never disagree. A
// view's columns are all nullable to Drizzle; these are never null for a row
// of the table it reads, so each is typed as the table has it.
const sessionColumns = {
  idStorySession: sql<number>`${vStorySessions.idStorySession}`,
  number: sql<number>`${vStorySessions.sessionNumber}`.mapWith(Number),
  title: vStorySessions.title,
  status: sql<string>`${vStorySessions.status}`,
  // created_at is nullable in the schema because every audit column is,
  // but the database always stamps it; the view type wants a Date.
  startedAt: sql<Date>`${vStorySessions.createdAt}`.mapWith(vStorySessions.createdAt),
  length: vStorySessions.length,
  playerCount: sql<number>`${vStorySessions.playerCount}`.mapWith(Number),
};

/**
 * One page of the Stories page's list: every story the user runs, plays in
 * or has favorited, less the archived and, unless asked, the retired ones;
 * searched over stories.search_text (title, summary and standard tags) and
 * the story's system (name, version and variant), and sorted in the
 * database, so More brings the next rows in the same order whatever the
 * sort. The favorites are in it too, so the List view shows them among the
 * rest; the Icon view also puts them first in a Favorites section of their
 * own (sa_listFavoriteStories). Ties in the sorted column fall back to the
 * page's own order, touched last first, then the id, so a page never
 * repeats or skips a row. Bad input is an empty page: the page builds the
 * query itself, so there is nothing a reader could fix.
 */
export async function sa_listMyStoryPage(input: unknown): Promise<StoryCardData[]> {
  const user = await requireAccount();
  // A query that is out of bounds is a bad request, answered with an empty
  // page as any list answers one, rather than a thrown error.
  const parsed = myStoryListQuerySchema.safeParse(input);
  if (!parsed.success) return [];
  const query = parsed.data;

  const playsIn = db
    .select({ one: storyPlayers.idStoryPlayer })
    .from(storyPlayers)
    .where(and(eq(storyPlayers.idStory, stories.idStory), eq(storyPlayers.idUser, user.id)));
  const favorite = favoritedBy(user.id);

  const conditions = [
    or(eq(stories.idCreatedByUser, user.id), exists(playsIn), favorite),
    notArchived,
  ];
  if (!query.showInactive) conditions.push(eq(stories.isActive, true));
  if (query.search !== "") {
    // The story's own search_text, or its system's name, version and
    // variant, which the card query joins already: a generated column can
    // only read its own row, so the system is matched here rather than
    // copied onto the story, and a renamed system is found by its new name.
    const pattern = likeContains(query.search);
    const systemText = sql`concat_ws(' ', ${systems.systemName}, ${systems.systemVersion}, ${systems.variant})`;
    conditions.push(or(ilike(stories.searchText, pattern), ilike(systemText, pattern)));
  }

  const sortColumns: Record<Exclude<StorySortKey, "recent">, SQL> = {
    title: sql`lower(${stories.title})`,
    status: sql`${stories.isActive}`,
    favorite,
    players: playerCount,
    sessions: sessionCount,
    played: playMinutes,
  };
  const sorted =
    query.sortBy === "recent"
      ? []
      : [query.sortDesc ? desc(sortColumns[query.sortBy]) : asc(sortColumns[query.sortBy])];

  return cardQuery(user.id)
    .where(and(...conditions))
    .orderBy(...sorted, ...cardOrder, asc(stories.idStory))
    .limit(MY_STORIES_PAGE_SIZE)
    .offset(query.offset);
}

/** Stories the user has favorited, less any that have since been archived. */
export async function sa_listFavoriteStories(offset: number): Promise<StoryCardData[]> {
  const user = await requireAccount();
  const skip = offsetSchema.safeParse(offset);
  if (!skip.success) return [];

  return cardQuery(user.id)
    .innerJoin(
      storyFavorites,
      and(eq(storyFavorites.idStory, stories.idStory), eq(storyFavorites.idUser, user.id)),
    )
    .where(notArchived)
    .orderBy(...cardOrder)
    .limit(PAGE_SIZE)
    .offset(skip.data);
}

/** Active stories whose storyteller has flagged them as open to new players. */
export async function sa_listLookingForPlayers(offset: number): Promise<StoryCardData[]> {
  const user = await requireAccount();
  const skip = offsetSchema.safeParse(offset);
  if (!skip.success) return [];

  return cardQuery(user.id)
    .where(and(eq(stories.isLookingForPlayers, true), eq(stories.isActive, true)))
    .orderBy(...cardOrder)
    .limit(PAGE_SIZE)
    .offset(skip.data);
}

/**
 * One story as its card and its page show it, or null when there is no such
 * story or the caller may not read it: its storyteller, its players, and
 * anyone signed in when it is public or advertised while active may, the
 * rule db/story-access.ts states. The card already carries those flags, so
 * no second query is needed. One answer for both, so the page's notFound()
 * tells a stranger nothing about whether the story is there.
 */
export async function sa_getStory(idStory: number): Promise<StoryCardData | null> {
  const user = await requireAccount();

  // An unusable id is simply not a story: safeParse rather than parse, so the
  // page's notFound() handles it instead of a raw ZodError becoming a 500.
  const id = idSchema.safeParse(idStory);
  if (!id.success) return null;

  const [story] = await cardQuery(user.id).where(eq(stories.idStory, id.data)).limit(1);
  if (!story) return null;
  const mayRead =
    story.isOwner ||
    story.isPlayer ||
    story.isPublic ||
    (story.isLookingForPlayers && story.isActive);
  return mayRead ? story : null;
}

/**
 * Whether the caller may read the story, by db/story-access.ts, for the
 * reads below that have only an id. False for a story that is not there, so
 * a caller answers the same for both.
 */
async function mayReadStory(userId: string, idStory: number): Promise<boolean> {
  const story = await storyReadership(idStory);
  return story !== null && (await storyAccess(userId, story)) !== null;
}

/**
 * Who plays in a story, oldest member first. The storyteller is not among
 * them: they own the story through stories.id_created_by_user and have no
 * story_players row (db/seeds/seed_story_players.sql says the same). Empty
 * for a story the caller may not read (db/story-access.ts), as for one that
 * is not there.
 */
export async function sa_listStoryPlayers(idStory: number): Promise<StoryPlayer[]> {
  const user = await requireAccount();

  // As in sa_getStory: an id Postgres cannot compare is not a story, so it
  // has no players rather than raising.
  const id = idSchema.safeParse(idStory);
  if (!id.success) return [];
  if (!(await mayReadStory(user.id, id.data))) return [];

  return (
    db
      .select({ idUser: users.id, name: playerName, image: users.image })
      .from(storyPlayers)
      .innerJoin(users, eq(storyPlayers.idUser, users.id))
      .where(eq(storyPlayers.idStory, id.data))
      // joined_at ties are the norm for rows seeded or added together, and the
      // row id says nothing a reader would recognise, so the name breaks them.
      .orderBy(asc(storyPlayers.joinedAt), asc(playerName))
  );
}

/**
 * The story's id when the caller is its storyteller (db/story-access.ts),
 * for the seating actions, which only the storyteller may use; null for an
 * id that is not one, a story that is not there, or someone else's story,
 * which the popover, only ever shown to the owner, answers alike.
 */
async function ownedStoryId(userId: string, idStory: number): Promise<number | null> {
  const id = idSchema.safeParse(idStory);
  if (!id.success) return null;
  return (await ownedStory(userId, id.data))?.idStory ?? null;
}

// Users who could be seated at the story: active, not its storyteller, and
// not already in story_players for it. Shared by the search and the insert so
// what the popover offers is exactly what the save accepts.
function seatable(idStory: number, storytellerId: string) {
  const seated = db
    .select({ one: storyPlayers.idStoryPlayer })
    .from(storyPlayers)
    .where(and(eq(storyPlayers.idStory, idStory), eq(storyPlayers.idUser, users.id)));
  return and(eq(users.status, "ACTIVE"), not(eq(users.id, storytellerId)), not(exists(seated)));
}

export type RemovePlayerResult = { ok: true } | { ok: false; error: string };

/**
 * Take a player off a story: their seat, their presence at its sessions and
 * waiting room, and their favorite of it (removeSeat), the favorite because
 * it is a seat at a table they no longer have, and leaving it behind would
 * keep the story on the Favorites section of a page they can no longer play
 * from. Only the storyteller who created the story may. Removing someone
 * who is not seated is not an error: the rows are gone either way, which is
 * what the caller wanted. Every table is told the scene changed, so the
 * removed player's table reloads and finds it is no longer theirs, and the
 * head count is published again when they were at the table, as the link
 * button's Remove does.
 */
export async function sa_removeStoryPlayer(
  idStory: number,
  idUser: string,
): Promise<RemovePlayerResult> {
  const user = await requireAccount();

  const id = await ownedStoryId(user.id, idStory);
  if (id === null) return { ok: false, error: STORY_NOT_YOURS };
  const player = z.string().uuid().safeParse(idUser);
  if (!player.success) return { ok: false, error: NOT_A_PLAYER };

  // The storyteller is not in story_players and has no seat to lose, so a
  // request to remove them is refused rather than quietly doing nothing.
  if (player.data === user.id) {
    return { ok: false, error: "The storyteller cannot be removed from their own story." };
  }

  const removed = await db.transaction((tx) => removeSeat(id, player.data, tx));
  if (removed.wasPresent) recountTable(id);
  publishLater(() => publishSceneChanged(id));
  return { ok: true };
}

export type JoinStoryResult = { ok: true; player: StoryPlayer } | { ok: false; error: string };

/**
 * The story page's Join: the caller takes a seat at a story that is looking
 * for players, without waiting for an invitation. The story must be looking,
 * active and not archived, as the Looking for Players list requires, and not
 * the caller's own (a storyteller has no seat at their own table); a caller
 * already seated is not seated twice. All of that is one INSERT ... SELECT,
 * so a story that stops looking between the page loading and the click is
 * refused rather than joined. The seat comes back as the Players list shows
 * it, so the page can add it at once.
 */
export async function sa_joinStory(idStory: number): Promise<JoinStoryResult> {
  const user = await requireAccount();
  const closed = "This story is not open for you to join.";
  const id = idSchema.safeParse(idStory);
  if (!id.success) return { ok: false, error: closed };

  const seated = db
    .select({ one: storyPlayers.idStoryPlayer })
    .from(storyPlayers)
    .where(and(eq(storyPlayers.idStory, stories.idStory), eq(storyPlayers.idUser, user.id)));
  // Written out for the reason sa_addStoryPlayers gives; the user id is cast
  // for the same reason its story id is.
  const inserted = await db.execute<{ id_user: string }>(sql`
    insert into ${storyPlayers} (id_story, id_user)
    select ${stories.idStory}, ${user.id}::uuid
    from ${stories}
    where ${and(
      eq(stories.idStory, id.data),
      eq(stories.isLookingForPlayers, true),
      eq(stories.isActive, true),
      notArchived,
      sql`${stories.idCreatedByUser} is distinct from ${user.id}`,
      not(exists(seated)),
    )}
    returning ${storyPlayers.idUser}
  `);
  if (inserted.rows.length === 0) return { ok: false, error: closed };

  const [player] = await db
    .select({ idUser: users.id, name: playerName, image: users.image })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  return { ok: true, player };
}

export type LeaveStoryResult = { ok: true } | { ok: false; error: string };

/**
 * The story page's Leave game: the caller gives up their own seat at a story.
 * Their favorite of it goes too, for the reason sa_removeStoryPlayer gives.
 * Getting back in takes another invitation from the storyteller.
 *
 * Only the caller's own rows are touched (removeSeat), so this needs no
 * owner check; a story they have no seat at (their own included, since the
 * storyteller has none) is refused rather than reported as left. Someone
 * who was at the table leaves its head count behind, which is published
 * again.
 */
export async function sa_leaveStory(idStory: number): Promise<LeaveStoryResult> {
  const user = await requireAccount();
  const notSeated = "You are not a player of this story.";
  const id = idSchema.safeParse(idStory);
  if (!id.success) return { ok: false, error: notSeated };

  const removed = await db.transaction((tx) => removeSeat(id.data, user.id, tx));
  if (!removed.wasSeated) return { ok: false, error: notSeated };
  if (removed.wasPresent) recountTable(id.data);
  return { ok: true };
}

/**
 * Up to ten users whose name, nickname or email contains the query, for the
 * Invite Players popover on a story the caller created. Case blind, over the
 * generated s_users.search_text column, and without the storyteller or anyone
 * already seated, so the list only ever offers people who can be added. A
 * blank query finds nobody rather than everybody.
 */
export async function sa_searchPlayers(idStory: number, query: string): Promise<PlayerMatch[]> {
  const user = await requireAccount();
  const id = await ownedStoryId(user.id, idStory);
  const needle = searchSchema.safeParse(query);
  if (id === null || !needle.success || needle.data === "") return [];

  return db
    .select({ idUser: users.id, name: playerName, email: users.email, image: users.image })
    .from(users)
    .where(and(ilike(users.searchText, likeContains(needle.data)), seatable(id, user.id)))
    .orderBy(asc(playerName), asc(users.email))
    .limit(PLAYER_SEARCH_LIMIT);
}

const inviteSchema = z.array(z.uuid()).min(1).max(PLAYER_SEARCH_LIMIT);

export type AddPlayersResult = { ok: true; players: StoryPlayer[] } | { ok: false; error: string };

/**
 * Seats the given users at a story the caller created and returns the rows
 * the Players list should add, in the order it lists them. Anyone who is not
 * seatable (unknown, inactive, the storyteller, already at the table) is
 * skipped rather than refused: the popover's list was built moments ago and
 * a second storyteller tab may have seated someone since. story_players has
 * no unique key on (id_story, id_user), so the insert selects only the users
 * with no row yet instead of relying on a conflict. Refused for a story the
 * caller does not tell and for a list of ids that is not one.
 */
export async function sa_addStoryPlayers(
  idStory: number,
  idUsers: string[],
): Promise<AddPlayersResult> {
  const user = await requireAccount();
  const id = await ownedStoryId(user.id, idStory);
  if (id === null) return { ok: false, error: STORY_NOT_YOURS };
  const parsed = inviteSchema.safeParse(idUsers);
  if (!parsed.success) return { ok: false, error: "Choose whom to invite." };
  const ids = parsed.data;

  // Written out rather than db.insert().select(): Drizzle only accepts an
  // insert-select whose columns are the whole table in order, and every
  // other column here is a default. The id is cast because a bare parameter
  // in a SELECT list is text to Postgres, which will not go into a bigint.
  const inserted = await db.execute<{ id_user: string }>(sql`
    insert into ${storyPlayers} (id_story, id_user)
    select ${id}::bigint, ${users.id}
    from ${users}
    where ${and(inArray(users.id, ids), seatable(id, user.id))}
    returning ${storyPlayers.idUser}
  `);
  const seatedIds = inserted.rows.map((row) => row.id_user);
  if (seatedIds.length === 0) return { ok: true, players: [] };

  const players = await db
    .select({ idUser: users.id, name: playerName, image: users.image })
    .from(users)
    .where(inArray(users.id, seatedIds))
    .orderBy(asc(playerName));
  return { ok: true, players };
}

export type StoryInvitation = {
  idInvitation: number;
  email: string;
  token: string;
  expiresAt: Date;
};

export type InviteToStoryResult =
  | { ok: true; invitation: StoryInvitation; emailed: boolean }
  | { ok: false; errors: Record<string, string> };

/**
 * The Invite by email form on a story the caller created: makes an
 * invitation to the story for that address and, when `send` is set, emails
 * it. Copy link calls this with `send` off and copies the link instead.
 *
 * An address that already has an invitation to this story waiting is
 * refused (db/invitations.ts), and so is one whose account is already at
 * the table, storyteller included, since accepting would do nothing. A mail
 * that does not go out leaves the invitation in place and says so, so the
 * storyteller can copy its link instead.
 */
export async function sa_inviteToStory(
  idStory: number,
  input: unknown,
  send: boolean,
): Promise<InviteToStoryResult> {
  const user = await requireAccount();
  const id = await ownedStoryId(user.id, idStory);
  if (id === null) return { ok: false, errors: { root: STORY_NOT_YOURS } };
  const parsed = storyInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: { email: parsed.error.issues[0]?.message ?? "Invalid email." } };
  }
  const { email } = parsed.data;

  const seated = db
    .select({ one: storyPlayers.idStoryPlayer })
    .from(storyPlayers)
    .where(and(eq(storyPlayers.idStory, id), eq(storyPlayers.idUser, users.id)));
  const [atTable] = await db
    .select({ one: users.id })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, or(eq(users.id, user.id), exists(seated))))
    .limit(1);
  if (atTable) return { ok: false, errors: { email: "They are already at this table." } };

  const made = await createInvitation({ email, idStory: id, senderId: user.id });
  if (!made.ok) return { ok: false, errors: { email: made.error } };

  const emailed = send ? await emailInvitation(made.idInvitation) : false;
  const [invitation] = await db
    .select({
      idInvitation: invitations.idInvitation,
      email: invitations.email,
      token: invitations.token,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(eq(invitations.idInvitation, made.idInvitation))
    .limit(1);
  return { ok: true, invitation, emailed };
}

/**
 * The invitations to a story the caller created that are still waiting:
 * not accepted, not revoked, not expired. Newest first.
 */
export async function sa_listStoryInvitations(idStory: number): Promise<StoryInvitation[]> {
  const user = await requireAccount();
  const id = await ownedStoryId(user.id, idStory);
  if (id === null) return [];
  return db
    .select({
      idInvitation: invitations.idInvitation,
      email: invitations.email,
      token: invitations.token,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.idStory, id),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, sql`now()`),
      ),
    )
    .orderBy(desc(invitations.idInvitation));
}

/**
 * Withdraws a waiting invitation to a story the caller created. Its link
 * stops working, and the address may be invited again. One that was
 * accepted meanwhile is left alone: the seat it gave is the storyteller's
 * to remove from the Players list.
 */
export async function sa_revokeStoryInvitation(
  idStory: number,
  idInvitation: number,
): Promise<{ ok: boolean }> {
  const user = await requireAccount();
  const id = await ownedStoryId(user.id, idStory);
  const invitationId = idSchema.safeParse(idInvitation);
  if (id === null || !invitationId.success) return { ok: false };
  const revoked = await db
    .update(invitations)
    .set({ revokedAt: sql`now()`, idUpdatedByUser: user.id })
    .where(
      and(
        eq(invitations.idInvitation, invitationId.data),
        eq(invitations.idStory, id),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ id: invitations.idInvitation });
  return { ok: revoked.length > 0 };
}

/**
 * A story's sessions, newest first, a page at a time. Every status is
 * listed: a session at the table or suspended is still one of the story's
 * sessions, it just has no length yet. created_at sets the order: a session
 * row is created as it opens, and unlike open_at it can never be null.
 * Empty for a story the caller may not read (db/story-access.ts), as for
 * one that is not there; a seated guest reads through their seat.
 */
export async function sa_listStorySessions(
  idStory: number,
  offset: number,
  limit: number = SESSIONS_PAGE_SIZE,
): Promise<StorySession[]> {
  const user = await requireUser();
  const skip = offsetSchema.safeParse(offset);
  // The Prep Work timeline asks for a longer page than the story page's
  // section does. The bound is here rather than trusted from the caller: a
  // page size is a number from the browser like any other, and one out of
  // bounds is an empty page.
  const take = pageSizeSchema.safeParse(limit);

  // As in sa_getStory: an id Postgres cannot compare is not a story, so it
  // has no sessions rather than raising.
  const id = idSchema.safeParse(idStory);
  if (!id.success || !skip.success || !take.success) return [];
  if (!(await mayReadStory(user.id, id.data))) return [];

  return (
    db
      .select(sessionColumns)
      .from(vStorySessions)
      .where(eq(vStorySessions.idStory, id.data))
      // Sessions opened in one statement share a created_at, so the id
      // breaks the tie and a page never repeats or skips a row.
      .orderBy(desc(vStorySessions.createdAt), desc(vStorySessions.idStorySession))
      .limit(take.data)
      .offset(skip.data)
  );
}

/**
 * How many sessions the story has in all, for the count beside the Prep Work
 * timeline's heading. Counted rather than taken from the rows loaded, which
 * are only ever the first page. Zero for a story the caller may not read
 * (db/story-access.ts), as for one that is not there.
 */
export async function sa_countStorySessions(idStory: number): Promise<number> {
  const user = await requireAccount();

  const id = idSchema.safeParse(idStory);
  if (!id.success) return 0;
  if (!(await mayReadStory(user.id, id.data))) return 0;

  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(storySessions)
    .where(eq(storySessions.idStory, id.data));
  return row?.count ?? 0;
}

/**
 * One session as the info popover shows it, or null when there is no such
 * session, the id is unusable, or the caller may not read the story's
 * sessions: the storyteller and the story's players may, and anyone signed
 * in when the story is public (db/story-access.ts). The notes and lingering
 * questions are the table's, the storyteller's and the players', and come
 * back null for a public reader; the scenes follow the rule on the type.
 * The number is
 * the session's place in the story's opening order, counted the same way
 * the list sorts, so the first row of the oldest page is session 1.
 */
export async function sa_getStorySession(
  idStorySession: number,
): Promise<StorySessionDetail | null> {
  const user = await requireUser();

  // An id outside int4, which Postgres cannot compare, is not a session
  // rather than a query error.
  const id = idSchema.safeParse(idStorySession);
  if (!id.success) return null;

  const [row] = await db
    .select({
      ...sessionColumns,
      imageLink: attachmentUrl("STORY_SESSION", "v_story_sessions", "id_story_session"),
      summary: vStorySessions.summary,
      notes: vStorySessions.notes,
      lingeringQuestions: vStorySessions.lingeringQuestions,
      idStory: stories.idStory,
      storyTitle: stories.title,
      idStoryteller: stories.idCreatedByUser,
      isPublic: stories.isPublic,
      isLookingForPlayers: stories.isLookingForPlayers,
      isActive: stories.isActive,
    })
    .from(vStorySessions)
    .innerJoin(stories, eq(stories.idStory, vStorySessions.idStory))
    .where(eq(vStorySessions.idStorySession, id.data))
    .limit(1);
  if (!row) return null;

  // A session of a story the caller has no part in reads as not there, the
  // same answer as for an id that names nothing.
  const access = await storyAccess(user.id, {
    idStory: row.idStory,
    idCreatedByUser: row.idStoryteller,
    isPublic: row.isPublic,
    isLookingForPlayers: row.isLookingForPlayers,
    isActive: row.isActive,
  });
  if (access === null) return null;
  const isStoryteller = access === "storyteller";
  // The notes and lingering questions are written up at the table by the
  // storyteller and the players alike (SessionNotesPopover), so both read
  // them here; a reader of a public story gets neither.
  const atTheTable = access !== "public";

  // Who came: the session's session_players rows that reached the table,
  // the same ones v_story_sessions counts, so the panel lists exactly the
  // number the row shows. The inner join to users leaves out a player who is
  // no longer one, as the count does.
  const players = await db
    .select({ idUser: users.id, name: playerName, image: users.image })
    .from(sessionPlayers)
    .innerJoin(users, eq(users.id, sessionPlayers.idCreatedByUser))
    .where(
      and(
        eq(sessionPlayers.idStorySession, row.idStorySession),
        isNotNull(sessionPlayers.presentAt),
      ),
    )
    .orderBy(asc(playerName));

  // Scenes are prep: what the players have not been shown yet, and the same
  // material the Prep Work board keeps behind the owner check. The
  // storyteller gets them all. Anyone else gets them only once the session
  // is done, and then only the ones played to completion: a scene attached
  // to the sitting but never run is still prep, so it stays behind with the
  // notes. Before that the panel has nothing to fold open.
  const canSeeScenes = isStoryteller || row.status === SESSION_DONE_STATUS;
  const scenes = canSeeScenes
    ? await db
        .select({
          idStoryScene: storyScenes.idStoryScene,
          title: storyScenes.sceneTitle,
          status: storyScenes.status,
        })
        .from(storyScenes)
        .where(
          and(
            eq(storyScenes.idStorySession, row.idStorySession),
            isStoryteller ? undefined : eq(storyScenes.status, SCENE_LOCKED_STATUS),
          ),
        )
        // The order they were played in, which is active_at: the workflow
        // trigger stamps it as the scene comes up at the table. A scene
        // attached to the sitting but never run has none, so it goes last.
        // created_at cannot do this job — scenes written in one sitting of
        // prep, or seeded in one statement, all share it — and the id is no
        // better, since the seed numbers its rows downwards.
        .orderBy(
          sql`${storyScenes.activeAt} asc nulls last`,
          asc(storyScenes.createdAt),
          asc(storyScenes.idStoryScene),
        )
    : [];

  return {
    idStorySession: row.idStorySession,
    idStory: row.idStory,
    storyTitle: row.storyTitle,
    startedAt: row.startedAt,
    number: row.number,
    title: row.title,
    status: row.status,
    length: row.length,
    imageLink: row.imageLink,
    summary: row.summary,
    notes: atTheTable ? row.notes : null,
    lingeringQuestions: atTheTable ? row.lingeringQuestions : null,
    players,
    scenes,
    isStoryteller,
  };
}

/** A session either side of one in its story's opening order, for the chevrons round its page's heading. */
export type SessionNeighbour = { idStorySession: number; number: number; title: string | null };

export type SessionNeighbours = {
  previous: SessionNeighbour | null;
  next: SessionNeighbour | null;
};

/**
 * The sessions either side of one in its story: the one opened before it
 * and the one opened after, by session number, which v_story_sessions
 * counts in the same opening order the Timeline sorts by. Null on either
 * side where there is none, and on both where the id is unusable, names no
 * session, or names a session of a story the caller may not read, as with
 * sa_getStorySession (db/story-access.ts): a title is as much of the story
 * as a stranger must not see.
 */
export async function sa_getStorySessionNeighbours(
  idStorySession: number,
): Promise<SessionNeighbours> {
  const user = await requireUser();

  const none: SessionNeighbours = { previous: null, next: null };
  const id = idSchema.safeParse(idStorySession);
  if (!id.success) return none;

  const [here] = await db
    .select({
      idStory: stories.idStory,
      number: vStorySessions.sessionNumber,
      idCreatedByUser: stories.idCreatedByUser,
      isPublic: stories.isPublic,
      isLookingForPlayers: stories.isLookingForPlayers,
      isActive: stories.isActive,
    })
    .from(vStorySessions)
    .innerJoin(stories, eq(stories.idStory, vStorySessions.idStory))
    .where(eq(vStorySessions.idStorySession, id.data))
    .limit(1);
  if (!here || here.number === null) return none;
  if ((await storyAccess(user.id, here)) === null) return none;
  const number = here.number;

  const beside = await db
    .select({
      idStorySession: sql<number>`${vStorySessions.idStorySession}`,
      number: sql<number>`${vStorySessions.sessionNumber}`.mapWith(Number),
      title: vStorySessions.title,
    })
    .from(vStorySessions)
    .where(
      and(
        eq(vStorySessions.idStory, here.idStory),
        inArray(vStorySessions.sessionNumber, [number - 1, number + 1]),
      ),
    );
  return {
    previous: beside.find((session) => session.number === number - 1) ?? null,
    next: beside.find((session) => session.number === number + 1) ?? null,
  };
}

export async function sa_listSystems(): Promise<{ idSystem: number; label: string }[]> {
  await requireAccount();

  const rows = await db
    .select({
      idSystem: systems.idSystem,
      systemName: systems.systemName,
      systemVersion: systems.systemVersion,
      variant: systems.variant,
    })
    .from(systems)
    .orderBy(asc(systems.systemName), asc(systems.systemVersion), asc(systems.variant));

  return rows.map((row) => ({
    idSystem: row.idSystem,
    label: systemLabel(row) ?? row.systemName,
  }));
}

export type StoryFormResult = { ok: false; errors: Record<string, string> };

/**
 * Validates and inserts a new story owned by the caller, then redirects to
 * the story's own page, where its attachments are added: the New story form
 * has none, since there is no story to attach them to until this returns.
 * `afterCreate` goes somewhere else instead, when the page that led to the
 * form asked (the home page's first-story button, on to the Stories page);
 * it came in by the query string, so it is narrowed to a same-origin path
 * and anything else falls back to the story's page. Validation failures
 * come back as field errors for the form; on success the redirect throws,
 * so this never resolves with ok: true.
 */
export async function sa_createStory(
  input: unknown,
  afterCreate?: unknown,
): Promise<StoryFormResult> {
  const user = await requireAccount();

  const parsed = storySchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error) };

  const values = parsed.data;
  const [story] = await db
    .insert(stories)
    .values({
      title: values.title,
      idSystem: values.idSystem,
      summary: values.summary || null,
      isLookingForPlayers: values.isLookingForPlayers,
      isActive: values.isActive,
      isArchived: values.isArchived,
      isPublic: values.isPublic,
      idArchivedByUser: values.isArchived ? user.id : null,
      idCreatedByUser: user.id,
      idUpdatedByUser: user.id,
    })
    .returning({ idStory: stories.idStory });

  redirect(
    safeRedirect(
      typeof afterCreate === "string" ? afterCreate : undefined,
      `/stories/${story.idStory}`,
    ),
  );
}

/**
 * A story's fields as the edit form holds them, or null when the story does
 * not exist or the caller did not create it: only the storyteller edits a
 * story, and a non-owner gets the same not-found page as a bad id rather
 * than a hint that the story is there. The nullable columns come back as
 * "" because that is what the form's inputs post and what storySchema turns
 * back into null.
 */
export async function sa_getStoryForEdit(idStory: number): Promise<StoryValues | null> {
  const user = await requireAccount();

  // As in sa_getStory: an id Postgres cannot compare is not a story.
  const id = idSchema.safeParse(idStory);
  if (!id.success) return null;

  const [story] = await db
    .select({
      title: stories.title,
      idSystem: stories.idSystem,
      summary: stories.summary,
      isLookingForPlayers: stories.isLookingForPlayers,
      isActive: stories.isActive,
      isArchived: stories.isArchived,
      isPublic: stories.isPublic,
    })
    .from(stories)
    .where(and(eq(stories.idStory, id.data), eq(stories.idCreatedByUser, user.id)))
    .limit(1);
  if (!story) return null;

  return { ...story, summary: story.summary ?? "" };
}

/**
 * Validates and saves the edit form over a story the caller created, then
 * redirects to the story's page. The story is read first as the caller's
 * (ownedStoryId), by the id of the s_users row requireAccount() loaded,
 * never an id the client sent; someone else's story comes back as `root`.
 * The same predicate is repeated in the UPDATE's WHERE so the write cannot
 * land on a row that changed hands between the read and the write.
 *
 * A story with its own stat block (stories.stat_block_definition) loses it
 * when its system changes, since the copy stands in for the system it was
 * taken from. That is only done when the form says so with dropStatBlock,
 * which it sends once it has warned that the stat block goes; otherwise a
 * change of system is refused on the System field and nothing is saved, so
 * a form opened before the copy was made cannot delete it unwarned. The
 * check is in the UPDATE's WHERE, so a copy made after the read is kept too.
 */
export async function sa_updateStory(
  idStory: number,
  input: unknown,
  options: { dropStatBlock?: boolean } = {},
): Promise<StoryFormResult> {
  const user = await requireAccount();
  const id = await ownedStoryId(user.id, idStory);
  if (id === null) return { ok: false, errors: { root: STORY_NOT_YOURS } };
  const dropStatBlock = z.boolean().optional().safeParse(options.dropStatBlock).data ?? false;

  const parsed = storySchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error) };

  const values = parsed.data;
  // Whether this save changes the story's system, against the row's own
  // system as the UPDATE reads it.
  const systemChanges = sql`${stories.idSystem} IS DISTINCT FROM ${values.idSystem}::integer`;
  const owned = and(eq(stories.idStory, id), eq(stories.idCreatedByUser, user.id));
  const updated = await db
    .update(stories)
    .set({
      title: values.title,
      idSystem: values.idSystem,
      // The story's own stat block goes with the system it was copied
      // from; the WHERE below has made sure the form said it may.
      statBlockDefinition: sql`CASE WHEN ${systemChanges} THEN NULL ELSE ${stories.statBlockDefinition} END`,
      summary: values.summary || null,
      isLookingForPlayers: values.isLookingForPlayers,
      isActive: values.isActive,
      isArchived: values.isArchived,
      isPublic: values.isPublic,
      // Only the creator gets here, so the archiver is always the caller.
      // Null on the way out is what the unarchive trigger would set anyway;
      // archived_at is the database's to stamp and clear.
      idArchivedByUser: values.isArchived ? user.id : null,
      idUpdatedByUser: user.id,
    })
    .where(
      dropStatBlock
        ? owned
        : and(owned, not(and(systemChanges, isNotNull(stories.statBlockDefinition))!)),
    )
    .returning({ idStory: stories.idStory });
  if (updated.length === 0) {
    // The story was read as the caller's above, so a write that found no
    // row is the stat block standing in the way.
    return {
      ok: false,
      errors: {
        idSystem:
          "This story has its own stat block, which changing its system would delete. Reload the page to see what goes.",
      },
    };
  }

  redirect(`/stories/${id}`);
}

export type SetFavoriteResult = { ok: true; isFavorite: boolean } | { ok: false; error: string };

/**
 * Adds or removes the caller's favorite on a story. Idempotent in both
 * directions: adding twice relies on the (id_story, id_user) unique constraint
 * and removing an absent row is a no-op. Only ever touches rows for user.id.
 * A story the caller may not read (db/story-access.ts) is refused as one
 * that is not there is: the heart is only ever shown on a card they were
 * given, so the card puts its heart back and says so.
 */
export async function sa_setFavorite(
  idStory: number,
  isFavorite: boolean,
): Promise<SetFavoriteResult> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStory);
  const wanted = z.boolean().safeParse(isFavorite);
  if (!id.success || !wanted.success || !(await mayReadStory(user.id, id.data))) {
    return { ok: false, error: STORY_NOT_FOUND };
  }

  if (wanted.data) {
    await db
      .insert(storyFavorites)
      .values({
        idStory: id.data,
        idUser: user.id,
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      })
      .onConflictDoNothing({
        target: [storyFavorites.idStory, storyFavorites.idUser],
      });
  } else {
    await db
      .delete(storyFavorites)
      .where(and(eq(storyFavorites.idStory, id.data), eq(storyFavorites.idUser, user.id)));
  }

  return { ok: true, isFavorite: wanted.data };
}

// The Timeline's session controls, for the story's storyteller alone. A
// session that is not there and one on someone else's story are the same
// answer, as the board's other reads give.

export type CreateSessionResult =
  { ok: true; session: StorySession } | { ok: false; error: string };

// The day's title the Timeline's + sends, held to what the column takes.
const newSessionTitleSchema = titleSchema("session");

/**
 * The Timeline's +: a new session on a story the caller tells, titled as
 * the Play button's new session is (sa_startPlaying), with the name the
 * browser builds from the storyteller's own day ("Oct 22, 2026 session").
 * Unlike starting one, it does not become the story's current session and
 * no table opens: it is written ahead from the board, so it starts
 * SUSPENDED, waiting to be resumed from Play, where the picker offers it.
 *
 * It goes in with the workflow's starting status and is then moved to
 * SUSPENDED, rather than inserted as SUSPENDED, so the workflow stamps
 * open_at and then suspended_at as it does for a session paused at the
 * table, and resuming it later counts the wait as paused rather than played.
 */
export async function sa_createStorySession(
  idStory: number,
  title: string,
): Promise<CreateSessionResult> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStory);
  const name = newSessionTitleSchema.safeParse(title);
  if (!id.success || !name.success) return { ok: false, error: "That session could not be made." };

  if ((await ownedStory(user.id, id.data)) === null) {
    return { ok: false, error: "Only the storyteller can add sessions to this story." };
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(storySessions)
      .values({
        idStory: id.data,
        title: name.data,
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      })
      .returning({ id: storySessions.idStorySession });
    await tx
      .update(storySessions)
      .set({ status: SESSION_STATUS.SUSPENDED, idUpdatedByUser: user.id })
      .where(eq(storySessions.idStorySession, row.id));
    return row;
  });

  const [session] = await db
    .select(sessionColumns)
    .from(vStorySessions)
    .where(eq(vStorySessions.idStorySession, created.id))
    .limit(1);
  return { ok: true, session };
}

/**
 * A session as the Timeline's edit panel holds it, with every scene of its
 * story and the sitting each is in, or null for one the caller does not
 * tell. The scenes run oldest first, the order the board wrote them in.
 */
export async function sa_getSessionForEdit(idStorySession: number): Promise<SessionForEdit | null> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStorySession);
  if (!id.success) return null;

  const owned = await ownedSession(user.id, id.data);
  if (owned === null) return null;
  const [row] = await db
    .select({
      idStory: storySessions.idStory,
      status: storySessions.status,
      title: storySessions.title,
      summary: storySessions.summary,
      notes: storySessions.notes,
      lingeringQuestions: storySessions.lingeringQuestions,
    })
    .from(storySessions)
    .where(eq(storySessions.idStorySession, id.data))
    .limit(1);
  if (!row) return null;

  const scenes = await db
    .select({
      idStoryScene: storyScenes.idStoryScene,
      title: storyScenes.sceneTitle,
      status: storyScenes.status,
      idStorySession: storyScenes.idStorySession,
    })
    .from(storyScenes)
    .where(eq(storyScenes.idStory, row.idStory))
    .orderBy(asc(storyScenes.createdAt), asc(storyScenes.idStoryScene));

  return {
    idStorySession: id.data,
    idStory: row.idStory,
    status: row.status,
    values: {
      title: row.title ?? "",
      summary: row.summary ?? "",
      notes: row.notes ?? "",
      lingeringQuestions: row.lingeringQuestions ?? "",
    },
    scenes,
  };
}

/**
 * Saves the Timeline's edit panel over a session the caller tells: its
 * title, summary, notes and lingering questions, each cleared when empty.
 * Any status may be written up, a DONE one most of all. Field errors come
 * back for the form, and a session that is not the caller's as `root`.
 * Every table hears the session was renamed.
 */
export async function sa_updateStorySession(
  idStorySession: number,
  input: unknown,
): Promise<UpdateSessionResult> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStorySession);
  if (!id.success) return { ok: false, errors: { root: NOT_YOUR_SESSION } };
  const session = await ownedSession(user.id, id.data);
  if (session === null) return { ok: false, errors: { root: NOT_YOUR_SESSION } };

  const parsed = sessionEditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: formErrors(parsed.error) };
  }
  const values = parsed.data;

  await db
    .update(storySessions)
    .set({
      title: values.title,
      summary: values.summary || null,
      notes: values.notes || null,
      lingeringQuestions: values.lingeringQuestions || null,
      idUpdatedByUser: user.id,
    })
    .where(eq(storySessions.idStorySession, id.data));
  // The tables show the session's title in their headers, as the run
  // table's rename tells them.
  publishLater(() => publishSessionUpdated(session.idStory, id.data, values.title));
  return { ok: true, title: values.title };
}

export type DeleteSessionResult = { ok: true } | { ok: false; error: string };

/**
 * The Timeline's delete, for any session of a story the caller tells,
 * finished ones included; the trashcan asks first and says what is lost. The
 * database lets go of what pointed at it: its scenes keep their place in
 * the story with no sitting (story_scenes.id_story_session is ON DELETE SET
 * NULL), the story's current session is cleared if it was this one
 * (stories.id_story_session, the same), and who was waiting for it or at it
 * goes with it (session_players, ON DELETE CASCADE). Every table is told
 * the scene changed.
 */
export async function sa_deleteStorySession(idStorySession: number): Promise<DeleteSessionResult> {
  const user = await requireAccount();
  const id = idSchema.safeParse(idStorySession);
  if (!id.success) return { ok: false, error: NOT_YOUR_SESSION };

  const session = await ownedSession(user.id, id.data);
  if (session === null) return { ok: false, error: NOT_YOUR_SESSION };

  await db.delete(storySessions).where(eq(storySessions.idStorySession, id.data));
  // A table on this session finds the story is being played no longer, and
  // reloads onto nothing; a table on another session is told as it is for
  // any change to the story's sittings.
  publishLater(() => publishSceneChanged(session.idStory));
  return { ok: true };
}
