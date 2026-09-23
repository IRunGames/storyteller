// Integration test against the real database. Skipped when DATABASE_URL is
// unset so `just test` stays green offline. Relies on db/seeds/seed_games.sql
// having been applied: the seed user owns 14 games.
//
// The seed alone cannot tell a working query from `return []`: game_players,
// game_favorites and "looking for players" are all empty in it. So `before`
// inserts a second user and three games of its own — a game the seed user only
// PLAYS in, a game it merely favorites, and a flagged-but-inactive game — and
// `after` deletes them again. Every fixture id is positive and left to the
// database default, so it can never collide with the seed's negative ids.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));

let actions: typeof import("./actions");

// `@/db` opens its pool at import time, so it has to be pulled in from inside
// `before` — a static import is evaluated before loadEnvConfig() above runs,
// and the pool would be built without a connection string.
type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

const TITLE_A = "Fixture A — other's game, seed user plays in it, LFP, active";
const TITLE_B = "Fixture B — other's game, seed user only favorites it";
const TITLE_C = "Fixture C — other's game, LFP but inactive";
const TITLE_D = "Fixture D — seed user's own game, inactive";

let otherUserId = "";
let gameA = 0;
let gameB = 0;
let gameC = 0;
let gameD = 0;
let openSessionId = 0;
let pastSessionIds: number[] = [];
let fixtureGameIds: number[] = [];

