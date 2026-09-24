"use server";

import { redirect } from "next/navigation";
import { and, asc, desc, eq, exists, ilike, inArray, not, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import {
  PAGE_SIZE,
  PLAYER_SEARCH_LIMIT,
  SESSIONS_PAGE_SIZE,
  systemLabel,
  type PlayerMatch,
  type StoryCardData,
  type StoryPlayer,
  type StorySession,
} from "@/lib/stories";
import { storySchema, type StoryValues } from "@/lib/story-schemas";

const { games, systems, gamePlayers, gameFavorites, gameSessions, user: users } = schema;

// Every export here is a server action: it is the only way the Stories pages
// touch the database, and each one starts by proving who is asking.

const offsetSchema = z.number().int().min(0);

// games.id_game is int4. An id outside that range is not "not found yet" to
// Postgres, it is a query error, so it gets filtered out before the query
// rather than after.
const idGameSchema = z.number().int().min(-2147483648).max(2147483647);

// Whether the caller has favorited the game on the current outer row. It is
// a correlated EXISTS rather than a join so a favorite never duplicates or
// drops a card, and it is scoped to the caller: nobody sees anyone else's
// hearts.
function favoritedBy(userId: string) {
  return exists(
    db
      .select({ one: gameFavorites.idGameFavorite })
      .from(gameFavorites)
      .where(and(eq(gameFavorites.idGame, games.idGame), eq(gameFavorites.idUser, userId))),
  ).mapWith(Boolean);
}

// Whether the game's current session (games.id_game_session) is being
// played, which is status open or resumed: a session that came back from a
// pause is at the table just as much as one that never paused. A correlated
// EXISTS like favoritedBy, and it reads the pointer rather than searching
// game_sessions for such a row: the pointer is what the table runs on, so
// the card and the table can never disagree.
const hasOpenSession = exists(
  db
    .select({ one: gameSessions.idGameSession })
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.idGameSession, games.idGameSession),
        inArray(gameSessions.status, ["open", "resumed"]),
      ),
    ),
).mapWith(Boolean);

// How many game_players rows the game has. A correlated subquery rather than
// a join with GROUP BY, so the paging LIMIT still counts games, not players.
// count() comes back as a bigint string from pg; the card wants a number.
const playerCount = sql<number>`(
  select count(*) from ${gamePlayers} where ${gamePlayers.idGame} = ${games.idGame}
)`.mapWith(Number);

// How a user is shown everywhere, storyteller or player: the same preference
// the account menu uses (nickname, else name), and NULLIF so a nickname that
// was blanked out does not win over the name.
const playerName = sql<string>`coalesce(nullif(${users.nickName}, ''), ${users.name})`;

// One projection shared by every list and by sa_getStory, so the card never sees
// a shape that differs by section.
function cardColumns(userId: string) {
  return {
    idGame: games.idGame,
    gameTitle: games.gameTitle,
    summary: games.summary,
    imageUrl: games.imageUrl,
    lastPlayed: games.lastPlayed,
    systemName: systems.systemName,
    systemVersion: systems.systemVersion,
    variant: systems.variant,
    isFavorite: favoritedBy(userId),
    // NULL = userId is NULL in SQL, and Boolean(null) is false, so a game with
    // no recorded creator has no owner rather than an error.
    isOwner: eq(games.idCreatedByUser, userId).mapWith(Boolean),
    isActive: games.isActive,
    // Null when the left join found no creator row.
    storytellerName: sql<string | null>`${playerName}`,
    hasOpenSession,
    playerCount,
  };
}

// updated_at ties are common — the seed inserts every game in one statement,
// so all 14 share a timestamp — and a LIMIT/OFFSET pair over an unstable sort
// can hand the same row to two different pages. id_game breaks the tie so the
// sections page reliably.
const cardOrder = [desc(games.updatedAt), desc(games.gameTitle)];

// Left joins, so a game with no system or whose creator row is gone still
// makes a card. Every list starts here; a section adds its own join or WHERE.
function cardQuery(userId: string) {
  return db
    .select(cardColumns(userId))
    .from(games)
    .leftJoin(systems, eq(games.idSystem, systems.idSystem))
    .leftJoin(users, eq(games.idCreatedByUser, users.id));
}

// An archived story is off the Stories page altogether: My Stories leaves it
// out even with "Show inactive" on, and a favorite of one is not listed. It
// is not deleted, and the edit page still reaches it, so unarchiving brings
// it back.
const notArchived = eq(games.isArchived, false);

/**
 * Games the user created or plays in. Inactive ones are left out unless the
 * "Show inactive" switch asks for them, so a retired story does not crowd the
 * list but is never lost; archived ones are always left out.
 */
