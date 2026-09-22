// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The seed cannot tell a working
// query from `return []` here — game_players is empty in it — so `before`
// inserts a second user and four games covering each branch: a game the seed
// user only plays in, one they own, one they own but retired, and a
// stranger's. Fixture ids are positive and left to the database default, so
// they never collide with the seed's negative ids.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

const TITLE_PLAYS_IN = "Play fixture — other's game, seed user plays in it";
const TITLE_OWNS = "Play fixture — seed user's own active game";
const TITLE_OWNS_INACTIVE = "Play fixture — seed user's own retired game";
const TITLE_STRANGER = "Play fixture — other's game, seed user not involved";

let otherUserId = "";
let playsIn = 0;
let owns = 0;
let ownsInactive = 0;
let stranger = 0;
let fixtureGameIds: number[] = [];

describe("play actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    const [otherUser] = await db
      .insert(tables.user)
      .values({
        name: "Play Fixture Other",
        email: "play-fixture-other@example.test",
      })
      .returning({ id: tables.user.id });
    otherUserId = otherUser.id;

    const inserted = await db
      .insert(tables.games)
      .values([
        {
          gameTitle: TITLE_PLAYS_IN,
          idCreatedByUser: otherUserId,
          isActive: true,
        },
        { gameTitle: TITLE_OWNS, idCreatedByUser: SEED_USER, isActive: true },
        {
          gameTitle: TITLE_OWNS_INACTIVE,
          idCreatedByUser: SEED_USER,
          isActive: false,
        },
        {
          gameTitle: TITLE_STRANGER,
          idCreatedByUser: otherUserId,
          isActive: true,
        },
      ])
      .returning({
        idGame: tables.games.idGame,
        gameTitle: tables.games.gameTitle,
      });

    const idFor = (title: string) => {
      const row = inserted.find((r) => r.gameTitle === title);
      if (!row) throw new Error(`fixture game not inserted: ${title}`);
      return row.idGame;
    };
    playsIn = idFor(TITLE_PLAYS_IN);
    owns = idFor(TITLE_OWNS);
    ownsInactive = idFor(TITLE_OWNS_INACTIVE);
    stranger = idFor(TITLE_STRANGER);
    fixtureGameIds = [playsIn, owns, ownsInactive, stranger];

    await db
      .insert(tables.gamePlayers)
      .values({ idGame: playsIn, idUser: SEED_USER });
  });

  after(async () => {
    if (!db) return;
    if (fixtureGameIds.length) {
      await db
        .delete(tables.gamePlayers)
        .where(inArray(tables.gamePlayers.idGame, fixtureGameIds));
      await db
        .delete(tables.games)
        .where(inArray(tables.games.idGame, fixtureGameIds));
    }
    if (otherUserId)
      await db.delete(tables.user).where(eq(tables.user.id, otherUserId));
    await db.$client.end();
  });

  it("lists the active games the caller owns or plays in, and nothing else", async () => {
    const ids = (await actions.sa_listPlayableStories()).map((s) => s.idGame);

    expect(ids).toContain(owns);
    expect(ids).toContain(playsIn);
    expect(ids).not.toContain(ownsInactive);
    expect(ids).not.toContain(stranger);
  });

  it("returns every eligible game in one call, not a page of them", async () => {
    // The seed user owns 14 games, half of them active; with the two fixtures
    // that is more than a card page's worth, and all of it must come back.
    const stories = await actions.sa_listPlayableStories();
    expect(stories.length).toBeGreaterThan(10);
  });

  it("carries only what a picker needs, newest first", async () => {
    const stories = await actions.sa_listPlayableStories();
    const ids = stories.map((s) => s.idGame);

    expect(stories[0]).toEqual({
      idGame: expect.any(Number),
      gameTitle: expect.any(String),
    });
    // Relative order only: the stories suite runs alongside this one and
    // inserts fixtures of its own, so nothing here can claim the top slot.
    // Both fixtures were inserted in one statement and share updated_at, so
    // the later id leads; both come before every seed game, all negative.
    expect(ids.indexOf(owns)).toBeLessThan(ids.indexOf(playsIn));
    expect(ids.indexOf(playsIn)).toBeLessThan(ids.findIndex((id) => id < 0));
  });
});
