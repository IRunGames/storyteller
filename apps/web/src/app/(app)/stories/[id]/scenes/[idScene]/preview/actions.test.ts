// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes a story a second
// user tells and the test user plays in, with one scene holding a shown and a
// hidden element, and a stranger's story with a scene of its own.
import { after, before, beforeEach, it } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { describeWithDb, type Db, type Tables } from "@/test/db-suite";

const TEST_USER_EMAIL = "preview-scene-id-actions@example.test";
let testUser = "";

let actions: typeof import("./actions");

let db: Db;
let tables: Tables;

let tellerId = "";
let playsIn = 0;
let strangers = 0;
let docks = 0;
let earlier = 0;
let later = 0;
let ford = 0;
let strangersScene = 0;
let zed = 0;
let lantern = 0;

describeWithDb("scene preview actions", { email: TEST_USER_EMAIL }, (suite) => {
  before(async () => {
    ({ db, tables } = suite);
    testUser = suite.testUser;
    suite.caller = testUser;
    actions = await import("./actions");

    tellerId = await suite.makeUser("scene-preview-fixture@example.test", {
      name: "Scene Preview Fixture",
    });

    [{ id: playsIn }, { id: strangers }] = await db
      .insert(tables.stories)
      .values([
        { title: "Scene preview fixture — plays in", idCreatedByUser: tellerId },
        { title: "Scene preview fixture — strangers", idCreatedByUser: tellerId },
      ])
      .returning({ id: tables.stories.idStory });
    await db.insert(tables.storyPlayers).values({ idStory: playsIn, idUser: testUser });
    // Two sittings, opened in this order, so Kildealg is the first and
    // Lindisfarne the second.
    const [first, second] = await db
      .insert(tables.storySessions)
      .values([
        { idStory: playsIn, status: "DONE", title: "Kildealg", idCreatedByUser: tellerId },
        { idStory: playsIn, status: "DONE", title: "Lindisfarne", idCreatedByUser: tellerId },
      ])
      .returning({ id: tables.storySessions.idStorySession });

    // In the first sitting the abbey was finished before the docks; the ford
    // was the second sitting's one scene; the crossing is not played yet.
    // Inserted in no particular order, so the ids say nothing.
    [{ id: later }, { id: docks }, { id: ford }, { id: earlier }, { id: strangersScene }] = await db
      .insert(tables.storyScenes)
      .values([
        { idStory: playsIn, sceneTitle: "Fixture crossing", idCreatedByUser: tellerId },
        {
          idStory: playsIn,
          sceneTitle: "Fixture docks",
          sceneDescription: "Fog on the water.",
          tags: ["scene", "elements"],
          status: "COMPLETE",
          idStorySession: first.id,
          activeAt: new Date("2026-10-10T00:00:00Z"),
          idCreatedByUser: tellerId,
        },
        {
          idStory: playsIn,
          sceneTitle: "Fixture ford",
          status: "COMPLETE",
          idStorySession: second.id,
          activeAt: new Date("2026-10-08T00:00:00Z"),
          idCreatedByUser: tellerId,
        },
        {
          idStory: playsIn,
          sceneTitle: "Fixture abbey",
          status: "COMPLETE",
          idStorySession: first.id,
          activeAt: new Date("2026-10-05T00:00:00Z"),
          idCreatedByUser: tellerId,
        },
        { idStory: strangers, sceneTitle: "Fixture elsewhere", idCreatedByUser: tellerId },
      ])
      .returning({ id: tables.storyScenes.idStoryScene });
    // When each was finished, which numbers the scenes within a sitting.
    // Set after the insert: the workflow stamps complete_at itself as a
    // row arrives in COMPLETE, which would make the three one moment.
    for (const [id, day] of [
      [docks, "2026-10-10"],
      [ford, "2026-10-08"],
      [earlier, "2026-10-05"],
    ] as const) {
      await db
        .update(tables.storyScenes)
        .set({ completeAt: new Date(`${day}T02:00:00Z`) })
        .where(eq(tables.storyScenes.idStoryScene, id));
    }

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

  beforeEach(() => {
    suite.caller = testUser;
  });

  after(async () => {
    if (!db) return;
    if (playsIn || strangers) {
      await db
        .delete(tables.storyPlayers)
        .where(inArray(tables.storyPlayers.idStory, [playsIn, strangers]));
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, [playsIn, strangers]));
    }
  });

  it("shows a player the scene as the players' table would, hidden elements left out", async () => {
    const preview = await actions.sa_getScenePreview(docks);
    expect(preview).toMatchObject({
      idStory: playsIn,
      storyTitle: "Scene preview fixture — plays in",
      scene: {
        scene: {
          idStoryScene: docks,
          title: "Fixture docks",
          text: { description: "Fog on the water.", notes: null },
        },
        tags: ["scene", "elements"],
      },
    });
    expect(preview?.scene.items.map((item) => item.element.name)).toEqual(["Fixture Zed"]);
    expect(preview?.scene.items[0].element.description).toBe("Keeps the docks.");
    expect(preview?.scene.items[0].sceneElement.tags).toEqual(["scene"]);
  });

  it("lists the story's scenes by sitting, newest first, and within one by scene, latest first, the unplayed last", async () => {
    // The player's list stops at the scenes played to completion: the
    // crossing is still prep, and is not even named to them.
    const player = await actions.sa_getScenePreview(docks);
    expect(player?.scenes.map((scene) => scene.idStoryScene)).toEqual([ford, docks, earlier]);

    suite.caller = tellerId;
    const atDocks = await actions.sa_getScenePreview(docks);
    expect(atDocks?.scenes).toEqual([
      {
        idStoryScene: ford,
        title: "Fixture ford",
        status: "COMPLETE",
        sessionHeading: "2. Lindisfarne",
      },
      {
        idStoryScene: docks,
        title: "Fixture docks",
        status: "COMPLETE",
        sessionHeading: "1. Kildealg",
      },
      {
        idStoryScene: earlier,
        title: "Fixture abbey",
        status: "COMPLETE",
        sessionHeading: "1. Kildealg",
      },
      { idStoryScene: later, title: "Fixture crossing", status: "PENDING", sessionHeading: null },
    ]);
  });

  it("names the scenes either side in that same list: previous is the one below, next the one above", async () => {
    const atDocks = await actions.sa_getScenePreview(docks);
    expect(atDocks?.previous).toMatchObject({ idStoryScene: earlier, title: "Fixture abbey" });
    expect(atDocks?.next).toMatchObject({ idStoryScene: ford, title: "Fixture ford" });
    const atFord = await actions.sa_getScenePreview(ford);
    expect(atFord?.previous).toMatchObject({ idStoryScene: docks });
    expect(atFord?.next).toBeNull();
    // The unplayed crossing is the storyteller's to step onto.
    suite.caller = tellerId;
    const atLater = await actions.sa_getScenePreview(later);
    expect(atLater?.previous).toBeNull();
    expect(atLater?.next).toMatchObject({ idStoryScene: earlier });
  });

  // The mark in a full-size preview, "FOG OF WAR ACTIVE", is for the
  // storyteller: the players' copy is what both are shown, but only the
  // storyteller is told it has fog on it.
  it("tells the storyteller a picture has fog on it, and never a player", async () => {
    const [{ id: idAttachment }] = await db
      .insert(tables.attachments)
      .values({
        idStory: playsIn,
        status: "READY",
        url: "https://abc.public.blob.vercel-storage.com/uploads/u/zed.png",
        isUploaded: true,
        idCreatedByUser: tellerId,
      })
      .returning({ id: tables.attachments.idAttachment });
    try {
      await db.insert(tables.attachmentUses).values({
        idAttachment,
        kind: "ELEMENT",
        idExternal: zed,
        tags: ["cover"],
        idCreatedByUser: tellerId,
      });
      await db.insert(tables.attachmentAnnotations).values({
        idAttachment,
        width: 100,
        height: 50,
        playerUrl: "https://abc.public.blob.vercel-storage.com/annotations/zed-copy.webp",
        idCreatedByUser: tellerId,
      });
      const zedOf = async () => (await actions.sa_getScenePreview(docks))?.scene.items[0].element;
      expect(await zedOf()).not.toHaveProperty("imageFogActive");
      suite.caller = tellerId;
      expect((await zedOf())?.imageFogActive).toBe(true);
      await db
        .update(tables.attachmentAnnotations)
        .set({ ops: [{ t: "fogAll", mode: "reveal" }] })
        .where(eq(tables.attachmentAnnotations.idAttachment, idAttachment));
      expect(await zedOf()).not.toHaveProperty("imageFogActive");
    } finally {
      await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, idAttachment));
    }
  });

  it("shows the storyteller the same", async () => {
    suite.caller = tellerId;
    expect((await actions.sa_getScenePreview(docks))?.scene.scene?.title).toBe("Fixture docks");
  });

  it("keeps a scene not yet played from a player, as the prep board does, and shows it to the storyteller", async () => {
    expect(await actions.sa_getScenePreview(later)).toBeNull();
    suite.caller = tellerId;
    expect((await actions.sa_getScenePreview(later))?.scene.scene?.title).toBe("Fixture crossing");
  });

  it("finds nothing for a stranger, a scene that is not there, or an id out of range", async () => {
    expect(await actions.sa_getScenePreview(strangersScene)).toBeNull();
    expect(await actions.sa_getScenePreview(2 ** 20)).toBeNull();
    expect(await actions.sa_getScenePreview(2 ** 40)).toBeNull();
  });
});