export async function sa_listMyStories(
  offset: number,
  showInactive = false,
): Promise<StoryCardData[]> {
  const user = await requireUser();
  const skip = offsetSchema.parse(offset);
  const includeInactive = z.boolean().parse(showInactive);

  const playsIn = db
    .select({ one: gamePlayers.idGamePlayer })
    .from(gamePlayers)
    .where(and(eq(gamePlayers.idGame, games.idGame), eq(gamePlayers.idUser, user.id)));

  const involved = and(or(eq(games.idCreatedByUser, user.id), exists(playsIn)), notArchived);

  return cardQuery(user.id)
    .where(includeInactive ? involved : and(involved, eq(games.isActive, true)))
    .orderBy(...cardOrder)
    .limit(PAGE_SIZE)
    .offset(skip);
}

/** Games the user has favorited, less any that have since been archived. */
export async function sa_listFavoriteStories(offset: number): Promise<StoryCardData[]> {
  const user = await requireUser();
  const skip = offsetSchema.parse(offset);

  return cardQuery(user.id)
    .innerJoin(
      gameFavorites,
      and(eq(gameFavorites.idGame, games.idGame), eq(gameFavorites.idUser, user.id)),
    )
    .where(notArchived)
    .orderBy(...cardOrder)
    .limit(PAGE_SIZE)
    .offset(skip);
}

/** Active games whose storyteller has flagged them as open to new players. */
export async function sa_listLookingForPlayers(offset: number): Promise<StoryCardData[]> {
  const user = await requireUser();
  const skip = offsetSchema.parse(offset);

  return cardQuery(user.id)
    .where(and(eq(games.isLookingForPlayers, true), eq(games.isActive, true)))
    .orderBy(...cardOrder)
    .limit(PAGE_SIZE)
    .offset(skip);
}

export async function sa_getStory(idGame: number): Promise<StoryCardData | null> {
  const user = await requireUser();

  // An unusable id is simply not a story: safeParse rather than parse, so the
  // page's notFound() handles it instead of a raw ZodError becoming a 500.
  const id = idGameSchema.safeParse(idGame);
  if (!id.success) return null;

  const [story] = await cardQuery(user.id).where(eq(games.idGame, id.data)).limit(1);
  return story ?? null;
}

/**
 * Who plays in a story, oldest member first. The storyteller is not among
 * them: they own the game through games.id_created_by_user and have no
 * game_players row (db/seeds/seed_game_players.sql says the same).
 */
export async function sa_listStoryPlayers(idGame: number): Promise<StoryPlayer[]> {
  await requireUser();

  // As in sa_getStory: an id Postgres cannot compare is not a story, so it
  // has no players rather than raising.
  const id = idGameSchema.safeParse(idGame);
  if (!id.success) return [];

  return (
    db
      .select({ idUser: users.id, name: playerName, image: users.image })
      .from(gamePlayers)
      .innerJoin(users, eq(gamePlayers.idUser, users.id))
      .where(eq(gamePlayers.idGame, id.data))
      // joined_at ties are the norm for rows seeded or added together, and the
      // row id says nothing a reader would recognise, so the name breaks them.
      .orderBy(asc(gamePlayers.joinedAt), asc(playerName))
  );
}

/**
 * The story's id and creator, or a throw: the storyteller is the only one who
 * seats players, so both the search and the insert start here. Not found
 * and not the owner are thrown rather than returned because the popover
 * cannot fix either; it is only shown to the owner in the first place.
 */
async function requireOwnedStory(userId: string, idGame: number): Promise<number> {
  const id = idGameSchema.parse(idGame);
  const [story] = await db
    .select({ idCreatedByUser: games.idCreatedByUser })
    .from(games)
    .where(eq(games.idGame, id))
    .limit(1);
  if (!story) throw new Error("Story not found");
  if (story.idCreatedByUser !== userId) {
    throw new Error("Only the storyteller who created a story can invite players to it");
  }
  return id;
}

// Users who could be seated at the story: active, not its storyteller, and
// not already in game_players for it. Shared by the search and the insert so
// what the popover offers is exactly what the save accepts.
function seatable(idGame: number, storytellerId: string) {
  const seated = db
    .select({ one: gamePlayers.idGamePlayer })
    .from(gamePlayers)
    .where(and(eq(gamePlayers.idGame, idGame), eq(gamePlayers.idUser, users.id)));
  return and(eq(users.isActive, true), not(eq(users.id, storytellerId)), not(exists(seated)));
}

// Anything in the query that ILIKE would read as a pattern is escaped, so a
// storyteller who types "%" or "_" looks for those characters rather than
// for everyone.
function containsPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const querySchema = z.string().max(200);

