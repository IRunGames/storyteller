// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The seed cannot tell a working
// query from `return []` here — story_players is empty in it — so `before`
// inserts a second user and four stories covering each branch: a story the seed
// user only plays in, one they own, one they own but retired, and a
// stranger's. Fixture ids are positive and left to the database default, so
// they never collide with the seed's negative ids.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { PAGE_SIZE } from "@/lib/stories";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

const TITLE_PLAYS_IN = "Play fixture — other's story, seed user plays in it";
const TITLE_OWNS = "Play fixture — seed user's own active story";
const TITLE_OWNS_INACTIVE = "Play fixture — seed user's own retired story";
const TITLE_STRANGER = "Play fixture — other's story, seed user not involved";

let otherUserId = "";
let playsIn = 0;
let owns = 0;
let ownsInactive = 0;
let stranger = 0;
let fillerIds: number[] = [];
let fixtureStoryIds: number[] = [];

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
      .insert(tables.stories)
      .values([
        {
          title: TITLE_PLAYS_IN,
          idCreatedByUser: otherUserId,
          isActive: true,
        },
        { title: TITLE_OWNS, idCreatedByUser: SEED_USER, isActive: true },
        {
          title: TITLE_OWNS_INACTIVE,
          idCreatedByUser: SEED_USER,
          isActive: false,
        },
        {
          title: TITLE_STRANGER,
          idCreatedByUser: otherUserId,
          isActive: true,
        },
      ])
      .returning({
        idStory: tables.stories.idStory,
        title: tables.stories.title,
      });

    const idFor = (title: string) => {
      const row = inserted.find((r) => r.title === title);
      if (!row) throw new Error(`fixture story not inserted: ${title}`);
      return row.idStory;
    };
    playsIn = idFor(TITLE_PLAYS_IN);
    owns = idFor(TITLE_OWNS);
    ownsInactive = idFor(TITLE_OWNS_INACTIVE);
    stranger = idFor(TITLE_STRANGER);

    // A card page's worth of further owned stories, so "every eligible story in
    // one call" is decided by fixtures this suite controls. The seed's own
    // count of active stories is whatever the app has been used to make it
    // (archiving one from the UI is enough to change it), and the stories
    // suite runs alongside this one with fixtures of its own.
    const fillers = await db
      .insert(tables.stories)
      .values(
        Array.from({ length: PAGE_SIZE }, (_, i) => ({
          title: `Play fixture — filler ${i + 1}`,
          idCreatedByUser: SEED_USER,
          isActive: true,
        })),
      )
      .returning({ idStory: tables.stories.idStory });
    fillerIds = fillers.map((row) => row.idStory);
    fixtureStoryIds = [playsIn, owns, ownsInactive, stranger, ...fillerIds];

    await db
      .insert(tables.storyPlayers)
      .values({ idStory: playsIn, idUser: SEED_USER });
  });

  after(async () => {
    if (!db) return;
    if (fixtureStoryIds.length) {
      await db
        .delete(tables.storyPlayers)
        .where(inArray(tables.storyPlayers.idStory, fixtureStoryIds));
      await db
        .delete(tables.stories)
        .where(inArray(tables.stories.idStory, fixtureStoryIds));
    }
    if (otherUserId)
      await db.delete(tables.user).where(eq(tables.user.id, otherUserId));
    await db.$client.end();
  });

  it("lists the active stories the caller owns or plays in, and nothing else", async () => {
    const ids = (await actions.sa_listPlayableStories()).map((s) => s.idStory);

    expect(ids).toContain(owns);
    expect(ids).toContain(playsIn);
    expect(ids).not.toContain(ownsInactive);
    expect(ids).not.toContain(stranger);
  });

  it("returns every eligible story in one call, not a page of them", async () => {
    // The fillers plus the two fixtures above are more than a card page's
    // worth on their own, and every one of them must come back.
    const ids = (await actions.sa_listPlayableStories()).map((s) => s.idStory);
    expect(ids.length).toBeGreaterThan(PAGE_SIZE);
    for (const id of [...fillerIds, owns, playsIn]) expect(ids).toContain(id);
  });

  it("carries only what a picker needs, newest first", async () => {
    const stories = await actions.sa_listPlayableStories();
    const ids = stories.map((s) => s.idStory);

    expect(stories[0]).toEqual({
      idStory: expect.any(Number),
      title: expect.any(String),
    });
    // Relative order only: the stories suite runs alongside this one and
    // inserts fixtures of its own, so nothing here can claim the top slot.
    // Both fixtures were inserted in one statement and share updated_at, so
    // the later id leads; both come before every seed story, all negative.
    expect(ids.indexOf(owns)).toBeLessThan(ids.indexOf(playsIn));
    expect(ids.indexOf(playsIn)).toBeLessThan(ids.findIndex((id) => id < 0));
  });
});
