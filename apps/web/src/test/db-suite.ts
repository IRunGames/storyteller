// The harness every database test runs in. It loads .env.local so the pool
// has a connection string, skips the suite when DATABASE_URL is unset so
// `just test` stays green offline, replaces getSession with one the test
// controls, makes the test user the actions sign in as, and closes the pool
// and removes every user the suite made once the tests are done. Each file
// used to carry these forty lines itself; what differs between files, the
// fixtures and the other modules they mock, stays in the file.
//
// scripts/run-tests.mjs and real-accounts.test.ts recognise a database test
// by its import of this module (or a mention of DATABASE_URL), so a file that
// uses it is run serially after the unit tests and checked for real accounts.
import { after, before, describe, mock, type Mock } from "node:test";
import { inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser, type TestUserDetails } from "./test-user";

// `@/db` opens its pool at import time, so a test must only pull it in from
// inside `before`, after this has run: a static import of `@/db` anywhere in
// a test file would be evaluated first and build the pool with no connection
// string.
loadEnvConfig(process.cwd());

export const hasDb = Boolean(process.env.DATABASE_URL);

export type DbModule = typeof import("@/db");
export type Db = DbModule["db"];
export type Tables = DbModule["schema"];

/** What the mocked getSession answers: a session for `caller`, or none. */
export type MockSession = { user: { id: string } } | null;

export type DbSuite = {
  db: Db;
  tables: Tables;
  /** The id of the user made from the suite's email; "" when it named none. */
  testUser: string;
  /**
   * Who the actions think is asking: the test user to begin with. A test
   * that signs in as someone else sets it, and sets it back; "" is a visitor
   * with no session at all.
   */
  caller: string;
  /** The mocked `getSession` from @/lib/require-session, for a test that wants its own answer. */
  getSession: Mock<() => Promise<MockSession>>;
  /**
   * Makes another test user under @example.test, afresh, and removes it in
   * `after` with the rest. The name defaults to test-user.ts's "Test User".
   */
  makeUser(email: string, details?: TestUserDetails): Promise<string>;
};

export type DbSuiteOptions = {
  /**
   * The @example.test address of the user the actions sign in as, made in
   * `before` and removed in `after`. Leave it out when the suite makes every
   * user itself with `makeUser`, as the admin suites do; `caller` then starts
   * empty and getSession answers null until a test sets it.
   */
  email?: string;
};

/**
 * A `describe` for a suite that hits the real database. The body gets the
 * suite's handles, which are filled in by a `before` that runs ahead of any
 * the body registers, so the body's own `before` can read `suite.db` and
 * import the module under test; node:test runs hooks in the order they are
 * declared, which also puts the pool's close after the body's `after`.
 *
 * The body still imports the module under test itself, dynamically, inside
 * its `before`: a static import would be hoisted above the mocks registered
 * here, and the harness cannot resolve a path relative to the test file.
 * Any further `mock.module` the body needs goes before that import too.
 */
export function describeWithDb(
  name: string,
  options: DbSuiteOptions,
  body: (suite: DbSuite) => void,
) {
  const made: string[] = [];
  const suite = {
    testUser: "",
    caller: "",
    getSession: mock.fn(async (): Promise<MockSession> =>
      suite.caller ? { user: { id: suite.caller } } : null,
    ),
    async makeUser(email: string, details?: TestUserDetails) {
      made.push(email);
      return makeTestUser(suite.db, suite.tables, email, details);
    },
  } as DbSuite;

  describe(name, { skip: !hasDb && "DATABASE_URL is not set" }, () => {
    before(async () => {
      mock.module("@/lib/require-session", { namedExports: { getSession: suite.getSession } });
      const { db, schema } = await import("@/db");
      suite.db = db;
      suite.tables = schema;
      if (options.email) {
        suite.testUser = await suite.makeUser(options.email);
        suite.caller = suite.testUser;
      }
    });

    body(suite);

    after(async () => {
      // `before` may have failed before the pool opened.
      if (!suite.db) return;
      for (const email of made.reverse()) await removeTestUser(suite.db, suite.tables, email);
      // Otherwise the process lingers until the pool's idle timeout.
      await suite.db.$client.end();
    });
  });
}

/** The two stories a suite about ownership needs, with a scene in each. */
export type StoryPair = {
  /** The other storyteller's id; a test user, removed with the suite. */
  otherUser: string;
  /** The test user's story and its scene. */
  mine: number;
  myScene: number;
  /** The other storyteller's story and its scene. */
  theirs: number;
  theirScene: number;
};

export type StoryPairOptions = {
  /** Starts both titles: "<label> — mine" and "<label> — theirs". */
  label: string;
  /** The other storyteller's @example.test address, and the name shown for them. */
  otherEmail: string;
  other?: TestUserDetails;
  mySceneTitle?: string;
  theirSceneTitle?: string;
};

/**
 * Makes a story the test user owns and one another storyteller owns, each
 * with one scene, which is what every suite that checks "only the storyteller
 * may" starts from. Fixture ids are positive and left to the database, so
 * they never collide with the seeds' negative ones. `removeStoryPair` takes
 * the stories away; the other storyteller goes with the suite's users.
 */
export async function makeStoryPair(suite: DbSuite, options: StoryPairOptions): Promise<StoryPair> {
  const { db, tables, testUser } = suite;
  const otherUser = await suite.makeUser(options.otherEmail, options.other);
  const [{ id: mine }, { id: theirs }] = await db
    .insert(tables.stories)
    .values([
      { title: `${options.label} — mine`, idCreatedByUser: testUser },
      { title: `${options.label} — theirs`, idCreatedByUser: otherUser },
    ])
    .returning({ id: tables.stories.idStory });
  const [{ id: myScene }, { id: theirScene }] = await db
    .insert(tables.storyScenes)
    .values([
      {
        idStory: mine,
        sceneTitle: options.mySceneTitle ?? "Fixture scene at the docks",
        idCreatedByUser: testUser,
      },
      {
        idStory: theirs,
        sceneTitle: options.theirSceneTitle ?? "Fixture scene of theirs",
        idCreatedByUser: otherUser,
      },
    ])
    .returning({ id: tables.storyScenes.idStoryScene });
  return { otherUser, mine, myScene, theirs, theirScene };
}

/**
 * Deletes the pair's stories; their scenes, sessions, elements and scene
 * elements go with them. Safe to call when `before` failed partway.
 */
export async function removeStoryPair(suite: DbSuite, pair: StoryPair | undefined) {
  if (!pair) return;
  const { db, tables } = suite;
  await db.delete(tables.stories).where(inArray(tables.stories.idStory, [pair.mine, pair.theirs]));
}
