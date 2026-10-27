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
// Writing a scene up tells every table it changed, and notes on an element
// send the element again; mocked so the tests see them reached for, and so
// nothing publishes after the pool has closed.
const publishSceneChanged = mock.fn(async (_idStory: number) => {});
const publishElementChanged = mock.fn(async (_idStory: number, _idElement: number) => {});
const publishSceneElement = mock.fn(
  async (_idStory: number, _idStoryScene: number, _idElement: number) => {},
);

// The chat's lines go out over the broker after the action answers; run
// at once here, and caught, so the tests see what was sent.
const publishChat = mock.fn(async (_idStory: number, _chat: unknown, _type?: string) => {});
const publishLater = (work: () => Promise<void>) => void work();

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
    mock.module("@/lib/realtime/publish-scene", {
      namedExports: { publishSceneChanged, publishElementChanged, publishSceneElement },
    });
    mock.module("@/lib/realtime/publish", { namedExports: { publishChat, publishLater } });
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

  describe("sa_getPlayScene and sa_getStoryChannel", () => {
    let docks = 0;
    let zed = 0;
    let ghost = 0;
    const env = { ...process.env };

    before(async () => {
      [{ id: docks }] = await db
        .insert(tables.storyScenes)
        .values({
          idStory: playsIn,
          sceneTitle: "Play fixture docks",
          tags: ["scene", "elements"],
          idCreatedByUser: otherUserId,
        })
        .returning({ id: tables.storyScenes.idStoryScene });
      [{ id: zed }, { id: ghost }] = await db
        .insert(tables.elements)
        .values([
          {
            idStory: playsIn,
            kind: "PERSON",
            name: "Play fixture Zed",
            notes: "The villain",
            idCreatedByUser: otherUserId,
          },
          {
            idStory: playsIn,
            kind: "PERSON",
            name: "Play fixture ghost",
            idCreatedByUser: otherUserId,
          },
        ])
        .returning({ id: tables.elements.idElement });
      await db.insert(tables.sceneElements).values([
        { idStoryScene: docks, idElement: zed, tags: ["scene"], idCreatedByUser: otherUserId },
        {
          idStoryScene: docks,
          idElement: ghost,
          status: "INVISIBLE",
          idCreatedByUser: otherUserId,
        },
      ]);
    });

    beforeEach(() => {
      process.env.MQTT_ADDRESS = "broker.example.test";
      process.env.MQTT_PLAYER_USERNAME = "player";
      process.env.MQTT_PLAYER_PASSWORD = "pw";
      delete process.env.MQTT_WS_TLS_PORT;
    });

    after(() => {
      process.env = { ...env };
    });

    async function onScene(idStoryScene: number | null) {
      const id = await openSession(playsIn, "OPEN");
      await db
        .update(tables.storySessions)
        .set({ idStoryScene })
        .where(eq(tables.storySessions.idStorySession, id));
      return id;
    }

    it("lets a player write up the scene's description and notes, and no one else", async () => {
      publishSceneChanged.mock.resetCalls();
      const textOf = async () =>
        (
          await db
            .select({
              description: tables.storyScenes.sceneDescription,
              notes: tables.storyScenes.notes,
            })
            .from(tables.storyScenes)
            .where(eq(tables.storyScenes.idStoryScene, docks))
        )[0];

      // The seed user plays in the story.
      expect(
        await actions.sa_setPlaySceneText(playsIn, docks, {
          description: " Fog on the water. ",
          notes: "The ferryman was already dead.",
        }),
      ).toEqual({
        ok: true,
        text: { description: "Fog on the water.", notes: "The ferryman was already dead." },
      });
      expect(await textOf()).toEqual({
        description: "Fog on the water.",
        notes: "The ferryman was already dead.",
      });
      expect(publishSceneChanged.mock.calls.map((call) => call.arguments)).toEqual([[playsIn]]);

      expect(
        await actions.sa_setPlaySceneText(playsIn, docks, {
          description: "x".repeat(8001),
          notes: "",
        }),
      ).toEqual({
        ok: false,
        errors: { description: "Keep the description under 8000 characters." },
      });
      // A scene of a story the caller is not seated at, under either story's id.
      expect(
        await actions.sa_setPlaySceneText(stranger, docks, { description: "Mine", notes: "" }),
      ).toEqual({ ok: false, errors: { root: "You are not at this story's table." } });
      expect(await textOf()).toMatchObject({ description: "Fog on the water." });

      await db
        .update(tables.storyScenes)
        .set({ sceneDescription: null, notes: null })
        .where(eq(tables.storyScenes.idStoryScene, docks));
    });

    it("lets a player untap a tapped card whose info is showing, logging who did it", async () => {
      publishSceneElement.mock.resetCalls();
      const zedLink = and(
        eq(tables.sceneElements.idStoryScene, docks),
        eq(tables.sceneElements.idElement, zed),
      );
      const linkOf = async () =>
        (
          await db
            .select({ status: tables.sceneElements.status, log: tables.sceneElements.activityLog })
            .from(tables.sceneElements)
            .where(zedLink)
        )[0];
      type Entry = {
        activityCategory: string;
        userId: string | null;
        activityData: { previousStatus: string; status: string; userName?: string };
      };
      const notPlayed = { ok: false, error: "That scene is not being played." };

      try {
        // Nothing to untap until the scene is on, the card is tapped and its
        // info is showing.
        expect(await actions.sa_untapPlaySceneElement(playsIn, docks, zed)).toEqual(notPlayed);
        await onScene(docks);
        expect(await actions.sa_untapPlaySceneElement(playsIn, docks, zed)).toEqual({
          ok: false,
          error: "That element is not tapped.",
        });
        await db
          .update(tables.sceneElements)
          .set({ status: "TAPPED", showInfo: false })
          .where(zedLink);
        expect(await actions.sa_untapPlaySceneElement(playsIn, docks, zed)).toEqual({
          ok: false,
          error: "That element's info is not showing.",
        });
        await db.update(tables.sceneElements).set({ showInfo: true }).where(zedLink);
        const before = ((await linkOf()).log as Entry[]).length;

        expect(await actions.sa_untapPlaySceneElement(playsIn, docks, zed)).toEqual({
          ok: true,
          status: "READY",
        });
        const link = await linkOf();
        expect(link.status).toBe("READY");
        // The database logs the move itself; the player's untap adds who did it.
        const log = link.log as Entry[];
        expect(log.length).toBeGreaterThan(before);
        expect(log[log.length - 1]).toMatchObject({
          activityCategory: "untap_log",
          userId: SEED_USER,
          activityData: { previousStatus: "TAPPED", status: "READY" },
        });
        expect(typeof log[log.length - 1].activityData.userName).toBe("string");
        expect(publishSceneElement.mock.calls.map((call) => call.arguments)).toEqual([
          [playsIn, docks, zed],
        ]);
        // The table says so in the chat, as a line of its own.
        const [said] = await db
          .select()
          .from(tables.chats)
          .where(eq(tables.chats.idStory, playsIn))
          .orderBy(sql`id_chat desc`)
          .limit(1);
        expect(said).toMatchObject({
          idStoryScene: docks,
          isSystem: true,
          idCreatedByUser: SEED_USER,
        });
        expect(said.chatText).toMatch(/ untapped Play fixture Zed$/);

        // The hidden ghost cannot be seen, let alone untapped; a stranger
        // is turned away; a complete scene takes no change.
        await db
          .update(tables.sceneElements)
          .set({ status: "TAPPED", showInfo: true })
          .where(zedLink);
        expect(await actions.sa_untapPlaySceneElement(playsIn, docks, ghost)).toEqual({
          ok: false,
          error: "That element is not in this scene.",
        });
        expect(await actions.sa_untapPlaySceneElement(stranger, docks, zed)).toEqual({
          ok: false,
          error: "You are not at this story's table.",
        });
        await db
          .update(tables.storyScenes)
          .set({ status: "COMPLETE" })
          .where(eq(tables.storyScenes.idStoryScene, docks));
        expect(await actions.sa_untapPlaySceneElement(playsIn, docks, zed)).toEqual({
          ok: false,
          error: "That scene is complete, so nothing in it can change.",
        });
        expect((await linkOf()).status).toBe("TAPPED");
        expect(publishSceneElement.mock.callCount()).toBe(1);
      } finally {
        await db
          .update(tables.storyScenes)
          .set({ status: "ACTIVE" })
          .where(eq(tables.storyScenes.idStoryScene, docks));
        await db
          .update(tables.sceneElements)
          .set({ status: "READY", showInfo: true })
          .where(zedLink);
      }
    });

    it("gives a player the scene with the elements they may see, whole, their notes included", async () => {
      const session = await onScene(docks);
      const scene = await actions.sa_getPlayScene(playsIn);
      expect(scene).toMatchObject({
        idStorySession: session,
        scene: { idStoryScene: docks, title: "Play fixture docks" },
        tags: ["scene", "elements"],
      });
      expect(scene!.items.map((item) => item.element.name)).toEqual(["Play fixture Zed"]);
      expect(scene!.items[0].element.notes).toBe("The villain");
      expect(scene!.items[0].sceneElement).toMatchObject({ idStoryScene: docks, tags: ["scene"] });
    });

    it("lets a player keep notes on an element, logged with who wrote them, and no one else", async () => {
      publishElementChanged.mock.resetCalls();
      const stored = async () =>
        (
          await db
            .select({ notes: tables.elements.notes, log: tables.elements.activityLog })
            .from(tables.elements)
            .where(eq(tables.elements.idElement, zed))
        )[0];
      type Entry = {
        activityCategory: string;
        userId: string | null;
        activityData: { previousNotes: string | null; notes: string | null; userName?: string };
      };
      const before = ((await stored()).log as Entry[]).length;

      try {
        // A player writes only on an element they can see: with no scene
        // on, none; on the docks, Zed but not the hidden ghost.
        const unseen = { ok: false, error: "That element is not in this scene." };
        expect(await actions.sa_setPlayElementNotes(playsIn, zed, "Too soon")).toEqual(unseen);
        await onScene(docks);
        expect(await actions.sa_setPlayElementNotes(playsIn, ghost, "A ghost?")).toEqual(unseen);
        expect(((await stored()).log as Entry[]).length).toBe(before);

        // Trimmed, stored, logged against the element with the player's id
        // and name and the notes before and after, and sent to every table.
        expect(
          await actions.sa_setPlayElementNotes(playsIn, zed, "  Owes the harbourmaster. "),
        ).toEqual({ ok: true, notes: "Owes the harbourmaster." });
        let row = await stored();
        expect(row.notes).toBe("Owes the harbourmaster.");
        let log = row.log as Entry[];
        expect(log).toHaveLength(before + 1);
        expect(log[before]).toMatchObject({
          activityCategory: "notes_change_log",
          userId: SEED_USER,
          activityData: { previousNotes: "The villain", notes: "Owes the harbourmaster." },
        });
        expect(typeof log[before].activityData.userName).toBe("string");
        expect(publishElementChanged.mock.calls.map((call) => call.arguments)).toEqual([
          [playsIn, zed],
        ]);

        // The same notes again write nothing, log nothing and send nothing.
        expect(
          await actions.sa_setPlayElementNotes(playsIn, zed, "Owes the harbourmaster."),
        ).toEqual({ ok: true, notes: "Owes the harbourmaster." });
        expect(((await stored()).log as Entry[]).length).toBe(before + 1);
        expect(publishElementChanged.mock.callCount()).toBe(1);

        // Empty is null, as the column holds it, and that is a change too.
        expect(await actions.sa_setPlayElementNotes(playsIn, zed, " ")).toEqual({
          ok: true,
          notes: null,
        });
        row = await stored();
        expect(row.notes).toBeNull();
        log = row.log as Entry[];
        expect(log).toHaveLength(before + 2);
        expect(log[before + 1].activityData).toMatchObject({
          previousNotes: "Owes the harbourmaster.",
          notes: null,
        });

        expect(await actions.sa_setPlayElementNotes(playsIn, zed, "x".repeat(8001))).toEqual({
          ok: false,
          error: "Keep the notes under 8000 characters.",
        });
        // Not at the table, or an element of another story under this one's id.
        expect(await actions.sa_setPlayElementNotes(stranger, zed, "Mine now")).toEqual({
          ok: false,
          error: "You are not at this story's table.",
        });
        expect(await actions.sa_setPlayElementNotes(playsIn, 2 ** 20, "Nobody's")).toEqual({
          ok: false,
          error: "That element is not part of this story.",
        });
        expect(((await stored()).log as Entry[]).length).toBe(before + 2);

        // The storyteller sees every element, the hidden ghost included.
        caller = otherUserId;
        expect(await actions.sa_setPlayElementNotes(playsIn, ghost, "Drowned, 1842")).toEqual({
          ok: true,
          notes: "Drowned, 1842",
        });
      } finally {
        caller = SEED_USER;
        await db
          .update(tables.elements)
          .set({ notes: "The villain" })
          .where(eq(tables.elements.idElement, zed));
        await db
          .update(tables.elements)
          .set({ notes: null })
          .where(eq(tables.elements.idElement, ghost));
      }
    });

    it("keeps an element's description back while its link does not show its info", async () => {
      await onScene(docks);
      const zed = (await actions.sa_getPlayScene(playsIn))!.items[0].element.idElement;
      await db
        .update(tables.elements)
        .set({ description: "Keeps the docks." })
        .where(eq(tables.elements.idElement, zed));
      await db
        .update(tables.sceneElements)
        .set({ showInfo: false })
        .where(eq(tables.sceneElements.idElement, zed));
      try {
        const [item] = (await actions.sa_getPlayScene(playsIn))!.items;
        expect(item.element.description).toBeNull();
        expect(item.sceneElement.showInfo).toBe(false);
      } finally {
        await db
          .update(tables.sceneElements)
          .set({ showInfo: true })
          .where(eq(tables.sceneElements.idElement, zed));
      }
      expect((await actions.sa_getPlayScene(playsIn))!.items[0].element.description).toBe(
        "Keeps the docks.",
      );
    });

    it("is empty with no scene chosen, or nothing being played", async () => {
      const session = await onScene(null);
      expect(await actions.sa_getPlayScene(playsIn)).toEqual({
        idStorySession: session,
        scene: null,
        tags: [],
        coverUrl: null,
        items: [],
      });
      await db.delete(tables.storySessions).where(eq(tables.storySessions.idStory, playsIn));
      expect((await actions.sa_getPlayScene(playsIn))?.idStorySession).toBeNull();
    });

    describe("the table chat", () => {
      let cellar = 0;

      before(async () => {
        [{ id: cellar }] = await db
          .insert(tables.storyScenes)
          .values({
            idStory: playsIn,
            sceneTitle: "Play fixture cellar",
            idCreatedByUser: otherUserId,
          })
          .returning({ id: tables.storyScenes.idStoryScene });
      });

      beforeEach(async () => {
        publishChat.mock.resetCalls();
        await db.delete(tables.chats).where(eq(tables.chats.idStory, playsIn));
      });

      it("takes a line only from someone at the table while a session is played", async () => {
        expect(await actions.sa_postChat(playsIn, "Anyone?")).toEqual({
          ok: false,
          error: "The story is not being played, so there is no table to talk at.",
        });
        await onScene(docks);
        expect(await actions.sa_postChat(stranger, "Hello")).toEqual({
          ok: false,
          error: "You are not at this story's table.",
        });
        expect(await actions.sa_postChat(playsIn, "   ")).toEqual({
          ok: false,
          error: "Say something first.",
        });
        expect(
          await db.select().from(tables.chats).where(eq(tables.chats.idStory, playsIn)),
        ).toEqual([]);
        expect(publishChat.mock.callCount()).toBe(0);
      });

      it("saves a line against the scene being played, as said by the caller, and sends it", async () => {
        await onScene(docks);
        const result = await actions.sa_postChat(playsIn, "  Fog again. ");
        expect(result).toMatchObject({
          ok: true,
          chat: {
            idStoryScene: docks,
            idUser: SEED_USER,
            text: "Fog again.",
            isSystem: false,
            isEdited: false,
          },
        });
        if (!result.ok) return;
        // A player is named as themselves; the storyteller as Storyteller.
        expect(result.chat.from).not.toBe("Storyteller");
        expect(publishChat.mock.calls[0].arguments).toEqual([playsIn, result.chat]);

        caller = otherUserId;
        const told = await actions.sa_postChat(playsIn, "The ferry is late.");
        expect(told).toMatchObject({
          ok: true,
          chat: { from: "Storyteller", idUser: otherUserId },
        });
      });

      it("draws a line in the sender's profile colour and picture, where they chose them", async () => {
        await db.insert(tables.userPreferences).values({
          idUser: secondPlayerId,
          preferences: {
            "profile.color": "#46A758",
            "profile.avatarUrl": "https://example.test/second.png",
          },
          idCreatedByUser: secondPlayerId,
          idUpdatedByUser: secondPlayerId,
        });
        try {
          await onScene(docks);
          caller = secondPlayerId;
          expect(await actions.sa_postChat(playsIn, "Over here.")).toMatchObject({
            ok: true,
            chat: { color: "#46A758", picture: "https://example.test/second.png" },
          });
          // No preferences and no provider picture: the chat's own fallbacks.
          caller = otherUserId;
          expect(await actions.sa_postChat(playsIn, "Noted.")).toMatchObject({
            ok: true,
            chat: { color: null, picture: null },
          });
        } finally {
          await db
            .delete(tables.userPreferences)
            .where(eq(tables.userPreferences.idUser, secondPlayerId));
        }
      });

      it("opens on the scene being played, or on no scene since the session opened", async () => {
        const session = await onScene(docks);
        await actions.sa_postChat(playsIn, "At the docks");
        await db
          .update(tables.storySessions)
          .set({ idStoryScene: cellar })
          .where(eq(tables.storySessions.idStorySession, session));
        await actions.sa_postChat(playsIn, "In the cellar");
        // An old no-scene line from before this session opened stays out.
        await db.insert(tables.chats).values({
          idStory: playsIn,
          chatText: "Long ago",
          idCreatedByUser: SEED_USER,
          createdAt: new Date("2020-01-01T00:00:00Z"),
        });

        const texts = async () =>
          (await actions.sa_listChats(playsIn)).chats.map((chat) => chat.text);
        expect(await texts()).toEqual(["In the cellar"]);

        await db
          .update(tables.storySessions)
          .set({ idStoryScene: null })
          .where(eq(tables.storySessions.idStorySession, session));
        await actions.sa_postChat(playsIn, "Between scenes");
        expect(await texts()).toEqual(["Between scenes"]);

        expect(await actions.sa_listChats(stranger)).toEqual({ chats: [], hasPrevious: false });
      });

      it("opens on the last hundred lines and pages back through the rest", async () => {
        await onScene(docks);
        // 205 lines a second apart, so their order is plain.
        const start = Date.UTC(2026, 0, 1);
        await db.insert(tables.chats).values(
          Array.from({ length: 205 }, (_, i) => ({
            idStory: playsIn,
            idStoryScene: docks,
            chatText: `Line ${i}`,
            idCreatedByUser: SEED_USER,
            createdAt: new Date(start + i * 1000),
          })),
        );

        const first = await actions.sa_listChats(playsIn);
        expect(first.chats).toHaveLength(100);
        expect(first.chats[0].text).toBe("Line 105");
        expect(first.chats[99].text).toBe("Line 204");
        expect(first.hasPrevious).toBe(true);

        const second = await actions.sa_listChats(playsIn, first.chats[0].idChat);
        expect(second.chats[0].text).toBe("Line 5");
        expect(second.chats[99].text).toBe("Line 104");
        expect(second.hasPrevious).toBe(true);

        const third = await actions.sa_listChats(playsIn, second.chats[0].idChat);
        expect(third.chats.map((chat) => chat.text)).toEqual([
          "Line 0",
          "Line 1",
          "Line 2",
          "Line 3",
          "Line 4",
        ]);
        expect(third.hasPrevious).toBe(false);
      });

      it("lets the sender alone rewrite a line of theirs, marking it edited", async () => {
        await onScene(docks);
        const said = await actions.sa_postChat(playsIn, "Fog");
        if (!said.ok) throw new Error(said.error);
        const id = said.chat.idChat;
        publishChat.mock.resetCalls();

        // The same text again is no edit.
        expect(await actions.sa_editChat(playsIn, id, " Fog ")).toMatchObject({
          ok: true,
          chat: { text: "Fog", isEdited: false },
        });
        expect(publishChat.mock.callCount()).toBe(0);

        const edited = await actions.sa_editChat(playsIn, id, "Thick fog");
        expect(edited).toMatchObject({ ok: true, chat: { text: "Thick fog", isEdited: true } });
        expect(publishChat.mock.calls[0].arguments.slice(2)).toEqual(["chat.edited"]);

        const notYours = { ok: false, error: "That is not a line of yours." };
        caller = secondPlayerId;
        expect(await actions.sa_editChat(playsIn, id, "Mine now")).toEqual(notYours);
        caller = SEED_USER;
        const [system] = await db
          .insert(tables.chats)
          .values({
            idStory: playsIn,
            chatText: "Entering Play fixture docks",
            isSystem: true,
            idCreatedByUser: SEED_USER,
          })
          .returning({ id: tables.chats.idChat });
        expect(await actions.sa_editChat(playsIn, system.id, "Leaving")).toEqual(notYours);
        expect(await actions.sa_editChat(stranger, id, "Elsewhere")).toEqual({
          ok: false,
          error: "You are not at this story's table.",
        });
        expect(publishChat.mock.callCount()).toBe(1);
      });
    });

    it("gives a stranger nothing", async () => {
      await onScene(docks);
      expect(await actions.sa_getPlayScene(stranger)).toBeNull();
      expect(await actions.sa_getStoryChannel(stranger)).toBeNull();
    });

    it("hands a player the broker's address and the player login", async () => {
      expect(await actions.sa_getStoryChannel(playsIn)).toEqual({
        url: "wss://broker.example.test:8084/mqtt",
        username: "player",
        password: "pw",
        topic: `story/${playsIn}/state`,
        chatTopic: `story/${playsIn}/chat`,
      });
    });

    it("says there is no channel when the broker is not configured", async () => {
      delete process.env.MQTT_PLAYER_PASSWORD;
      expect(await actions.sa_getStoryChannel(playsIn)).toBeNull();
    });
  });
});
