"use server";

import { redirect } from "next/navigation";
import { and, asc, desc, eq, exists, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { PAGE_SIZE, systemLabel, type StoryCardData } from "@/lib/stories";
import { newStorySchema } from "@/lib/story-schemas";

const { games, systems, gamePlayers, gameFavorites } = schema;

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

// One projection shared by every list and by getStory, so the card never sees
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
  };
}

// updated_at ties are common — the seed inserts every game in one statement,
// so all 14 share a timestamp — and a LIMIT/OFFSET pair over an unstable sort
// can hand the same row to two different pages. id_game breaks the tie so the
// sections page reliably.
const cardOrder = [desc(games.updatedAt), desc(games.idGame)];

function cardQuery(userId: string) {
  return db
    .select(cardColumns(userId))
    .from(games)
    .leftJoin(systems, eq(games.idSystem, systems.idSystem));
}

/** Games the user created or plays in. */
export async function listMyStories(offset: number): Promise<StoryCardData[]> {
  const user = await requireUser();
  const skip = offsetSchema.parse(offset);

  const playsIn = db
    .select({ one: gamePlayers.idGamePlayer })
    .from(gamePlayers)
    .where(and(eq(gamePlayers.idGame, games.idGame), eq(gamePlayers.idUser, user.id)));

  return cardQuery(user.id)
    .where(or(eq(games.idCreatedByUser, user.id), exists(playsIn)))
    .orderBy(...cardOrder)
    .limit(PAGE_SIZE)
    .offset(skip);
}

/** Games the user has favorited. */
export async function listFavoriteStories(offset: number): Promise<StoryCardData[]> {
  const user = await requireUser();
  const skip = offsetSchema.parse(offset);

  return db
    .select(cardColumns(user.id))
    .from(games)
    .innerJoin(
      gameFavorites,
      and(eq(gameFavorites.idGame, games.idGame), eq(gameFavorites.idUser, user.id)),
    )
    .leftJoin(systems, eq(games.idSystem, systems.idSystem))
    .orderBy(...cardOrder)
    .limit(PAGE_SIZE)
    .offset(skip);
}

/** Active games whose storyteller has flagged them as open to new players. */
export async function listLookingForPlayers(offset: number): Promise<StoryCardData[]> {
  const user = await requireUser();
  const skip = offsetSchema.parse(offset);

  return cardQuery(user.id)
    .where(and(eq(games.isLookingForPlayers, true), eq(games.isActive, true)))
    .orderBy(...cardOrder)
    .limit(PAGE_SIZE)
    .offset(skip);
}

export async function getStory(idGame: number): Promise<StoryCardData | null> {
  const user = await requireUser();

  // An unusable id is simply not a story: safeParse rather than parse, so the
  // page's notFound() handles it instead of a raw ZodError becoming a 500.
  const id = idGameSchema.safeParse(idGame);
  if (!id.success) return null;

  const [story] = await cardQuery(user.id).where(eq(games.idGame, id.data)).limit(1);
  return story ?? null;
}

export async function listSystems(): Promise<{ idSystem: number; label: string }[]> {
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

  return rows.map((row) => ({ idSystem: row.idSystem, label: systemLabel(row) ?? row.systemName }));
}

export type CreateStoryResult = { ok: false; errors: Record<string, string> };

/**
 * Validates and inserts a new game owned by the caller, then redirects to the
 * Stories page. Validation failures come back as field errors for the form;
 * on success the redirect throws, so this never resolves with ok: true.
 */
export async function createStory(input: unknown): Promise<CreateStoryResult> {
  const user = await requireUser();

  const parsed = newStorySchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const values = parsed.data;
  await db.insert(games).values({
    gameTitle: values.title,
    idSystem: values.idSystem,
    summary: values.summary || null,
    imageUrl: values.imageUrl || null,
    isLookingForPlayers: values.isLookingForPlayers,
    idCreatedByUser: user.id,
    idUpdatedByUser: user.id,
  });

  redirect("/home");
}

/**
 * Adds or removes the caller's favorite on a story. Idempotent in both
 * directions: adding twice relies on the (id_game, id_user) unique constraint
 * and removing an absent row is a no-op. Only ever touches rows for user.id.
 */
export async function setFavorite(
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
      .values({ idGame: id, idUser: user.id, idCreatedByUser: user.id, idUpdatedByUser: user.id })
      .onConflictDoNothing({ target: [gameFavorites.idGame, gameFavorites.idUser] });
  } else {
    await db
      .delete(gameFavorites)
      .where(and(eq(gameFavorites.idGame, id), eq(gameFavorites.idUser, user.id)));
  }

  return { isFavorite: wanted };
}
