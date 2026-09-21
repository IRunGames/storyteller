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
import { eq, inArray } from "drizzle-orm";
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
let fixtureGameIds: number[] = [];

describe("home actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    const [otherUser] = await db
      .insert(tables.user)
      .values({ name: "Fixture Other", email: "fixture-other@example.test" })
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
    // exercises the exists(plays-in) branch of listMyStories.
    await db.insert(tables.gamePlayers).values({ idGame: gameA, idUser: SEED_USER });

    // The seed user favorites B; the OTHER user favorites A. A must never
    // reach the seed user's favorites, which is what pins the idUser predicate.
    await db.insert(tables.gameFavorites).values([
      { idGame: gameB, idUser: SEED_USER },
      { idGame: gameA, idUser: otherUserId },
    ]);
  });

  after(async () => {
    if (!db) return;
    if (fixtureGameIds.length) {
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
    const first = await actions.listMyStories(0, true);
    const second = await actions.listMyStories(10, true);

    expect(first).toHaveLength(10);
    expect(second.length).toBeGreaterThanOrEqual(4);
    expect(first.map((s) => s.idGame)).not.toContain(second[0].idGame);
    expect(first[0]).toMatchObject({
      gameTitle: expect.any(String),
      lastPlayed: expect.any(Date),
    });
  });

  it("includes a game the user only plays in, and not one they neither own nor play", async () => {
    const all = [...(await actions.listMyStories(0)), ...(await actions.listMyStories(10))];
    const ids = all.map((s) => s.idGame);

    expect(ids).toContain(gameA);
    expect(ids).not.toContain(gameB);
    expect(ids).not.toContain(gameC);
  });

  it("joins the system onto each card", async () => {
    // The Devil's Spine is inactive in the seed, so include inactive games.
    const all = [
      ...(await actions.listMyStories(0, true)),
      ...(await actions.listMyStories(10, true)),
    ];
    const numenera = all.find((s) => s.gameTitle === "The Devil's Spine");

    expect(numenera).toMatchObject({
      systemName: "Cypher System",
      variant: "Numenera",
      systemVersion: "Revised",
    });
  });

  it("returns only the caller's own favorites", async () => {
    const ids = (await actions.listFavoriteStories(0)).map((s) => s.idGame);

    // Scoped to the fixtures so a real favorite the owner adds while poking at
    // the UI does not fail the suite. The equality still pins the idUser
    // predicate: the OTHER user favorites A, and A must not appear.
    expect(ids.filter((id) => fixtureGameIds.includes(id))).toEqual([gameB]);
    expect(ids).not.toContain(gameA);
  });

  it("returns only active games that are looking for players", async () => {
    const ids = (await actions.listLookingForPlayers(0)).map((s) => s.idGame);

    // Scoped to the fixtures so a real game flagged through the UI does not
    // fail the suite. A is flagged + active; C is flagged but inactive and
    // must be filtered out by is_active.
    expect(ids.filter((id) => fixtureGameIds.includes(id))).toEqual([gameA]);
    expect(ids).not.toContain(gameC);
  });

  it("fetches one story by id", async () => {
    const story = await actions.getStory(-1);
    expect(story?.gameTitle).toBe("Something Wicked");
    expect(await actions.getStory(999999)).toBeNull();
    // Beyond int4: Postgres would error on the comparison, so the id is
    // rejected before the query and the page's notFound() takes over.
    expect(await actions.getStory(3000000000)).toBeNull();
  });

  it("lists systems with a display label", async () => {
    const systems = await actions.listSystems();
    expect(systems.length).toBeGreaterThan(100);
    expect(systems.find((s) => s.idSystem === -26)?.label).toBe(
      "Cypher System · Numenera (Revised)",
    );
  });

  it("rejects a negative offset", async () => {
    await expect(actions.listMyStories(-1)).rejects.toThrow();
  });

  it("returns field errors for an invalid new story", async () => {
    const result = await actions.createStory({
      title: "",
      idSystem: null,
      summary: "",
      imageUrl: "",
      isLookingForPlayers: false,
    });
    expect(result).toEqual({ ok: false, errors: { title: "Please give the story a title." } });
  });

  it("marks each card with whether the caller has favorited it", async () => {
    const mine = [...(await actions.listMyStories(0)), ...(await actions.listMyStories(10))];
    const cardA = mine.find((s) => s.idGame === gameA);
    expect(cardA?.isFavorite).toBe(false); // the OTHER user favorited A, not the caller

    const favorites = await actions.listFavoriteStories(0);
    expect(favorites.find((s) => s.idGame === gameB)?.isFavorite).toBe(true);
  });

  it("hides the caller's inactive stories unless asked to show them", async () => {
    const all = async (showInactive: boolean) => [
      ...(await actions.listMyStories(0, showInactive)),
      ...(await actions.listMyStories(10, showInactive)),
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
    const mine = [...(await actions.listMyStories(0)), ...(await actions.listMyStories(10))];
    expect(mine.find((s) => s.idGame === -1)?.isOwner).toBe(true); // seed user created it
    expect(mine.find((s) => s.idGame === gameA)?.isOwner).toBe(false); // only plays in it
  });

  it("adds and removes a favorite for the caller only, idempotently", async () => {
    expect(await actions.setFavorite(gameC, true)).toEqual({ isFavorite: true });
    // A second add must not trip the (id_game, id_user) unique constraint.
    expect(await actions.setFavorite(gameC, true)).toEqual({ isFavorite: true });

    let ids = (await actions.listFavoriteStories(0)).map((s) => s.idGame);
    expect(ids).toContain(gameC);

    expect(await actions.setFavorite(gameC, false)).toEqual({ isFavorite: false });
    ids = (await actions.listFavoriteStories(0)).map((s) => s.idGame);
    expect(ids).not.toContain(gameC);

    // The other user's favorite on A is untouched by any of the above.
    const otherRows = await db
      .select({ id: tables.gameFavorites.idGameFavorite })
      .from(tables.gameFavorites)
      .where(eq(tables.gameFavorites.idUser, otherUserId));
    expect(otherRows).toHaveLength(1);
  });

  it("refuses to favorite a story that does not exist", async () => {
    await expect(actions.setFavorite(999999, true)).rejects.toThrow("Story not found");
  });
});
