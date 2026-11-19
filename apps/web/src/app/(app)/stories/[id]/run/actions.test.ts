// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The story's join link and who came in by it.
// The fixture is test/scene-fixtures.ts's: a story of the test user's with a
// scene and elements, and a story belonging to someone else; each test opens
// the session it needs and `beforeEach` clears them.
import { after, before, beforeEach, describe, it } from "node:test";
import { expect } from "expect";
import { and, eq } from "drizzle-orm";
import { describeWithDb, type Db, type Tables } from "@/test/db-suite";
import {
  type SceneFixture,
  makeSceneFixture,
  mockPublishing,
  publishMocks,
} from "@/test/scene-fixtures";
import { makeTestUser, removeTestUser } from "@/test/test-user";

const mocks = publishMocks();
const { published } = mocks;
const { publishTableCount } = mocks;
const LINK_GUEST_EMAIL = "join-links-link-guest@example.test";

let actions: typeof import("./actions");
let db: Db;
let tables: Tables;
let fx: SceneFixture;
let otherUserId = "";
let mine = 0;
let theirs = 0;

describeWithDb("join link actions", { email: "join-link-actions@example.test" }, (suite) => {
  before(async () => {
    mockPublishing(mocks);
    ({ db, tables } = suite);
    actions = await import("./actions");
    fx = await makeSceneFixture(suite, "Join link fixture");
    ({ mine, theirs, otherUser: otherUserId } = fx);
  });

  beforeEach(() => fx.clearSessions());

  after(async () => {
    if (!db) return;
    await removeTestUser(db, tables, LINK_GUEST_EMAIL);
    await fx.remove();
  });

  const openSession = (...args: Parameters<SceneFixture["openSession"]>) => fx.openSession(...args);

  describe("sa_getOrCreateJoinLink", () => {
    it("makes the story's code once, and keeps it", async () => {
      const first = await actions.sa_getOrCreateJoinLink(mine);
      expect(first?.code).toMatch(/^[A-Za-z0-9_-]{12}$/);
      // An unpaid storyteller by default, with no one in by the link yet.
      expect(first).toMatchObject({ joined: 0, cap: 3 });

      const again = await actions.sa_getOrCreateJoinLink(mine);
      expect(again?.code).toBe(first?.code);
    });

    it("counts only the seats the link gave out", async () => {
      await db
        .insert(tables.storyPlayers)
        .values([{ idStory: mine, idUser: otherUserId, isFromLink: true }]);
      try {
        expect((await actions.sa_getOrCreateJoinLink(mine))?.joined).toBe(1);
      } finally {
        await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, mine));
      }
    });

    it("gives nothing for someone else's story, and does not make it a code", async () => {
      expect(await actions.sa_getOrCreateJoinLink(theirs)).toBeNull();
      const [row] = await db
        .select({ code: tables.stories.joinCode })
        .from(tables.stories)
        .where(eq(tables.stories.idStory, theirs));
      expect(row.code).toBeNull();
    });
  });

  describe("who joined by the link", () => {
    // A guest of this file's and the other user, both seated at the story
    // by its link, the guest present at an open session and the other
    // waiting from before it.
    async function seatTwo(): Promise<{ guest: string; idStorySession: number }> {
      const guest = await makeTestUser(db, tables, LINK_GUEST_EMAIL);
      await db
        .update(tables.user)
        .set({ isAnonymous: true, nickName: "Sleepy Otter" })
        .where(eq(tables.user.id, guest));
      await db.insert(tables.storyPlayers).values([
        { idStory: mine, idUser: otherUserId, isFromLink: true },
        { idStory: mine, idUser: guest, isFromLink: true },
      ]);
      const idStorySession = await openSession(mine, null, "OPEN");
      await db.insert(tables.sessionPlayers).values([
        {
          idStory: mine,
          idStorySession,
          status: "PRESENT",
          idCreatedByUser: guest,
          idUpdatedByUser: guest,
        },
        { idStory: mine, idCreatedByUser: otherUserId, idUpdatedByUser: otherUserId },
      ]);
      return { guest, idStorySession };
    }

    async function cleanUp() {
      await db.delete(tables.sessionPlayers).where(eq(tables.sessionPlayers.idStory, mine));
      await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, mine));
      await removeTestUser(db, tables, LINK_GUEST_EMAIL);
    }

    it("counts the link's seats for the chip without making a code", async () => {
      await db
        .update(tables.stories)
        .set({ joinCode: null })
        .where(eq(tables.stories.idStory, mine));
      await seatTwo();
      try {
        expect(await actions.sa_getJoinCount(mine)).toEqual({ joined: 2, cap: 3 });
        expect(await actions.sa_getJoinCount(theirs)).toBeNull();
        const [row] = await db
          .select({ code: tables.stories.joinCode })
          .from(tables.stories)
          .where(eq(tables.stories.idStory, mine));
        expect(row.code).toBeNull();
      } finally {
        await cleanUp();
      }
    });

    it("lists who joined by the link, guest or not, and where each is", async () => {
      const { guest } = await seatTwo();
      try {
        const players = await actions.sa_listLinkPlayers(mine);
        expect(players).toEqual([
          { idUser: otherUserId, name: expect.any(String), isGuest: false, status: "WAITING" },
          { idUser: guest, name: "Sleepy Otter", isGuest: true, status: "PRESENT" },
        ]);
        expect(await actions.sa_listLinkPlayers(theirs)).toEqual([]);
      } finally {
        await cleanUp();
      }
    });

    it("deletes a guest the storyteller removes, and tells the table", async () => {
      const { guest } = await seatTwo();
      try {
        published.publishSceneChanged.mock.resetCalls();
        publishTableCount.mock.resetCalls();

        expect(await actions.sa_removeLinkPlayer(mine, guest)).toEqual({ ok: true });

        const left = await db
          .select({ id: tables.user.id })
          .from(tables.user)
          .where(eq(tables.user.id, guest));
        expect(left).toEqual([]);
        expect(published.publishSceneChanged.mock.calls[0].arguments).toEqual([mine]);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(publishTableCount.mock.calls[0]?.arguments[0]).toBe(mine);
      } finally {
        await cleanUp();
      }
    });

    it("takes an account's seat and presence, and leaves the account", async () => {
      await seatTwo();
      try {
        expect(await actions.sa_removeLinkPlayer(mine, otherUserId)).toEqual({ ok: true });

        const seats = await db
          .select({ id: tables.storyPlayers.idUser })
          .from(tables.storyPlayers)
          .where(
            and(eq(tables.storyPlayers.idStory, mine), eq(tables.storyPlayers.idUser, otherUserId)),
          );
        expect(seats).toEqual([]);
        const rows = await db
          .select({ id: tables.sessionPlayers.idSessionPlayer })
          .from(tables.sessionPlayers)
          .where(eq(tables.sessionPlayers.idCreatedByUser, otherUserId));
        expect(rows).toEqual([]);
        const [still] = await db
          .select({ id: tables.user.id })
          .from(tables.user)
          .where(eq(tables.user.id, otherUserId));
        expect(still).toEqual({ id: otherUserId });
      } finally {
        await cleanUp();
      }
    });

    it("refuses someone not seated by the link, and someone else's story", async () => {
      const { guest } = await seatTwo();
      try {
        await db
          .update(tables.storyPlayers)
          .set({ isFromLink: false })
          .where(eq(tables.storyPlayers.idUser, otherUserId));
        expect(await actions.sa_removeLinkPlayer(mine, otherUserId)).toMatchObject({ ok: false });
        expect(await actions.sa_removeLinkPlayer(theirs, guest)).toMatchObject({ ok: false });
        expect(await actions.sa_removeLinkPlayer(mine, "not-a-uuid")).toMatchObject({ ok: false });
      } finally {
        await cleanUp();
      }
    });
  });
});