describe("stories actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    const [otherUser] = await db
      .insert(tables.user)
      .values({ name: "Fixture Other", nickName: "Other", email: "fixture-other@example.test" })
      .returning({ id: tables.user.id });
    otherUserId = otherUser.id;

    // RETURNING order for a multi-row INSERT is not promised, so map by title.
    const inserted = await db
      .insert(tables.games)
      .values([
        {
          gameTitle: TITLE_A,
          idCreatedByUser: otherUserId,
          isLookingForPlayers: true,
          isActive: true,
        },
        { gameTitle: TITLE_B, idCreatedByUser: otherUserId },
        {
          gameTitle: TITLE_C,
          idCreatedByUser: otherUserId,
          isLookingForPlayers: true,
          isActive: false,
        },
        { gameTitle: TITLE_D, idCreatedByUser: SEED_USER, isActive: false },
      ])
      .returning({ idGame: tables.games.idGame, gameTitle: tables.games.gameTitle });

    const idFor = (title: string) => {
      const row = inserted.find((r) => r.gameTitle === title);
      if (!row) throw new Error(`fixture game not inserted: ${title}`);
      return row.idGame;
    };
    gameA = idFor(TITLE_A);
    gameB = idFor(TITLE_B);
    gameC = idFor(TITLE_C);
    gameD = idFor(TITLE_D);
    fixtureGameIds = [gameA, gameB, gameC, gameD];

    // The seed user plays in A but does not own it: this is the only row that
    // exercises the exists(plays-in) branch of sa_listMyStories.
    await db.insert(tables.gamePlayers).values({ idGame: gameA, idUser: SEED_USER });

    // The seed user favorites B; the OTHER user favorites A. A must never
    // reach the seed user's favorites, which is what pins the idUser predicate.
    await db.insert(tables.gameFavorites).values([
      { idGame: gameB, idUser: SEED_USER },
      { idGame: gameA, idUser: otherUserId },
    ]);

    // A is at the table: its current session is open. B's current session has
    // already finished, which is what pins the status predicate rather than
    // a bare "has a current session".
    const [openSession] = await db
      .insert(tables.gameSessions)
      .values({ idGame: gameA })
      .returning({ id: tables.gameSessions.idGameSession });
    openSessionId = openSession.id;
    const [doneSession] = await db
      .insert(tables.gameSessions)
      .values({ idGame: gameB })
      .returning({ id: tables.gameSessions.idGameSession });
    await db
      .update(tables.gameSessions)
      .set({ status: "done" })
      .where(eq(tables.gameSessions.idGameSession, doneSession.id));
    await db
      .update(tables.games)
      .set({ idGameSession: openSession.id })
      .where(eq(tables.games.idGame, gameA));
    await db
      .update(tables.games)
      .set({ idGameSession: doneSession.id })
      .where(eq(tables.games.idGame, gameB));

    // D's current session came back from a pause: open -> suspended ->
    // resumed, one update per step because the trigger only allows the
    // transitions the workflow lists. It is at the table just like A's.
    const [resumedSession] = await db
      .insert(tables.gameSessions)
      .values({ idGame: gameD })
      .returning({ id: tables.gameSessions.idGameSession });
    for (const status of ["suspended", "resumed"] as const) {
      await db
        .update(tables.gameSessions)
        .set({ status })
        .where(eq(tables.gameSessions.idGameSession, resumedSession.id));
    }
    await db
      .update(tables.games)
      .set({ idGameSession: resumedSession.id })
      .where(eq(tables.games.idGame, gameD));

    // A has played before: five finished sessions on top of the open one, so
    // sa_listStorySessions has a full first page and one row left over. They
    // are inserted after the open session, so they are newer than it and the
    // open one is what the second page holds. The workflow trigger stamps
    // open_at with NOW() on insert and done_at on the move to done; open_at
    // is pushed back first so the generated length is 90 minutes rather
    // than the few milliseconds between the two statements.
    const pastSessions = await db
      .insert(tables.gameSessions)
      .values(Array.from({ length: 5 }, () => ({ idGame: gameA })))
      .returning({ id: tables.gameSessions.idGameSession });
    pastSessionIds = pastSessions.map((row) => row.id);
    await db
      .update(tables.gameSessions)
      .set({ openAt: sql`now() - interval '90 minutes'` })
      .where(inArray(tables.gameSessions.idGameSession, pastSessionIds));
    await db
      .update(tables.gameSessions)
      .set({ status: "done" })
      .where(inArray(tables.gameSessions.idGameSession, pastSessionIds));
  });

  after(async () => {
    if (!db) return;
    if (fixtureGameIds.length) {
      // Sessions first: games.id_game_session points at them.
      await db
        .update(tables.games)
        .set({ idGameSession: null })
        .where(inArray(tables.games.idGame, fixtureGameIds));
      await db
        .delete(tables.gameSessions)
        .where(inArray(tables.gameSessions.idGame, fixtureGameIds));
      await db
        .delete(tables.gameFavorites)
        .where(inArray(tables.gameFavorites.idGame, fixtureGameIds));
      await db.delete(tables.gamePlayers).where(inArray(tables.gamePlayers.idGame, fixtureGameIds));
      await db.delete(tables.games).where(inArray(tables.games.idGame, fixtureGameIds));
    }
    if (otherUserId) await db.delete(tables.user).where(eq(tables.user.id, otherUserId));

    // Otherwise the process lingers until the pool's idle timeout.
    await db.$client.end();
  });

  it("lists the seed user's stories newest-updated first, ten at a time", async () => {
    // Half the seed games are inactive, so ask for all of them here.
    const first = await actions.sa_listMyStories(0, true);
    const second = await actions.sa_listMyStories(10, true);

    expect(first).toHaveLength(10);
    expect(second.length).toBeGreaterThanOrEqual(4);
    expect(first.map((s) => s.idGame)).not.toContain(second[0].idGame);
    expect(first[0]).toMatchObject({
      gameTitle: expect.any(String),
      lastPlayed: expect.any(Date),
    });
  });

  it("includes a game the user only plays in, and not one they neither own nor play", async () => {
    const all = [...(await actions.sa_listMyStories(0)), ...(await actions.sa_listMyStories(10))];
    const ids = all.map((s) => s.idGame);

    expect(ids).toContain(gameA);
    expect(ids).not.toContain(gameB);
    expect(ids).not.toContain(gameC);
  });

  it("joins the system onto each card", async () => {
    // The Devil's Spine is inactive in the seed, so include inactive games.
    const all = [
      ...(await actions.sa_listMyStories(0, true)),
      ...(await actions.sa_listMyStories(10, true)),
    ];
    const numenera = all.find((s) => s.gameTitle === "The Devil's Spine");

    expect(numenera).toMatchObject({
      systemName: "Cypher System",
      variant: "Numenera",
      systemVersion: "Revised",
    });
  });

  it("returns only the caller's own favorites", async () => {
    const ids = (await actions.sa_listFavoriteStories(0)).map((s) => s.idGame);

    // Scoped to the fixtures so a real favorite the owner adds while poking at
    // the UI does not fail the suite. The equality still pins the idUser
    // predicate: the OTHER user favorites A, and A must not appear.
    expect(ids.filter((id) => fixtureGameIds.includes(id))).toEqual([gameB]);
    expect(ids).not.toContain(gameA);
  });

  it("returns only active games that are looking for players", async () => {
    const ids = (await actions.sa_listLookingForPlayers(0)).map((s) => s.idGame);

    // Scoped to the fixtures so a real game flagged through the UI does not
    // fail the suite. A is flagged + active; C is flagged but inactive and
    // must be filtered out by is_active.
    expect(ids.filter((id) => fixtureGameIds.includes(id))).toEqual([gameA]);
    expect(ids).not.toContain(gameC);
  });

  it("fetches one story by id", async () => {
    const story = await actions.sa_getStory(-1);
    expect(story?.gameTitle).toBe("Something Wicked");
    expect(await actions.sa_getStory(999999)).toBeNull();
    // Beyond int4: Postgres would error on the comparison, so the id is
    // rejected before the query and the page's notFound() takes over.
    expect(await actions.sa_getStory(3000000000)).toBeNull();
  });

  it("lists a story's players by display name, in the order they joined", async () => {
    // Vampire (-15) seats PaulKhash and Pol in db/seeds/seed_game_players.sql,
    // with one joined_at between them, so the name breaks the tie. Pol is the
    // seed user, who has no nickname, so their name is used.
    const players = await actions.sa_listStoryPlayers(-15);

    expect(players).toEqual([
      { idUser: expect.any(String), name: "PaulKhash", image: null },
      { idUser: SEED_USER, name: "Pol", image: null },
    ]);
  });

  it("returns no players for a story without any, or with an unusable id", async () => {
    expect(await actions.sa_listStoryPlayers(-1)).toEqual([]);
    expect(await actions.sa_listStoryPlayers(3000000000)).toEqual([]);
  });

  it("lists a story's sessions newest first, five at a time, with their length", async () => {
    const first = await actions.sa_listStorySessions(gameA, 0);
    expect(first.map((s) => s.idGameSession)).toEqual([...pastSessionIds].sort((a, b) => b - a));
    for (const session of first) {
      expect(session.status).toBe("done");
      expect(session.length).toBe(90);
      expect(session.startedAt).toBeInstanceOf(Date);
    }

    // The open session is the oldest, so it is all the second page holds,
    // and it has no length yet.
    const second = await actions.sa_listStorySessions(gameA, 5);
    expect(second).toHaveLength(1);
    expect(second[0].idGameSession).toBe(openSessionId);
    expect(second[0].status).toBe("open");
    expect(second[0].length).toBeNull();
  });

  it("leaves the time a session sat suspended out of its length", async () => {
    const [session] = await db
      .insert(tables.gameSessions)
      .values({ idGame: gameB })
      .returning({ id: tables.gameSessions.idGameSession });
    // PgUpdateSetSource rather than the insert type so a value may be SQL.
    const set = (values: PgUpdateSetSource<typeof tables.gameSessions>) =>
      db
        .update(tables.gameSessions)
        .set(values)
        .where(eq(tables.gameSessions.idGameSession, session.id));

    // Opened 90 minutes ago, paused 30 minutes ago, resumed now and done now:
    // an hour at the table. The workflow trigger stamps suspended_at with
    // NOW() on the move to suspended, so it is pushed back afterwards, in
    // its own statement, the way open_at is for the page-one fixtures.
    await set({ openAt: sql`now() - interval '90 minutes'` });
    await set({ status: "suspended" });
    await set({ suspendedAt: sql`now() - interval '30 minutes'` });
    await set({ status: "resumed" });
    await set({ status: "done" });

    const sessions = await actions.sa_listStorySessions(gameB, 0);
    expect(sessions.find((s) => s.idGameSession === session.id)?.length).toBe(60);
  });

  it("returns no sessions for a story without any, or with an unusable id", async () => {
    expect(await actions.sa_listStorySessions(gameC, 0)).toEqual([]);
    expect(await actions.sa_listStorySessions(2 ** 40, 0)).toEqual([]);
  });

  it("lists systems with a display label", async () => {
    const systems = await actions.sa_listSystems();
    expect(systems.length).toBeGreaterThan(100);
    expect(systems.find((s) => s.idSystem === -26)?.label).toBe(
      "Cypher System · Numenera (Revised)",
    );
  });

  it("rejects a negative offset", async () => {
    await expect(actions.sa_listMyStories(-1)).rejects.toThrow();
  });

  it("returns field errors for an invalid new story", async () => {
    const result = await actions.sa_createStory({
      title: "",
      idSystem: null,
      summary: "",
      imageUrl: "",
      isLookingForPlayers: false,
    });
    expect(result).toEqual({ ok: false, errors: { title: "Please give the story a title." } });
  });

  it("marks each card with whether the caller has favorited it", async () => {
    const mine = [...(await actions.sa_listMyStories(0)), ...(await actions.sa_listMyStories(10))];
    const cardA = mine.find((s) => s.idGame === gameA);
    expect(cardA?.isFavorite).toBe(false); // the OTHER user favorited A, not the caller

    const favorites = await actions.sa_listFavoriteStories(0);
    expect(favorites.find((s) => s.idGame === gameB)?.isFavorite).toBe(true);
  });

  it("marks a card whose current session is open, and not one whose session is done", async () => {
    const open = await actions.sa_listLookingForPlayers(0);
    expect(open.find((s) => s.idGame === gameA)?.hasOpenSession).toBe(true);

    const favorites = await actions.sa_listFavoriteStories(0);
    expect(favorites.find((s) => s.idGame === gameB)?.hasOpenSession).toBe(false);

    // No current session at all.
    expect((await actions.sa_getStory(-1))?.hasOpenSession).toBe(false);

    // Resumed after a pause counts as open: the table is in play again.
    expect((await actions.sa_getStory(gameD))?.hasOpenSession).toBe(true);
  });

  it("counts each card's players", async () => {
    const all = [
      ...(await actions.sa_listMyStories(0, true)),
      ...(await actions.sa_listMyStories(10, true)),
    ];
    // Vampire seats two in db/seeds/seed_game_players.sql; Something Wicked
    // seats nobody; the seed user is fixture A's only player.
    expect(all.find((s) => s.idGame === -15)?.playerCount).toBe(2);
    expect(all.find((s) => s.idGame === -1)?.playerCount).toBe(0);
    expect(all.find((s) => s.idGame === gameA)?.playerCount).toBe(1);
  });

  it("hides the caller's inactive stories unless asked to show them", async () => {
    const all = async (showInactive: boolean) => [
      ...(await actions.sa_listMyStories(0, showInactive)),
      ...(await actions.sa_listMyStories(10, showInactive)),
    ];

    const hidden = (await all(false)).map((s) => s.idGame);
    expect(hidden).not.toContain(gameD);
    expect(hidden).toContain(gameA);

    const shown = await all(true);
    expect(shown.map((s) => s.idGame)).toContain(gameD);
    expect(shown.find((s) => s.idGame === gameD)?.isActive).toBe(false);
    expect(shown.find((s) => s.idGame === gameA)?.isActive).toBe(true);
  });

  it("marks each card with whether the caller owns it", async () => {
    const mine = [...(await actions.sa_listMyStories(0)), ...(await actions.sa_listMyStories(10))];
    expect(mine.find((s) => s.idGame === -1)?.isOwner).toBe(true); // seed user created it
    expect(mine.find((s) => s.idGame === gameA)?.isOwner).toBe(false); // only plays in it
  });

  it("names each card's storyteller, preferring their nickname", async () => {
    const mine = [...(await actions.sa_listMyStories(0)), ...(await actions.sa_listMyStories(10))];
    expect(mine.find((s) => s.idGame === gameA)?.storytellerName).toBe("Other"); // nickname set
    expect(mine.find((s) => s.idGame === -1)?.storytellerName).toBe("Pol"); // seed user has none

    // The favorites list builds its joins separately, so it is checked too.
    const favorites = await actions.sa_listFavoriteStories(0);
    expect(favorites.find((s) => s.idGame === gameB)?.storytellerName).toBe("Other");
  });

  it("adds and removes a favorite for the caller only, idempotently", async () => {
    expect(await actions.sa_setFavorite(gameC, true)).toEqual({ isFavorite: true });
    // A second add must not trip the (id_game, id_user) unique constraint.
    expect(await actions.sa_setFavorite(gameC, true)).toEqual({ isFavorite: true });

    let ids = (await actions.sa_listFavoriteStories(0)).map((s) => s.idGame);
    expect(ids).toContain(gameC);

    expect(await actions.sa_setFavorite(gameC, false)).toEqual({ isFavorite: false });
    ids = (await actions.sa_listFavoriteStories(0)).map((s) => s.idGame);
    expect(ids).not.toContain(gameC);

    // The other user's favorite on A is untouched by any of the above.
    const otherRows = await db
      .select({ id: tables.gameFavorites.idGameFavorite })
      .from(tables.gameFavorites)
      .where(eq(tables.gameFavorites.idUser, otherUserId));
    expect(otherRows).toHaveLength(1);
  });

  it("refuses to favorite a story that does not exist", async () => {
    await expect(actions.sa_setFavorite(999999, true)).rejects.toThrow("Story not found");
  });
});
