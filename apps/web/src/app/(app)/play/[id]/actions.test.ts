// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` inserts a second user and
// the stories each branch needs: one the second user tells and the seed user
// plays in, one the seed user owns but switched off, one they own but
// archived, and a stranger's. Fixture ids are positive and left to the
// database default, so they never collide with the seed's negative ids.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { and, eq, inArray, sql } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

// Who the actions think is asking; each test that changes it sets it back.
let caller = SEED_USER;
const getSession = mock.fn(async () => ({ user: { id: caller } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let otherUserId = "";
let secondPlayerId = "";
let playsIn = 0;
let ownsInactive = 0;
let ownsArchived = 0;
let stranger = 0;
let fixtureStoryIds: number[] = [];

describe("play table actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    // A rerun after a crash would trip the unique email.
    await db
      .delete(tables.user)
      .where(
        inArray(tables.user.email, [
          "play-table-fixture@example.test",
          "play-table-fixture-2@example.test",
        ]),
      );

    const [otherUser] = await db
      .insert(tables.user)
      .values({ name: "Play Table Fixture", email: "play-table-fixture@example.test" })
      .returning({ id: tables.user.id });
    otherUserId = otherUser.id;

    const [secondPlayer] = await db
      .insert(tables.user)
      .values({ name: "Play Table Fixture Two", email: "play-table-fixture-2@example.test" })
      .returning({ id: tables.user.id });
    secondPlayerId = secondPlayer.id;

    const inserted = await db
      .insert(tables.stories)
      .values([
        { title: "Play table fixture — plays in", idCreatedByUser: otherUserId },
        { title: "Play table fixture — inactive", idCreatedByUser: SEED_USER, isActive: false },
        { title: "Play table fixture — archived", idCreatedByUser: SEED_USER, isArchived: true },
        { title: "Play table fixture — stranger", idCreatedByUser: otherUserId },
      ])
      .returning({ idStory: tables.stories.idStory });
    [playsIn, ownsInactive, ownsArchived, stranger] = inserted.map((row) => row.idStory);
    fixtureStoryIds = inserted.map((row) => row.idStory);

    await db.insert(tables.storyPlayers).values([
      { idStory: playsIn, idUser: SEED_USER },
      { idStory: playsIn, idUser: secondPlayerId },
    ]);
  });

  beforeEach(async () => {
    caller = SEED_USER;
    // Deleting the sessions clears the story's pointer (ON DELETE SET NULL)
    // and their session_players rows (CASCADE); waiting rows have no
    // session, so they go by story.
    await db
      .delete(tables.sessionPlayers)
      .where(inArray(tables.sessionPlayers.idStory, fixtureStoryIds));
    await db.delete(tables.storySessions).where(eq(tables.storySessions.idStory, playsIn));
  });

  after(async () => {
    if (!db) return;
    if (fixtureStoryIds.length) {
      // session_players and story_sessions cascade with their story;
      // story_players does not.
      await db
        .delete(tables.storyPlayers)
        .where(inArray(tables.storyPlayers.idStory, fixtureStoryIds));
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, fixtureStoryIds));
    }
    if (otherUserId) await db.delete(tables.user).where(eq(tables.user.id, otherUserId));
    if (secondPlayerId) await db.delete(tables.user).where(eq(tables.user.id, secondPlayerId));
    await db.$client.end();
  });

  async function openSession(idStory: number, status: string): Promise<number> {
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory, idCreatedByUser: otherUserId, status })
      .returning({ id: tables.storySessions.idStorySession });
    await db
      .update(tables.stories)
      .set({ idStorySession: session.id })
      .where(eq(tables.stories.idStory, idStory));
    return session.id;
  }

  // The seed user's rows at the played-in story, oldest first.
  async function myRows() {
    return db
      .select({
        idStorySession: tables.sessionPlayers.idStorySession,
        status: tables.sessionPlayers.status,
        waitingAt: tables.sessionPlayers.waitingAt,
      })
      .from(tables.sessionPlayers)
      .where(
        and(
          eq(tables.sessionPlayers.idStory, playsIn),
          eq(tables.sessionPlayers.idCreatedByUser, SEED_USER),
        ),
      )
      .orderBy(tables.sessionPlayers.idSessionPlayer);
  }

  describe("sa_getPlayStory", () => {
    it("gives a player the story, not as its owner", async () => {
      const story = await actions.sa_getPlayStory(playsIn);
      expect(story).toMatchObject({
        idStory: playsIn,
        isOwner: false,
        isActive: true,
        isArchived: false,
        hasOpenSession: false,
      });
    });

    it("gives the storyteller their own story with its flags", async () => {
      expect(await actions.sa_getPlayStory(ownsInactive)).toMatchObject({
        isOwner: true,
        isActive: false,
      });
      expect(await actions.sa_getPlayStory(ownsArchived)).toMatchObject({
        isOwner: true,
        isArchived: true,
      });
    });

    it("gives a stranger and a bad id the same nothing", async () => {
      expect(await actions.sa_getPlayStory(stranger)).toBeNull();
      expect(await actions.sa_getPlayStory(2 ** 40)).toBeNull();
    });

    it("counts an OPEN or RESUMED current session as under way, and a SUSPENDED one not", async () => {
      await openSession(playsIn, "OPEN");
      expect((await actions.sa_getPlayStory(playsIn))?.hasOpenSession).toBe(true);

      await db
        .update(tables.storySessions)
        .set({ status: "SUSPENDED" })
        .where(eq(tables.storySessions.idStory, playsIn));
      expect((await actions.sa_getPlayStory(playsIn))?.hasOpenSession).toBe(false);
    });
  });

  describe("sa_activateStory", () => {
    it("switches the caller's own story back on", async () => {
      expect(await actions.sa_activateStory(ownsInactive)).toEqual({ ok: true });
      const [row] = await db
        .select({ isActive: tables.stories.isActive })
        .from(tables.stories)
        .where(eq(tables.stories.idStory, ownsInactive));
      expect(row.isActive).toBe(true);
      await db
        .update(tables.stories)
        .set({ isActive: false })
        .where(eq(tables.stories.idStory, ownsInactive));
    });

    it("refuses a story the caller only plays in", async () => {
      await db
        .update(tables.stories)
        .set({ isActive: false })
        .where(eq(tables.stories.idStory, playsIn));
      const result = await actions.sa_activateStory(playsIn);
      await db
        .update(tables.stories)
        .set({ isActive: true })
        .where(eq(tables.stories.idStory, playsIn));
      expect(result.ok).toBe(false);
    });
  });

  describe("sa_waitForSession", () => {
    it("puts a player in the room as WAITING and counts them", async () => {
      const state = await actions.sa_waitForSession(playsIn);
      expect(state).toMatchObject({
        waitingCount: 1,
        hasOpenSession: false,
        isUnplayable: false,
      });
      expect(Date.now() - state!.waitingSince.getTime()).toBeLessThan(60_000);
      expect(await myRows()).toEqual([
        { idStorySession: null, status: "WAITING", waitingAt: expect.any(Date) },
      ]);
    });

    it("keeps the clock running across heartbeats", async () => {
      const first = await actions.sa_waitForSession(playsIn);
      const second = await actions.sa_waitForSession(playsIn);
      expect(second!.waitingSince.getTime()).toBe(first!.waitingSince.getTime());
      expect(await myRows()).toHaveLength(1);
    });

    it("leaves a quiet row WAITING but uncounted, and restarts its clock when it comes back", async () => {
      await actions.sa_waitForSession(playsIn);
      // An explicit updated_at survives set_updated_at, which only stamps
      // one when the update leaves it alone.
      await db
        .update(tables.sessionPlayers)
        .set({
          waitingAt: sql`now() - interval '2 hours'`,
          updatedAt: sql`now() - interval '1 hour'`,
        })
        .where(eq(tables.sessionPlayers.idStory, playsIn));

      // A second player's beat counts only themselves, and moves nobody.
      caller = secondPlayerId;
      expect((await actions.sa_waitForSession(playsIn))?.waitingCount).toBe(1);
      expect((await myRows())[0].status).toBe("WAITING");

      caller = SEED_USER;
      const back = await actions.sa_waitForSession(playsIn);
      expect(Date.now() - back!.waitingSince.getTime()).toBeLessThan(60_000);
      expect(back!.waitingCount).toBe(2);
    });

    it("hears when a session opens, without making a row", async () => {
      await openSession(playsIn, "RESUMED");
      expect((await actions.sa_waitForSession(playsIn))?.hasOpenSession).toBe(true);
      expect(await myRows()).toHaveLength(0);
    });

    it("turns away a stranger without a row", async () => {
      expect(await actions.sa_waitForSession(stranger)).toBeNull();
      const rows = await db
        .select()
        .from(tables.sessionPlayers)
        .where(eq(tables.sessionPlayers.idStory, stranger));
      expect(rows).toHaveLength(0);
    });
  });

  describe("sa_leaveWaitingRoom", () => {
    it("deletes the caller's waiting row, and a return starts a new one", async () => {
      await actions.sa_waitForSession(playsIn);
      await actions.sa_leaveWaitingRoom(playsIn);
      expect(await myRows()).toEqual([]);

      await actions.sa_waitForSession(playsIn);
      expect(await myRows()).toEqual([
        expect.objectContaining({ idStorySession: null, status: "WAITING" }),
      ]);
    });

    it("leaves a row already attached to a session alone", async () => {
      await openSession(playsIn, "OPEN");
      await actions.sa_joinSession(playsIn);
      await actions.sa_leaveWaitingRoom(playsIn);
      expect(await myRows()).toEqual([expect.objectContaining({ status: "PRESENT" })]);
    });
  });

  describe("sa_joinSession", () => {
    it("attaches the waiting row to the open session as PRESENT", async () => {
      await actions.sa_waitForSession(playsIn);
      const idSession = await openSession(playsIn, "OPEN");

      await actions.sa_joinSession(playsIn);

      expect(await myRows()).toEqual([
        { idStorySession: idSession, status: "PRESENT", waitingAt: expect.any(Date) },
      ]);
    });

    it("seats a player who came straight to the table", async () => {
      const idSession = await openSession(playsIn, "OPEN");
      await actions.sa_joinSession(playsIn);
      await actions.sa_joinSession(playsIn);

      expect(await myRows()).toEqual([
        { idStorySession: idSession, status: "PRESENT", waitingAt: null },
      ]);
    });

    it("brings a returning player back on their session row and closes the waiting one", async () => {
      const idSession = await openSession(playsIn, "OPEN");
      await actions.sa_joinSession(playsIn);
      await db
        .update(tables.sessionPlayers)
        .set({ status: "AWAY" })
        .where(eq(tables.sessionPlayers.idStorySession, idSession));
      // They waited again while the session was paused.
      await db
        .update(tables.storySessions)
        .set({ status: "SUSPENDED" })
        .where(eq(tables.storySessions.idStorySession, idSession));
      await actions.sa_waitForSession(playsIn);
      await db
        .update(tables.storySessions)
        .set({ status: "RESUMED" })
        .where(eq(tables.storySessions.idStorySession, idSession));

      await actions.sa_joinSession(playsIn);

      expect(await myRows()).toEqual([
        expect.objectContaining({ idStorySession: idSession, status: "PRESENT" }),
        expect.objectContaining({ idStorySession: null, status: "LEFT" }),
      ]);
    });

    it("does nothing while no session is being played, or for the storyteller", async () => {
      await actions.sa_joinSession(playsIn);
      caller = otherUserId;
      await openSession(playsIn, "OPEN");
      await actions.sa_joinSession(playsIn);

      const rows = await db
        .select()
        .from(tables.sessionPlayers)
        .where(eq(tables.sessionPlayers.idStory, playsIn));
      expect(rows).toHaveLength(0);
    });
  });
});
