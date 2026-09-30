"use server";

import { redirect } from "next/navigation";
import { and, asc, desc, eq, exists, ilike, inArray, not, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { requireUser } from "@/lib/authorize";
import { likeContains } from "@/lib/filter-text";
import {
  PAGE_SIZE,
  PLAYER_SEARCH_LIMIT,
  SESSIONS_PAGE_SIZE,
  systemLabel,
  type PlayerMatch,
  type StoryCardData,
  type StoryPlayer,
  type StorySession,
  type StorySessionDetail,
} from "@/lib/stories";
import { storySchema, type StoryValues } from "@/lib/story-schemas";
import { sa_claimAttachments } from "@/components/uploads/actions";

const {
  stories,
  systems,
  storyPlayers,
  storyFavorites,
  storyScenes,
  storySessions,
  user: users,
} = schema;

// Every export here is a server action: it is the only way the Stories pages
// touch the database, and each one starts by proving who is asking.

const offsetSchema = z.number().int().min(0);

// A page size the caller may ask for. The floor keeps a zero-row page from
// looking like the end of the list, and the ceiling keeps one request from
// asking for the whole table.
const pageSizeSchema = z.number().int().min(1).max(100);

// stories.id_story is int4. An id outside that range is not "not found yet" to
// Postgres, it is a query error, so it gets filtered out before the query
// rather than after.
const idStorySchema = z.number().int().min(-2147483648).max(2147483647);

// Whether the caller has favorited the story on the current outer row. It is
// a correlated EXISTS rather than a join so a favorite never duplicates or
// drops a card, and it is scoped to the caller: nobody sees anyone else's
// hearts.
function favoritedBy(userId: string) {
  return exists(
    db
      .select({ one: storyFavorites.idStoryFavorite })
      .from(storyFavorites)
      .where(and(eq(storyFavorites.idStory, stories.idStory), eq(storyFavorites.idUser, userId))),
  ).mapWith(Boolean);
}

// Whether the story's current session (stories.id_story_session) is being
// played, which is status OPEN or RESUMED: a session that came back from a
// pause is at the table just as much as one that never paused. A correlated
// EXISTS like favoritedBy, and it reads the pointer rather than searching
// story_sessions for such a row: the pointer is what the table runs on, so
// the card and the table can never disagree.
//
// The workflow in s_statuses says what a session may be and what it may
// become, but not which of its statuses mean play is under way, so that
// judgement has nowhere else to live yet; a flag on s_statuses would be the
// place for it. Until there is one, a workflow renamed in the database has to
// be followed up in three places by hand: here, SESSION_STATUS_WORDING in
// lib/stories.ts, which turns these same two keys into words, and the scene
// order in sa_getStorySession below, which reads the active_at column that
// the ACTIVE key gives its name to.
const hasOpenSession = exists(
  db
    .select({ one: storySessions.idStorySession })
    .from(storySessions)
    .where(
      and(
        eq(storySessions.idStorySession, stories.idStorySession),
        inArray(storySessions.status, ["OPEN", "RESUMED"]),
      ),
    ),
).mapWith(Boolean);

// How many story_players rows the story has. A correlated subquery rather than
// a join with GROUP BY, so the paging LIMIT still counts stories, not players.
// count() comes back as a bigint string from pg; the card wants a number.
const playerCount = sql<number>`(
  select count(*) from ${storyPlayers} where ${storyPlayers.idStory} = ${stories.idStory}
)`.mapWith(Number);

// How a user is shown everywhere, storyteller or player: the same preference
// the account menu uses (nickname, else name), and NULLIF so a nickname that
// was blanked out does not win over the name.
const playerName = sql<string>`coalesce(nullif(${users.nickName}, ''), ${users.name})`;

// One projection shared by every list and by sa_getStory, so the card never sees
// a shape that differs by section.
function cardColumns(userId: string) {
  return {
    idStory: stories.idStory,
    title: stories.title,
    summary: stories.summary,
    // The story's picture is an attachments row now, not a column; the key
    // keeps its name because it still holds the url a card paints on.
    imageUrl: attachmentUrl("STORY", stories.idStory),
    lastPlayed: stories.lastPlayed,
    systemName: systems.systemName,
    systemVersion: systems.systemVersion,
    variant: systems.variant,
    isFavorite: favoritedBy(userId),
    // NULL = userId is NULL in SQL, and Boolean(null) is false, so a story with
    // no recorded creator has no owner rather than an error.
    isOwner: eq(stories.idCreatedByUser, userId).mapWith(Boolean),
    isActive: stories.isActive,
    // Null when the left join found no creator row.
    storytellerName: sql<string | null>`${playerName}`,
    hasOpenSession,
    playerCount,
  };
}

// updated_at ties are common — the seed inserts every story in one statement,
// so all 14 share a timestamp — and a LIMIT/OFFSET pair over an unstable sort
// can hand the same row to two different pages. id_story breaks the tie so the
// sections page reliably.
const cardOrder = [desc(stories.updatedAt), desc(stories.title)];

// Left joins, so a story with no system or whose creator row is gone still
// makes a card. Every list starts here; a section adds its own join or WHERE.
function cardQuery(userId: string) {
  return db
    .select(cardColumns(userId))
    .from(stories)
    .leftJoin(systems, eq(stories.idSystem, systems.idSystem))
    .leftJoin(users, eq(stories.idCreatedByUser, users.id));
}

// An archived story is off the Stories page altogether: My Stories leaves it
// out even with "Show inactive" on, and a favorite of one is not listed. It
// is not deleted, and the edit page still reaches it, so unarchiving brings
// it back.
const notArchived = eq(stories.isArchived, false);

/**
 * Stories the user created or plays in. Inactive ones are left out unless the
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
    .select({ one: storyPlayers.idStoryPlayer })
    .from(storyPlayers)
    .where(and(eq(storyPlayers.idStory, stories.idStory), eq(storyPlayers.idUser, user.id)));

  const involved = and(or(eq(stories.idCreatedByUser, user.id), exists(playsIn)), notArchived);

  return cardQuery(user.id)
    .where(includeInactive ? involved : and(involved, eq(stories.isActive, true)))
    .orderBy(...cardOrder)
    .limit(PAGE_SIZE)
    .offset(skip);
}

/** Stories the user has favorited, less any that have since been archived. */
export async function sa_listFavoriteStories(offset: number): Promise<StoryCardData[]> {
  const user = await requireUser();
  const skip = offsetSchema.parse(offset);

  return cardQuery(user.id)
    .innerJoin(
      storyFavorites,
      and(eq(storyFavorites.idStory, stories.idStory), eq(storyFavorites.idUser, user.id)),
    )
    .where(notArchived)
    .orderBy(...cardOrder)
    .limit(PAGE_SIZE)
    .offset(skip);
}

/** Active stories whose storyteller has flagged them as open to new players. */
export async function sa_listLookingForPlayers(offset: number): Promise<StoryCardData[]> {
  const user = await requireUser();
  const skip = offsetSchema.parse(offset);

  return cardQuery(user.id)
    .where(and(eq(stories.isLookingForPlayers, true), eq(stories.isActive, true)))
    .orderBy(...cardOrder)
    .limit(PAGE_SIZE)
    .offset(skip);
}

export async function sa_getStory(idStory: number): Promise<StoryCardData | null> {
  const user = await requireUser();

  // An unusable id is simply not a story: safeParse rather than parse, so the
  // page's notFound() handles it instead of a raw ZodError becoming a 500.
  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return null;

  const [story] = await cardQuery(user.id).where(eq(stories.idStory, id.data)).limit(1);
  return story ?? null;
}

/**
 * Who plays in a story, oldest member first. The storyteller is not among
 * them: they own the story through stories.id_created_by_user and have no
 * story_players row (db/seeds/seed_story_players.sql says the same).
 */
export async function sa_listStoryPlayers(idStory: number): Promise<StoryPlayer[]> {
  await requireUser();

  // As in sa_getStory: an id Postgres cannot compare is not a story, so it
  // has no players rather than raising.
  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return [];

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
 * The story's id and creator, or a throw: the storyteller is the only one who
 * seats players, so both the search and the insert start here. Not found
 * and not the owner are thrown rather than returned because the popover
 * cannot fix either; it is only shown to the owner in the first place.
 */
async function requireOwnedStory(userId: string, idStory: number): Promise<number> {
  const id = idStorySchema.parse(idStory);
  const [story] = await db
    .select({ idCreatedByUser: stories.idCreatedByUser })
    .from(stories)
    .where(eq(stories.idStory, id))
    .limit(1);
  if (!story) throw new Error("Story not found");
  if (story.idCreatedByUser !== userId) {
    throw new Error("Only the storyteller who created a story can invite players to it");
  }
  return id;
}

// Users who could be seated at the story: active, not its storyteller, and
// not already in story_players for it. Shared by the search and the insert so
// what the popover offers is exactly what the save accepts.
function seatable(idStory: number, storytellerId: string) {
  const seated = db
    .select({ one: storyPlayers.idStoryPlayer })
    .from(storyPlayers)
    .where(and(eq(storyPlayers.idStory, idStory), eq(storyPlayers.idUser, users.id)));
  return and(eq(users.isActive, true), not(eq(users.id, storytellerId)), not(exists(seated)));
}

const querySchema = z.string().max(200);

export type RemovePlayerResult = { ok: true } | { ok: false; error: string };

/**
 * Take a player off a story, and their favorite of it with them.
 *
 * Only the storyteller who created the story may do it, which
 * requireOwnedStory enforces. The favorite goes too because it is a seat at
 * a table they no longer have: leaving it behind would keep the story on the
 * Favorites section of a page they can no longer play from. A favorite they
 * never made is simply not there, and the delete says nothing about it.
 *
 * Both deletes are one transaction, so a story can never be left having
 * dropped one and kept the other. Removing someone who is not seated is not
 * an error: the row is gone either way, which is what the caller wanted.
 */
export async function sa_removeStoryPlayer(
  idStory: number,
  idUser: string,
): Promise<RemovePlayerResult> {
  const user = await requireUser();

  // The caller's right to do this at all, and an id Postgres can compare.
  // Thrown by requireOwnedStory for a story that is not theirs, which the
  // dialog cannot fix; a bad user id is a refusal it can show.
  const id = await requireOwnedStory(user.id, idStory);
  const player = z.string().uuid().safeParse(idUser);
  if (!player.success) return { ok: false, error: "That is not a player of this story." };

  // The storyteller is not in story_players and has no seat to lose, so a
  // request to remove them is refused rather than quietly doing nothing.
  if (player.data === user.id) {
    return { ok: false, error: "The storyteller cannot be removed from their own story." };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(storyPlayers)
      .where(and(eq(storyPlayers.idStory, id), eq(storyPlayers.idUser, player.data)));
    await tx
      .delete(storyFavorites)
      .where(and(eq(storyFavorites.idStory, id), eq(storyFavorites.idUser, player.data)));
  });

  return { ok: true };
}

/**
 * Up to ten users whose name, nickname or email contains the query, for the
 * Invite Players popover on a story the caller created. Case blind, over the
 * generated users.search_text column, and without the storyteller or anyone
 * already seated, so the list only ever offers people who can be added. A
 * blank query finds nobody rather than everybody.
 */
export async function sa_searchPlayers(idStory: number, query: string): Promise<PlayerMatch[]> {
  const user = await requireUser();
  const id = await requireOwnedStory(user.id, idStory);
  const needle = querySchema.parse(query).trim();
  if (needle === "") return [];

  return db
    .select({ idUser: users.id, name: playerName, email: users.email, image: users.image })
    .from(users)
    .where(and(ilike(users.searchText, likeContains(needle)), seatable(id, user.id)))
    .orderBy(asc(playerName), asc(users.email))
    .limit(PLAYER_SEARCH_LIMIT);
}

const inviteSchema = z.array(z.uuid()).min(1).max(PLAYER_SEARCH_LIMIT);

/**
 * Seats the given users at a story the caller created and returns the rows
 * the Players list should add, in the order it lists them. Anyone who is not
 * seatable (unknown, inactive, the storyteller, already at the table) is
 * skipped rather than refused: the popover's list was built moments ago and
 * a second storyteller tab may have seated someone since. story_players has
 * no unique key on (id_story, id_user), so the insert selects only the users
 * with no row yet instead of relying on a conflict.
 */
export async function sa_addStoryPlayers(
  idStory: number,
  idUsers: string[],
): Promise<StoryPlayer[]> {
  const user = await requireUser();
  const id = await requireOwnedStory(user.id, idStory);
  const ids = inviteSchema.parse(idUsers);

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
// The outer session's place in its story's opening order, counted the way
// the list sorts so the oldest is 1 and the newest is the count. count(*)
// is a bigint, which the driver hands over as a string.
function sessionNumber() {
  const earlier = alias(storySessions, "earlier");
  return sql<number>`(${db
    .select({ n: sql`count(*) + 1` })
    .from(earlier)
    .where(
      and(
        eq(earlier.idStory, storySessions.idStory),
        sql`(${earlier.createdAt}, ${earlier.idStorySession}) < (${storySessions.createdAt}, ${storySessions.idStorySession})`,
      ),
    )})`.mapWith(Number);
}

export async function sa_listStorySessions(
  idStory: number,
  offset: number,
  limit: number = SESSIONS_PAGE_SIZE,
): Promise<StorySession[]> {
  await requireUser();
  const skip = offsetSchema.parse(offset);
  // The Prep Work timeline asks for a longer page than the story page's
  // section does. The bound is here rather than trusted from the caller: a
  // page size is a number from the browser like any other.
  const take = pageSizeSchema.parse(limit);

  // As in sa_getStory: an id Postgres cannot compare is not a story, so it
  // has no sessions rather than raising.
  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return [];

  return (
    db
      .select({
        idStorySession: storySessions.idStorySession,
        number: sessionNumber(),
        title: storySessions.title,
        status: storySessions.status,
        // created_at is nullable in the schema because every audit column is,
        // but the database always stamps it; the view type wants a Date.
        startedAt: sql<Date>`${storySessions.createdAt}`.mapWith(storySessions.createdAt),
        length: storySessions.length,
      })
      .from(storySessions)
      .where(eq(storySessions.idStory, id.data))
      // Sessions opened in one statement share a created_at, so the id
      // breaks the tie and a page never repeats or skips a row.
      .orderBy(desc(storySessions.createdAt), desc(storySessions.idStorySession))
      .limit(take)
      .offset(skip)
  );
}

/**
 * How many sessions the story has in all, for the count beside the Prep Work
 * timeline's heading. Counted rather than taken from the rows loaded, which
 * are only ever the first page.
 */
export async function sa_countStorySessions(idStory: number): Promise<number> {
  await requireUser();

  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return 0;

  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(storySessions)
    .where(eq(storySessions.idStory, id.data));
  return row?.count ?? 0;
}

/**
 * One session as the info popover shows it, or null when there is no such
 * session or the id is unusable. Any signed-in user may look, as with the
 * list, but the notes and lingering questions are the storyteller's working
 * material and come back null for anyone else. The number is the session's
 * place in the story's opening order, counted the same way the list sorts,
 * so the first row of the oldest page is session 1.
 */
export async function sa_getStorySession(
  idStorySession: number,
): Promise<StorySessionDetail | null> {
  const user = await requireUser();

  // The same int4 range as a story id, and the same reasoning: an id
  // Postgres cannot compare is not a session rather than a query error.
  const id = idStorySchema.safeParse(idStorySession);
  if (!id.success) return null;

  const [row] = await db
    .select({
      idStorySession: storySessions.idStorySession,
      title: storySessions.title,
      status: storySessions.status,
      length: storySessions.length,
      imageLink: attachmentUrl("STORY_SESSION", storySessions.idStorySession),
      summary: storySessions.summary,
      notes: storySessions.notes,
      lingeringQuestions: storySessions.lingeringQuestions,
      idUsers: storySessions.idUsers,
      idStoryteller: stories.idCreatedByUser,
      number: sessionNumber(),
    })
    .from(storySessions)
    .innerJoin(stories, eq(stories.idStory, storySessions.idStory))
    .where(eq(storySessions.idStorySession, id.data))
    .limit(1);
  if (!row) return null;

  const players =
    row.idUsers.length === 0
      ? []
      : await db
          .select({ idUser: users.id, name: playerName, image: users.image })
          .from(users)
          .where(inArray(users.id, row.idUsers))
          .orderBy(asc(playerName));

  const isStoryteller = row.idStoryteller === user.id;

  // Scenes are prep: what the players have not been shown yet, and the same
  // material the Prep Work board keeps behind the owner check. A reader who
  // is not the storyteller gets none, as they get no notes, so the panel has
  // nothing to fold open.
  const scenes = isStoryteller
    ? await db
        .select({
          idStoryScene: storyScenes.idStoryScene,
          title: storyScenes.sceneTitle,
          status: storyScenes.status,
        })
        .from(storyScenes)
        .where(eq(storyScenes.idStorySession, row.idStorySession))
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
    number: row.number,
    title: row.title,
    status: row.status,
    length: row.length,
    imageLink: row.imageLink,
    summary: row.summary,
    notes: isStoryteller ? row.notes : null,
    lingeringQuestions: isStoryteller ? row.lingeringQuestions : null,
    players,
    scenes,
  };
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

// storyCreated marks the one failure that happens after the story was
// inserted: the form keeps its submit button disabled for it, because a
// second press would not retry anything, it would create a second story.
export type StoryFormResult = { ok: false; errors: Record<string, string>; storyCreated?: true };

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
 * Validates and inserts a new story owned by the caller, claims the
 * attachments the form collected before the story had an id, then redirects
 * to the Stories page. Validation failures come back as field errors for the
 * form, and a claim that fails over an already-inserted story comes back on
 * "root"; on success the redirect throws, so this never resolves with
 * ok: true.
 */
export async function sa_createStory(input: unknown): Promise<StoryFormResult> {
  const user = await requireUser();

  const parsed = storySchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed);

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
      idArchivedByUser: values.isArchived ? user.id : null,
      idCreatedByUser: user.id,
      idUpdatedByUser: user.id,
    })
    .returning({ idStory: stories.idStory });

  // Deliberately after the insert and outside any transaction with it, which
  // sa_claimAttachments' own doc comment insists on: it runs on the
  // module-level pooled db and re-proves the caller owns the parent, so from
  // another connection it could not see a story this action had not committed
  // yet and would refuse a claim that should have succeeded.
  //
  // Everything the claim checks is already true here — the story was inserted
  // moments ago with this caller as its creator, and storySchema validated the
  // ids — so a rejection means something unexpected rather than something the
  // user did. It is caught all the same, because the alternative is worse in
  // both directions: rethrown, react-hook-form would rethrow it out of
  // onSubmit and the user would get no redirect, no message and an unhandled
  // rejection in the console; swallowed, they would land on the Stories page
  // with a story whose pictures quietly went missing.
  //
  // So it comes back on "root", where the form already has an alert waiting.
  // The message has to say the story was created, because nothing else will.
  // react-hook-form works isSubmitSuccessful out from the error map left
  // behind after onSubmit, so an error here would ordinarily make the submit
  // button pressable again, and a second press would create a second story;
  // storyCreated tells StoryForm to keep it disabled instead. The orphaned
  // attachments stay detached, which is what the sweep collects, and the
  // storyteller can attach them again from the story's edit page.
  try {
    await sa_claimAttachments("STORY", story.idStory, values.attachmentIds);
  } catch {
    return {
      ok: false,
      errors: {
        root:
          "The story was created, but its attachments could not be added to it." +
          " You can add them from the story's edit page.",
      },
      storyCreated: true,
    };
  }

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
export async function sa_getStoryForEdit(idStory: number): Promise<StoryValues | null> {
  const user = await requireUser();

  // As in sa_getStory: an id Postgres cannot compare is not a story.
  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return null;

  const [story] = await db
    .select({
      title: stories.title,
      idSystem: stories.idSystem,
      summary: stories.summary,
      isLookingForPlayers: stories.isLookingForPlayers,
      isActive: stories.isActive,
      isArchived: stories.isArchived,
    })
    .from(stories)
    .where(and(eq(stories.idStory, id.data), eq(stories.idCreatedByUser, user.id)))
    .limit(1);
  if (!story) return null;

  // attachmentIds is empty on purpose: the edit form's AttachmentListField
  // loads the story's own attachments from sa_listAttachments and attaches
  // anything new as it is made, so there is nothing for the form to carry
  // and nothing for sa_updateStory to claim.
  return { ...story, summary: story.summary ?? "", attachmentIds: [] };
}

