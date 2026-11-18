// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The run table's control of the session at the table: its title and the inactivity check.
// The fixture is test/scene-fixtures.ts's: a story of the test user's with a
// scene and elements, and a story belonging to someone else; each test opens
// the session it needs and `beforeEach` clears them.
import { after, before, beforeEach, it } from "node:test";
import { expect } from "expect";
import { eq } from "drizzle-orm";
import { describeWithDb, type Db, type Tables } from "@/test/db-suite";
import {
  type SceneFixture,
  makeSceneFixture,
  mockPublishing,
  publishMocks,
} from "@/test/scene-fixtures";

const mocks = publishMocks();
const { published } = mocks;

let actions: typeof import("./actions");
let db: Db;
let tables: Tables;
let fx: SceneFixture;
let testUser = "";
let mine = 0;
let theirs = 0;

describeWithDb(
  "session control actions",
  { email: "session-control-actions@example.test" },
  (suite) => {
    before(async () => {
      mockPublishing(mocks);
      ({ db, tables } = suite);
      testUser = suite.testUser;
      actions = await import("./actions");
      fx = await makeSceneFixture(suite, "Session control fixture");
      ({ mine, theirs } = fx);
    });

    beforeEach(() => fx.clearSessions());

    after(async () => {
      if (!db) return;
      await fx.remove();
    });

    const openSession = (...args: Parameters<SceneFixture["openSession"]>) =>
      fx.openSession(...args);

    it("renames a session of the story, clearing an empty title", async () => {
      const session = await openSession(mine, null);
      const titleOf = async () =>
        (
          await db
            .select({ title: tables.storySessions.title })
            .from(tables.storySessions)
            .where(eq(tables.storySessions.idStorySession, session))
        )[0].title;

      expect(await actions.sa_setSessionTitle(mine, session, "  The drowned bell ")).toEqual({
        ok: true,
        title: "The drowned bell",
      });
      expect(await titleOf()).toBe("The drowned bell");
      expect(await actions.sa_setSessionTitle(mine, session, "   ")).toEqual({
        ok: true,
        title: null,
      });
      expect(await titleOf()).toBeNull();

      expect(await actions.sa_setSessionTitle(mine, session, "x".repeat(201))).toEqual({
        ok: false,
        error: "Keep the title under 200 characters.",
      });
      // Another's story, or a session of a story other than the one named.
      expect(await actions.sa_setSessionTitle(theirs, session, "Mine now")).toEqual({
        ok: false,
        error: "That session is not part of this story.",
      });
      expect(await titleOf()).toBeNull();
    });

    it("suspends a session left inactive, noting why in its activity_log", async () => {
      const session = await openSession(mine, null);
      published.publishSceneChanged.mock.resetCalls();

      expect(await actions.sa_suspendInactiveSession(mine, session, false)).toEqual({
        ok: true,
        status: "SUSPENDED",
      });
      const [row] = await db
        .select({ status: tables.storySessions.status, log: tables.storySessions.activityLog })
        .from(tables.storySessions)
        .where(eq(tables.storySessions.idStorySession, session));
      expect(row.status).toBe("SUSPENDED");
      const entry = (row.log as Record<string, unknown>[]).find(
        (e) => e.activityCategory === "inactivity_log",
      );
      expect(entry).toMatchObject({
        activityDetails: "suspended for inactivity",
        userId: testUser,
        activityData: { answered: false },
      });
      expect(published.publishSceneChanged.mock.calls.map((c) => c.arguments)).toEqual([[mine]]);

      // Already suspended: nothing moves again.
      expect(await actions.sa_suspendInactiveSession(mine, session, true)).toEqual({
        ok: false,
        error: "That session is not being played.",
      });
    });

    it("suspends no session of another's story, nor one that is not being played", async () => {
      const theirSession = await openSession(theirs, null);
      expect(await actions.sa_suspendInactiveSession(theirs, theirSession, false)).toEqual({
        ok: false,
        error: "That session is not being played.",
      });
      const done = await openSession(mine, null, "DONE");
      expect(await actions.sa_suspendInactiveSession(mine, done, false)).toEqual({
        ok: false,
        error: "That session is not being played.",
      });
    });

    it("refuses an answer that is not yes or no, leaving the session playing", async () => {
      const session = await openSession(mine, null);
      expect(
        await actions.sa_suspendInactiveSession(mine, session, "yes" as unknown as boolean),
      ).toEqual({ ok: false, error: "Whether the storyteller answered must be yes or no." });
      const [row] = await db
        .select({ status: tables.storySessions.status })
        .from(tables.storySessions)
        .where(eq(tables.storySessions.idStorySession, session));
      expect(row.status).toBe("OPEN");
    });
  },
);
