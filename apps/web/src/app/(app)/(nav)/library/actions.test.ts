// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` inserts a second user and
// three stories covering each branch: one the test user owns, one they own but
// archived, and a stranger's that the test user plays in. Fixture ids are
// positive and left to the database default, so they never collide with the
// seed's negative ids.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

// Signed in as a test user of its own, never a real account (test-user.ts).
const TEST_USER_EMAIL = "library-actions@example.test";
let testUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: testUser } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

const TITLE_OWNS = "Library fixture — test user's own story";
const TITLE_OWNS_ARCHIVED = "Library fixture — test user's own archived story";
const TITLE_PLAYS_IN = "Library fixture — other's story, test user plays in it";

let otherUserId = "";
let owns = 0;
let ownsArchived = 0;
let playsIn = 0;
let fixtureStoryIds: number[] = [];

describe("library actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    actions = await import("./actions");

    const [otherUser] = await db
      .insert(tables.user)
      .values({ name: "Library Fixture Other", email: "library-fixture-other@example.test" })
      .returning({ id: tables.user.id });
    otherUserId = otherUser.id;

    const inserted = await db
      .insert(tables.stories)
      .values([
        { title: TITLE_OWNS, idCreatedByUser: testUser, idSystem: -26 },
        {
          title: TITLE_OWNS_ARCHIVED,
          idCreatedByUser: testUser,
          isActive: false,
          isArchived: true,
        },
        { title: TITLE_PLAYS_IN, idCreatedByUser: otherUserId },
      ])
      .returning({ idStory: tables.stories.idStory, title: tables.stories.title });
    const idFor = (title: string) => inserted.find((row) => row.title === title)!.idStory;
    owns = idFor(TITLE_OWNS);
    ownsArchived = idFor(TITLE_OWNS_ARCHIVED);
    playsIn = idFor(TITLE_PLAYS_IN);
    fixtureStoryIds = [owns, ownsArchived, playsIn];

    await db.insert(tables.storyPlayers).values({ idStory: playsIn, idUser: testUser });
  });

  after(async () => {
    if (!db) return;
    if (fixtureStoryIds.length) {
      await db
        .delete(tables.storyPlayers)
        .where(inArray(tables.storyPlayers.idStory, fixtureStoryIds));
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, fixtureStoryIds));
    }
    if (otherUserId) await db.delete(tables.user).where(eq(tables.user.id, otherUserId));
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  it("lists every story the caller is the storyteller of, archived ones included", async () => {
    const ids = (await actions.sa_listLibraryStories()).map((story) => story.idStory);

    expect(ids).toContain(owns);
    expect(ids).toContain(ownsArchived);
    // Playing in a story gives no library to open.
    expect(ids).not.toContain(playsIn);
  });

  it("names each story with its system and says whether it is still running", async () => {
    const stories = await actions.sa_listLibraryStories();

    expect(stories.find((story) => story.idStory === owns)).toEqual({
      idStory: owns,
      title: TITLE_OWNS,
      system: "Cypher System · Numenera (Revised)",
      isActive: true,
      isArchived: false,
    });
    expect(stories.find((story) => story.idStory === ownsArchived)).toMatchObject({
      system: null,
      isActive: false,
      isArchived: true,
    });
  });
});
