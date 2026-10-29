"use server";

import { and, asc, count, eq, exists, ilike, not, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { cardOrder, cardQuery, notArchived } from "@/db/story-cards";
import { requireAccount } from "@/lib/authorize";
import { likeContains } from "@/lib/filter-text";
import type { LikedSystem, Profile } from "@/lib/profile";
import { MAX_LIKED_SYSTEMS, profileDetailsSchema, systemIdSchema } from "@/lib/profile-schemas";
import { systemLabel, type StoryCardData } from "@/lib/stories";

const { stories, storyPlayers, systems, user: users, userSystems } = schema;

// The profile dialog's server actions. They live beside the dialog rather
// than under a route because the account menu opens it on every signed-in
// page, so no single page owns them. Each starts by proving who is asking,
// and the caller's id is the only user id that ever reaches a query: a user
// edits and lists their own profile and nobody else's.

export type ProfileResult = { ok: true } | { ok: false; errors: Record<string, string> };

export type LikedSystemsResult =
  { ok: true; systems: LikedSystem[] } | { ok: false; errors: Record<string, string> };

/** How many systems one search returns; the popover lists them all. */
const SYSTEM_SEARCH_LIMIT = 20;

const querySchema = z.string().max(200);

const systemColumns = {
  idSystem: systems.idSystem,
  systemName: systems.systemName,
  systemVersion: systems.systemVersion,
  variant: systems.variant,
};

// The same order sa_listSystems gives the story form's picker, so a system
// sits in the same place wherever it is listed.
const systemOrder = [asc(systems.systemName), asc(systems.systemVersion), asc(systems.variant)];

function toLikedSystem(row: {
  idSystem: number;
  systemName: string;
  systemVersion: string | null;
  variant: string | null;
}): LikedSystem {
  return { idSystem: row.idSystem, label: systemLabel(row) ?? row.systemName };
}

async function likedSystems(userId: string): Promise<LikedSystem[]> {
  const rows = await db
    .select(systemColumns)
    .from(userSystems)
    .innerJoin(systems, eq(systems.idSystem, userSystems.idSystem))
    .where(eq(userSystems.idUser, userId))
    .orderBy(...systemOrder);
  return rows.map(toLikedSystem);
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    errors[issue.path.join(".")] ??= issue.message;
  }
  return errors;
}

/**
 * The caller's profile as the card shows it. Read fresh each time the dialog
 * opens rather than taken from the CurrentUser in context, which deliberately
 * carries neither the bio nor the join date.
 */
export async function sa_getProfile(): Promise<Profile> {
  const user = await requireAccount();

  return {
    name: user.name,
    email: user.email,
    nickName: user.nickName,
    bio: user.bio,
    image: user.image,
    createdAt: user.createdAt,
    systems: await likedSystems(user.id),
  };
}

/**
 * Saves the caller's name, nickname and bio. The card sends all three
 * whichever one was edited, so one schema checks the lot; an empty nickname
 * or bio is stored as "" and null respectively, since the rest of the app
 * reads a "" nickname as none already and a bio has no reader that would.
 */
export async function sa_updateProfileDetails(input: unknown): Promise<ProfileResult> {
  const user = await requireAccount();

  const parsed = profileDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error.issues) };

  const { name, nickName, bio } = parsed.data;
  await db
    .update(users)
    .set({ name, nickName, bio: bio === "" ? null : bio })
    .where(eq(users.id, user.id));

  return { ok: true };
}

/**
 * Systems whose name, variant or version contains the query, less the ones
 * the caller already likes, which the popover would otherwise offer twice. A
 * blank query lists from the top so the popover has something to show as it
 * opens.
 */
export async function sa_searchSystems(query: string): Promise<LikedSystem[]> {
  const user = await requireAccount();
  const needle = querySchema.parse(query).trim();

  const alreadyLiked = exists(
    db
      .select({ one: userSystems.idUserSystem })
      .from(userSystems)
      .where(and(eq(userSystems.idSystem, systems.idSystem), eq(userSystems.idUser, user.id))),
  );
  const label = sql<string>`concat_ws(' ', ${systems.systemName}, ${systems.variant}, ${systems.systemVersion})`;

  const rows = await db
    .select(systemColumns)
    .from(systems)
    .where(
      needle === ""
        ? not(alreadyLiked)
        : and(ilike(label, likeContains(needle)), not(alreadyLiked)),
    )
    .orderBy(...systemOrder)
    .limit(SYSTEM_SEARCH_LIMIT);
  return rows.map(toLikedSystem);
}

/**
 * Adds a system to the caller's liked list and hands back the whole list, so
 * the card shows it in the order the server keeps. Liking one twice is a
 * no-op on the (id_user, id_system) unique key. The cap is checked before the
 * insert; two tabs adding at the same moment could both pass it and land one
 * over, which is harmless for a list on a profile.
 */
export async function sa_addLikedSystem(idSystem: number): Promise<LikedSystemsResult> {
  const user = await requireAccount();
  const id = systemIdSchema.parse(idSystem);

  const [system] = await db
    .select({ idSystem: systems.idSystem })
    .from(systems)
    .where(eq(systems.idSystem, id))
    .limit(1);
  if (!system) return { ok: false, errors: { root: "That system is not on the list any more." } };

  const [{ liked }] = await db
    .select({ liked: count() })
    .from(userSystems)
    .where(eq(userSystems.idUser, user.id));
  if (liked >= MAX_LIKED_SYSTEMS) {
    return { ok: false, errors: { root: `Keep it to ${MAX_LIKED_SYSTEMS} systems.` } };
  }

  await db
    .insert(userSystems)
    .values({ idUser: user.id, idSystem: id, idCreatedByUser: user.id, idUpdatedByUser: user.id })
    .onConflictDoNothing({ target: [userSystems.idUser, userSystems.idSystem] });

  return { ok: true, systems: await likedSystems(user.id) };
}

/** Takes a system off the caller's liked list; removing one not on it is a no-op. */
export async function sa_removeLikedSystem(idSystem: number): Promise<LikedSystemsResult> {
  const user = await requireAccount();
  const id = systemIdSchema.parse(idSystem);

  await db
    .delete(userSystems)
    .where(and(eq(userSystems.idUser, user.id), eq(userSystems.idSystem, id)));

  return { ok: true, systems: await likedSystems(user.id) };
}

/**
 * The stories the caller tells, archived ones left out. Inactive ones stay:
 * a profile lists what someone runs, and a story resting between arcs is
 * still theirs. Unpaged, since one person's own stories are few.
 */
export async function sa_listOwnedStories(): Promise<StoryCardData[]> {
  const user = await requireAccount();

  return cardQuery(user.id)
    .where(and(eq(stories.idCreatedByUser, user.id), notArchived))
    .orderBy(...cardOrder);
}

/**
 * The stories the caller has a seat in as a player, archived ones left out.
 * A story they also tell is listed under My Stories only, so a storyteller
 * who sat themselves at their own table does not see it twice.
 */
export async function sa_listPlayingStories(): Promise<StoryCardData[]> {
  const user = await requireAccount();

  const playsIn = exists(
    db
      .select({ one: storyPlayers.idStoryPlayer })
      .from(storyPlayers)
      .where(and(eq(storyPlayers.idStory, stories.idStory), eq(storyPlayers.idUser, user.id))),
  );

  return cardQuery(user.id)
    .where(and(playsIn, notArchived, sql`${stories.idCreatedByUser} is distinct from ${user.id}`))
    .orderBy(...cardOrder);
}
