// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes a story a second
// user tells and the test user plays in, with a done sitting, an open one and
// an unplayed scene; a public story the test user has no seat in; and a
// stranger's private story.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

// Signed in as a test user of its own, never a real account (test-user.ts).
const TEST_USER_EMAIL = "storyboard-actions@example.test";
let testUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

let caller = "";
const getSession = mock.fn(async () => ({ user: { id: caller } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let tellerId = "";
let playsIn = 0;
let openBook = 0;
let strangers = 0;
let doneSitting = 0;
let openSitting = 0;
let publicSitting = 0;
const earlierSittings: number[] = [];
const backlog: number[] = [];
let abbey = 0;
let docks = 0;
let wharf = 0;
let ford = 0;
let crossing = 0;
let chapel = 0;
let zed = 0;
let lantern = 0;
const pictures: number[] = [];

describe("storyboard actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    caller = testUser;
    actions = await import("./actions");

    await db.delete(tables.user).where(eq(tables.user.email, "storyboard-fixture@example.test"));
    const [teller] = await db
      .insert(tables.user)
      .values({ name: "Storyboard Fixture", email: "storyboard-fixture@example.test" })
      .returning({ id: tables.user.id });
    tellerId = teller.id;

    [{ id: playsIn }, { id: openBook }, { id: strangers }] = await db
      .insert(tables.stories)
      .values([
        { title: "Storyboard fixture — plays in", idCreatedByUser: tellerId },
        { title: "Storyboard fixture — open book", isPublic: true, idCreatedByUser: tellerId },
        { title: "Storyboard fixture — strangers", idCreatedByUser: tellerId },
      ])
      .returning({ id: tables.stories.idStory });
    await db.insert(tables.storyPlayers).values({ idStory: playsIn, idUser: testUser });

    // Three done sittings of the story played in before the two below,
    // with nothing in them, so the board has more sittings than a page:
    // one statement, so they share a number and the id orders them.
    for (const { id } of await db
      .insert(tables.storySessions)
      .values(
        ["Alnwick", "Bamburgh", "Jarrow"].map((title) => ({
          idStory: playsIn,
          status: "DONE",
          title,
          idCreatedByUser: tellerId,
        })),
      )
      .returning({ id: tables.storySessions.idStorySession })) {
      earlierSittings.push(id);
    }

    // Two sittings of the story played in, opened in this order: Kildealg is
    // done, Lindisfarne still open. The public story has one done sitting.
    [{ id: doneSitting }, { id: openSitting }, { id: publicSitting }] = await db
      .insert(tables.storySessions)
      .values([
        {
          idStory: playsIn,
          status: "DONE",
          title: "Kildealg",
          summary: "The company reached the abbey.",
          notes: "Zed owes us a favour.",
          lingeringQuestions: "Who lit the beacon?",
          idCreatedByUser: tellerId,
        },
        { idStory: playsIn, status: "OPEN", title: "Lindisfarne", idCreatedByUser: tellerId },
        {
          idStory: openBook,
          status: "DONE",
          summary: "A chapel in the hills.",
          notes: "The table's own.",
          lingeringQuestions: "Whose chapel?",
          idCreatedByUser: tellerId,
        },
      ])
      .returning({ id: tables.storySessions.idStorySession });

    // In Kildealg the abbey was finished before the docks, and the wharf was
    // attached but never run. The ford is Lindisfarne's one scene; the
    // crossing is in no sitting yet. Inserted in no particular order, so the
    // ids say nothing about the order expected.
    [{ id: crossing }, { id: docks }, { id: ford }, { id: wharf }, { id: abbey }, { id: chapel }] =
      await db
        .insert(tables.storyScenes)
        .values([
          { idStory: playsIn, sceneTitle: "Fixture crossing", idCreatedByUser: tellerId },
          {
            idStory: playsIn,
            sceneTitle: "Fixture docks",
            sceneDescription: "Fog on the water.",
            notes: "Bring the lantern.",
            tags: ["scene", "elements"],
            status: "COMPLETE",
            idStorySession: doneSitting,
            activeAt: new Date("2026-10-10T00:00:00Z"),
            idCreatedByUser: tellerId,
          },
          {
            idStory: playsIn,
            sceneTitle: "Fixture ford",
            status: "COMPLETE",
            idStorySession: openSitting,
            activeAt: new Date("2026-10-12T00:00:00Z"),
            idCreatedByUser: tellerId,
          },
          {
            idStory: playsIn,
            sceneTitle: "Fixture wharf",
            idStorySession: doneSitting,
            idCreatedByUser: tellerId,
          },
          {
            idStory: playsIn,
            sceneTitle: "Fixture abbey",
            status: "COMPLETE",
            idStorySession: doneSitting,
            activeAt: new Date("2026-10-05T00:00:00Z"),
            idCreatedByUser: tellerId,
          },
          {
            idStory: openBook,
            sceneTitle: "Fixture chapel",
            sceneDescription: "A chapel in the hills.",
            notes: "The table's own.",
            status: "COMPLETE",
            idStorySession: publicSitting,
            activeAt: new Date("2026-10-06T00:00:00Z"),
            idCreatedByUser: tellerId,
          },
        ])
        .returning({ id: tables.storyScenes.idStoryScene });
    // When each was finished, which numbers the scenes within a sitting. Set
    // after the insert: the workflow stamps complete_at itself as a row
    // arrives in COMPLETE, which would make them all one moment.
    for (const [id, day] of [
      [abbey, "2026-10-05"],
      [docks, "2026-10-10"],
      [ford, "2026-10-12"],
      [chapel, "2026-10-06"],
    ] as const) {
      await db
        .update(tables.storyScenes)
        .set({ completeAt: new Date(`${day}T02:00:00Z`) })
        .where(eq(tables.storyScenes.idStoryScene, id));
    }

    // The docks have two pictures and no cover: the card shows the first in
    // the storyteller's order, which sort_order sets and the id does not.
    const made = await db
      .insert(tables.attachments)
      .values([
        { idStory: playsIn, status: "READY", url: "https://x.test/second.png" },
        { idStory: playsIn, status: "READY", url: "https://x.test/first.png" },
      ])
      .returning({ id: tables.attachments.idAttachment });
    pictures.push(...made.map((row) => row.id));
    await db.insert(tables.attachmentUses).values([
      {
        idAttachment: made[0].id,
        kind: "STORY_SCENE",
        idExternal: docks,
        sortOrder: 2000,
        idCreatedByUser: tellerId,
      },
      {
        idAttachment: made[1].id,
        kind: "STORY_SCENE",
        idExternal: docks,
        sortOrder: 1000,
        idCreatedByUser: tellerId,
      },
    ]);

    [{ id: zed }, { id: lantern }] = await db
      .insert(tables.elements)
      .values([
        {
          idStory: playsIn,
          kind: "PERSON",
          name: "Fixture Zed",
          initialName: "Fixture hooded figure",
          description: "Keeps the docks.",
          idCreatedByUser: tellerId,
        },
        { idStory: playsIn, kind: "THING", name: "Fixture Lantern", idCreatedByUser: tellerId },
      ])
      .returning({ id: tables.elements.idElement });
    await db.insert(tables.sceneElements).values([
      { idStoryScene: docks, idElement: zed, tags: ["scene"], idCreatedByUser: tellerId },
      {
        idStoryScene: docks,
        idElement: lantern,
        status: "INVISIBLE",
        showInfo: false,
        idCreatedByUser: tellerId,
      },
    ]);
  });

  before(async () => {
    if (!db) return;
    // Eleven more scenes in no sitting, after the crossing, so the
    // storyteller's backlog has more than a page.
    for (const { id } of await db
      .insert(tables.storyScenes)
      .values(
        Array.from({ length: 11 }, (_, i) => ({
          idStory: playsIn,
          sceneTitle: `Fixture backlog ${String(i + 1).padStart(2, "0")}`,
          idCreatedByUser: tellerId,
        })),
      )
      .returning({ id: tables.storyScenes.idStoryScene })) {
      backlog.push(id);
    }
  });

  beforeEach(() => {
    caller = testUser;
  });

  after(async () => {
    if (!db) return;
    const storyIds = [playsIn, openBook, strangers].filter(Boolean);
    if (storyIds.length > 0) {
      if (pictures.length > 0) {
        await db
          .delete(tables.attachments)
          .where(inArray(tables.attachments.idAttachment, pictures));
      }
      await db.delete(tables.storyPlayers).where(inArray(tables.storyPlayers.idStory, storyIds));
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, storyIds));
    }
    if (tellerId) await db.delete(tables.user).where(eq(tables.user.id, tellerId));
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  describe("sa_getStoryboard", () => {
    it("shows a player the done sittings only, each with its completed scenes in play order, and no unplayed grid", async () => {
      const board = await actions.sa_getStoryboard(playsIn);
      expect(board).toMatchObject({
        idStory: playsIn,
        title: "Storyboard fixture — plays in",
        isStoryteller: false,
        unplayed: [],
      });
      // The latest three of the four done sittings, oldest first.
      expect(board?.sessions.map((session) => session.title)).toEqual([
        "Bamburgh",
        "Jarrow",
        "Kildealg",
      ]);
      expect(board?.moreSessions).toBe(true);
      expect(board?.moreUnplayed).toBe(false);
      const kildealg = board!.sessions[2];
      expect(kildealg).toMatchObject({
        idStorySession: doneSitting,
        summary: "The company reached the abbey.",
        notes: "Zed owes us a favour.",
        lingeringQuestions: "Who lit the beacon?",
      });
      expect(kildealg.scenes.map((scene) => scene.title)).toEqual([
        "Fixture abbey",
        "Fixture docks",
      ]);
      expect(kildealg.scenes[1]).toMatchObject({
        idStoryScene: docks,
        description: "Fog on the water.",
        notes: "Bring the lantern.",
        status: "COMPLETE",
        sceneNumber: 2,
      });
    });

    it("shows a scene's cover, else the first of its pictures in the storyteller's order", async () => {
      const board = await actions.sa_getStoryboard(playsIn);
      const scenes = board!.sessions[2].scenes;
      expect(scenes.find((scene) => scene.idStoryScene === docks)?.imageUrl).toBe(
        "https://x.test/first.png",
      );
      expect(scenes.find((scene) => scene.idStoryScene === abbey)?.imageUrl).toBeNull();
    });

    it("shows the storyteller every sitting with every scene, the never-run ones last, and the unplayed grid", async () => {
      caller = tellerId;
      const board = await actions.sa_getStoryboard(playsIn);
      expect(board?.isStoryteller).toBe(true);
      expect(board?.sessions.map((session) => session.title)).toEqual([
        "Jarrow",
        "Kildealg",
        "Lindisfarne",
      ]);
      expect(board?.moreSessions).toBe(true);
      expect(board?.sessions[1].scenes.map((scene) => scene.title)).toEqual([
        "Fixture abbey",
        "Fixture docks",
        "Fixture wharf",
      ]);
      expect(board?.sessions[2].scenes.map((scene) => scene.title)).toEqual(["Fixture ford"]);
      // The first page of the backlog, in the grid's order, and word of more.
      expect(board?.unplayed.map((scene) => scene.title)).toEqual([
        "Fixture crossing",
        ...Array.from({ length: 9 }, (_, i) => `Fixture backlog ${String(i + 1).padStart(2, "0")}`),
      ]);
      expect(board?.moreUnplayed).toBe(true);
    });

    it("pages the sittings before the oldest on the board, by number and then id, until there are none", async () => {
      caller = tellerId;
      const board = await actions.sa_getStoryboard(playsIn);
      const oldest = board!.sessions[0];
      const earlier = await actions.sa_getStoryboardSessions(playsIn, {
        number: oldest.number,
        idStorySession: oldest.idStorySession,
      });
      expect(earlier?.sessions.map((session) => session.title)).toEqual(["Alnwick", "Bamburgh"]);
      expect(earlier?.more).toBe(false);

      // A player's pages hold the done sittings only.
      caller = testUser;
      const players = await actions.sa_getStoryboard(playsIn);
      const first = players!.sessions[0];
      const playersEarlier = await actions.sa_getStoryboardSessions(playsIn, {
        number: first.number,
        idStorySession: first.idStorySession,
      });
      expect(playersEarlier?.sessions.map((session) => session.title)).toEqual(["Alnwick"]);
      expect(playersEarlier?.more).toBe(false);
    });

    it("pages the unplayed scenes for the storyteller alone", async () => {
      caller = tellerId;
      const rest = await actions.sa_getStoryboardUnplayed(playsIn, 10);
      expect(rest?.scenes.map((scene) => scene.title)).toEqual([
        "Fixture backlog 10",
        "Fixture backlog 11",
      ]);
      expect(rest?.more).toBe(false);

      caller = testUser;
      expect(await actions.sa_getStoryboardUnplayed(playsIn, 0)).toEqual({
        scenes: [],
        more: false,
      });
      expect(await actions.sa_getStoryboardUnplayed(strangers, 0)).toBeNull();
      expect(await actions.sa_getStoryboardUnplayed(playsIn, -1)).toBeNull();
    });

    it("lets anyone signed in read a public story's board as a player would, less the table's notes", async () => {
      const board = await actions.sa_getStoryboard(openBook);
      expect(board?.isStoryteller).toBe(false);
      expect(board?.sessions[0]).toMatchObject({
        summary: "A chapel in the hills.",
        notes: null,
        lingeringQuestions: null,
      });
      expect(board?.sessions[0].scenes.map((scene) => scene.title)).toEqual(["Fixture chapel"]);
      expect(board?.sessions[0].scenes[0]).toMatchObject({
        description: "A chapel in the hills.",
        notes: null,
      });
    });

    it("answers null for a private story the caller has no part in, and for an unusable id", async () => {
      expect(await actions.sa_getStoryboard(strangers)).toBeNull();
      expect(await actions.sa_getStoryboard(2 ** 40)).toBeNull();
    });
  });

  describe("sa_getStoryboardScene", () => {
    it("shows a player a completed scene of a done sitting as the players' table would, hidden elements left out", async () => {
      const scene = await actions.sa_getStoryboardScene(docks);
      expect(scene).toMatchObject({
        idStorySession: null,
        scene: {
          idStoryScene: docks,
          title: "Fixture docks",
          status: "COMPLETE",
          text: { description: "Fog on the water.", notes: "Bring the lantern." },
        },
        tags: ["scene", "elements"],
        coverUrl: "https://x.test/first.png",
      });
      expect(scene?.items.map((item) => item.element.name)).toEqual(["Fixture Zed"]);
      expect(scene?.items[0].element.description).toBe("Keeps the docks.");
    });

    it("gives a reader of a public story the scene's description but not the table's notes", async () => {
      const scene = await actions.sa_getStoryboardScene(chapel);
      expect(scene?.scene?.text).toEqual({ description: "A chapel in the hills.", notes: null });
    });

    it("keeps a sitting still open, and a scene never run, from a player", async () => {
      expect(await actions.sa_getStoryboardScene(ford)).toBeNull();
      expect(await actions.sa_getStoryboardScene(wharf)).toBeNull();
      expect(await actions.sa_getStoryboardScene(crossing)).toBeNull();
    });

    it("shows the storyteller any scene of theirs", async () => {
      caller = tellerId;
      expect((await actions.sa_getStoryboardScene(ford))?.scene?.title).toBe("Fixture ford");
      expect((await actions.sa_getStoryboardScene(crossing))?.scene?.title).toBe(
        "Fixture crossing",
      );
    });

    it("answers null for a stranger's scene and an unusable id", async () => {
      const [elsewhere] = await db
        .insert(tables.storyScenes)
        .values({
          idStory: strangers,
          sceneTitle: "Fixture elsewhere",
          status: "COMPLETE",
          idCreatedByUser: tellerId,
        })
        .returning({ id: tables.storyScenes.idStoryScene });
      expect(await actions.sa_getStoryboardScene(elsewhere.id)).toBeNull();
      expect(await actions.sa_getStoryboardScene(2 ** 40)).toBeNull();
    });
  });
});