/**
 * Up to ten users whose name, nickname or email contains the query, for the
 * Invite Players popover on a story the caller created. Case blind, over the
 * generated users.search_text column, and without the storyteller or anyone
 * already seated, so the list only ever offers people who can be added. A
 * blank query finds nobody rather than everybody.
 */
export async function sa_searchPlayers(idGame: number, query: string): Promise<PlayerMatch[]> {
  const user = await requireUser();
  const id = await requireOwnedStory(user.id, idGame);
  const needle = querySchema.parse(query).trim();
  if (needle === "") return [];

  return db
    .select({ idUser: users.id, name: playerName, email: users.email, image: users.image })
    .from(users)
    .where(and(ilike(users.searchText, containsPattern(needle)), seatable(id, user.id)))
    .orderBy(asc(playerName), asc(users.email))
    .limit(PLAYER_SEARCH_LIMIT);
}

const inviteSchema = z.array(z.uuid()).min(1).max(PLAYER_SEARCH_LIMIT);

/**
 * Seats the given users at a story the caller created and returns the rows
 * the Players list should add, in the order it lists them. Anyone who is not
 * seatable (unknown, inactive, the storyteller, already at the table) is
 * skipped rather than refused: the popover's list was built moments ago and
 * a second storyteller tab may have seated someone since. game_players has
 * no unique key on (id_game, id_user), so the insert selects only the users
 * with no row yet instead of relying on a conflict.
 */
export async function sa_addStoryPlayers(
  idGame: number,
  idUsers: string[],
): Promise<StoryPlayer[]> {
  const user = await requireUser();
  const id = await requireOwnedStory(user.id, idGame);
  const ids = inviteSchema.parse(idUsers);

  // Written out rather than db.insert().select(): Drizzle only accepts an
  // insert-select whose columns are the whole table in order, and every
  // other column here is a default. The id is cast because a bare parameter
  // in a SELECT list is text to Postgres, which will not go into a bigint.
  const inserted = await db.execute<{ id_user: string }>(sql`
    insert into ${gamePlayers} (id_game, id_user)
    select ${id}::bigint, ${users.id}
    from ${users}
    where ${and(inArray(users.id, ids), seatable(id, user.id))}
    returning ${gamePlayers.idUser}
  `);
  const seatedIds = inserted.rows.map((row) => row.id_user);
  if (seatedIds.length === 0) return [];

  return db
    .select({ idUser: users.id, name: playerName, image: users.image })
    .from(users)
    .where(inArray(users.id, seatedIds))
    .orderBy(asc(playerName));
}

/**
 * A story's sessions, newest first, a page at a time. Every status is
 * listed: a session at the table or suspended is still one of the story's
 * sessions, it just has no length yet. created_at sets the order: a session
 * row is created as it opens, and unlike open_at it can never be null.
 */
export async function sa_listStorySessions(
  idGame: number,
  offset: number,
): Promise<StorySession[]> {
  await requireUser();
  const skip = offsetSchema.parse(offset);

  // As in sa_getStory: an id Postgres cannot compare is not a story, so it
  // has no sessions rather than raising.
  const id = idGameSchema.safeParse(idGame);
  if (!id.success) return [];

  return (
    db
      .select({
        idGameSession: gameSessions.idGameSession,
        status: gameSessions.status,
        // created_at is nullable in the schema because every audit column is,
        // but the database always stamps it; the view type wants a Date.
        startedAt: sql<Date>`${gameSessions.createdAt}`.mapWith(gameSessions.createdAt),
        length: gameSessions.length,
      })
      .from(gameSessions)
      .where(eq(gameSessions.idGame, id.data))
      // Sessions opened in one statement share a created_at, so the id
      // breaks the tie and a page never repeats or skips a row.
      .orderBy(desc(gameSessions.createdAt), desc(gameSessions.idGameSession))
      .limit(SESSIONS_PAGE_SIZE)
      .offset(skip)
  );
}

export async function sa_listSystems(): Promise<{ idSystem: number; label: string }[]> {
  await requireUser();

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

// The zod issues as the form wants them: one message per field, the first
// issue winning, keyed by the issue's path. Shared by create and update.
function fieldErrors(parsed: z.ZodSafeParseError<unknown>): StoryFormResult {
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".");
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/**
 * Validates and inserts a new game owned by the caller, then redirects to the
 * Stories page. Validation failures come back as field errors for the form;
 * on success the redirect throws, so this never resolves with ok: true.
 */
export async function sa_createStory(input: unknown): Promise<StoryFormResult> {
  const user = await requireUser();

  const parsed = storySchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed);

  const values = parsed.data;
  await db.insert(games).values({
    gameTitle: values.title,
    idSystem: values.idSystem,
    summary: values.summary || null,
    imageUrl: values.imageUrl || null,
    isLookingForPlayers: values.isLookingForPlayers,
    isActive: values.isActive,
    isArchived: values.isArchived,
    idArchivedByUser: values.isArchived ? user.id : null,
    idCreatedByUser: user.id,
    idUpdatedByUser: user.id,
  });

  redirect("/stories");
}