/**
 * Validates and saves the edit form over a story the caller created, then
 * redirects to the story's page. The story is read first and its creator
 * compared with the id of the users row requireUser() loaded, never an id
 * the client sent; a mismatch is thrown, since the form cannot fix it. The
 * same predicate is repeated in the UPDATE's WHERE so the write cannot land
 * on a row that changed hands between the read and the write.
 *
 * storySchema's attachmentIds are validated and then ignored: the edit form's
 * AttachmentListField creates each row already pointing at this story, so
 * there is never anything left here to claim.
 */
export async function sa_updateStory(idStory: number, input: unknown): Promise<StoryFormResult> {
  const user = await requireUser();
  const id = idStorySchema.parse(idStory);

  const [story] = await db
    .select({ idCreatedByUser: stories.idCreatedByUser })
    .from(stories)
    .where(eq(stories.idStory, id))
    .limit(1);
  if (!story) throw new Error("Story not found");
  if (story.idCreatedByUser !== user.id) {
    throw new Error("Only the storyteller who created a story can edit it");
  }

  const parsed = storySchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed);

  const values = parsed.data;
  const updated = await db
    .update(stories)
    .set({
      title: values.title,
      idSystem: values.idSystem,
      summary: values.summary || null,
      isLookingForPlayers: values.isLookingForPlayers,
      isActive: values.isActive,
      isArchived: values.isArchived,
      // Only the creator gets here, so the archiver is always the caller.
      // Null on the way out is what the unarchive trigger would set anyway;
      // archived_at is the database's to stamp and clear.
      idArchivedByUser: values.isArchived ? user.id : null,
      idUpdatedByUser: user.id,
    })
    .where(and(eq(stories.idStory, id), eq(stories.idCreatedByUser, user.id)))
    .returning({ idStory: stories.idStory });
  if (updated.length === 0) throw new Error("Story not found");

  redirect(`/stories/${id}`);
}

/**
 * Adds or removes the caller's favorite on a story. Idempotent in both
 * directions: adding twice relies on the (id_story, id_user) unique constraint
 * and removing an absent row is a no-op. Only ever touches rows for user.id.
 */
export async function sa_setFavorite(
  idStory: number,
  isFavorite: boolean,
): Promise<{ isFavorite: boolean }> {
  const user = await requireUser();
  const id = idStorySchema.parse(idStory);
  const wanted = z.boolean().parse(isFavorite);

  const [story] = await db
    .select({ idStory: stories.idStory })
    .from(stories)
    .where(eq(stories.idStory, id))
    .limit(1);
  if (!story) throw new Error("Story not found");

  if (wanted) {
    await db
      .insert(storyFavorites)
      .values({
        idStory: id,
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
      .where(and(eq(storyFavorites.idStory, id), eq(storyFavorites.idUser, user.id)));
  }

  return { isFavorite: wanted };
}