/**
 * A story's fields as the edit form holds them, or null when the story does
 * not exist or the caller did not create it: only the storyteller edits a
 * story, and a non-owner gets the same not-found page as a bad id rather
 * than a hint that the story is there. The nullable columns come back as
 * "" because that is what the form's inputs post and what storySchema turns
 * back into null.
 */
export async function sa_getStoryForEdit(idGame: number): Promise<StoryValues | null> {
  const user = await requireUser();

  // As in sa_getStory: an id Postgres cannot compare is not a story.
  const id = idGameSchema.safeParse(idGame);
  if (!id.success) return null;

  const [story] = await db
    .select({
      title: games.gameTitle,
      idSystem: games.idSystem,
      summary: games.summary,
      imageUrl: games.imageUrl,
      isLookingForPlayers: games.isLookingForPlayers,
      isActive: games.isActive,
      isArchived: games.isArchived,
    })
    .from(games)
    .where(and(eq(games.idGame, id.data), eq(games.idCreatedByUser, user.id)))
    .limit(1);
  if (!story) return null;

  return { ...story, summary: story.summary ?? "", imageUrl: story.imageUrl ?? "" };
}

/**
 * Validates and saves the edit form over a story the caller created, then
 * redirects to the story's page. The story is read first and its creator
 * compared with the id of the users row requireUser() loaded, never an id
 * the client sent; a mismatch is thrown, since the form cannot fix it. The
 * same predicate is repeated in the UPDATE's WHERE so the write cannot land
 * on a row that changed hands between the read and the write.
 */
export async function sa_updateStory(idGame: number, input: unknown): Promise<StoryFormResult> {
  const user = await requireUser();
  const id = idGameSchema.parse(idGame);

  const [story] = await db
    .select({ idCreatedByUser: games.idCreatedByUser })
    .from(games)
    .where(eq(games.idGame, id))
    .limit(1);
  if (!story) throw new Error("Story not found");
  if (story.idCreatedByUser !== user.id) {
    throw new Error("Only the storyteller who created a story can edit it");
  }

  const parsed = storySchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed);

  const values = parsed.data;
  const updated = await db
    .update(games)
    .set({
      gameTitle: values.title,
      idSystem: values.idSystem,
      summary: values.summary || null,
      imageUrl: values.imageUrl || null,
      isLookingForPlayers: values.isLookingForPlayers,
      isActive: values.isActive,
      isArchived: values.isArchived,
      // Only the creator gets here, so the archiver is always the caller.
      // Null on the way out is what the unarchive trigger would set anyway;
      // archived_at is the database's to stamp and clear.
      idArchivedByUser: values.isArchived ? user.id : null,
      idUpdatedByUser: user.id,
    })
    .where(and(eq(games.idGame, id), eq(games.idCreatedByUser, user.id)))
    .returning({ idGame: games.idGame });
  if (updated.length === 0) throw new Error("Story not found");

  redirect(`/stories/${id}`);
}

/**
 * Adds or removes the caller's favorite on a story. Idempotent in both
 * directions: adding twice relies on the (id_game, id_user) unique constraint
 * and removing an absent row is a no-op. Only ever touches rows for user.id.
 */
export async function sa_setFavorite(
  idGame: number,
  isFavorite: boolean,
): Promise<{ isFavorite: boolean }> {
  const user = await requireUser();
  const id = idGameSchema.parse(idGame);
  const wanted = z.boolean().parse(isFavorite);

  const [game] = await db
    .select({ idGame: games.idGame })
    .from(games)
    .where(eq(games.idGame, id))
    .limit(1);
  if (!game) throw new Error("Story not found");

  if (wanted) {
    await db
      .insert(gameFavorites)
      .values({
        idGame: id,
        idUser: user.id,
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      })
      .onConflictDoNothing({
        target: [gameFavorites.idGame, gameFavorites.idUser],
      });
  } else {
    await db
      .delete(gameFavorites)
      .where(and(eq(gameFavorites.idGame, id), eq(gameFavorites.idUser, user.id)));
  }

  return { isFavorite: wanted };
}
