// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes a story with two
// scenes and two elements, one of them linked to each scene; each test opens
// the session it needs on one of the scenes. The helpers name a link by its
// own id, since an element may be in a scene more than once. The publish
// itself is mocked: what is checked is which events the helpers choose to
// send.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

import type { StoryEvent } from "./events";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

// Signed in as a test user of its own, never a real account (test-user.ts).
const TEST_USER_EMAIL = "lib-realtime-publish-scene@example.test";
let testUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

const publishStoryEvent = mock.fn(async (_idStory: number, _event: StoryEvent) => {});

let helpers: typeof import("./publish-scene");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let story = 0;
let docks = 0;
let abbey = 0;
let zed = 0;
let lantern = 0;
/** Zed's link to the docks, and the lantern's to the abbey. */
let zedLink = 0;
let lanternLink = 0;

const sent = () => publishStoryEvent.mock.calls.map((call) => call.arguments[1]);

describe("publish-scene", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("./publish", { namedExports: { publishStoryEvent, publishLater: () => {} } });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    helpers = await import("./publish-scene");

    [{ id: story }] = await db
      .insert(tables.stories)
      .values({ title: "Publish scene fixture", idCreatedByUser: testUser })
      .returning({ id: tables.stories.idStory });

    [{ id: docks }, { id: abbey }] = await db
      .insert(tables.storyScenes)
      .values([
        { idStory: story, sceneTitle: "Fixture docks", idCreatedByUser: testUser },
        { idStory: story, sceneTitle: "Fixture abbey", idCreatedByUser: testUser },
      ])
      .returning({ id: tables.storyScenes.idStoryScene });

    [{ id: zed }, { id: lantern }] = await db
      .insert(tables.elements)
      .values([
        {
          idStory: story,
          kind: "PERSON",
          name: "Fixture Zed",
          notes: "The villain",
          idCreatedByUser: testUser,
        },
        { idStory: story, kind: "THING", name: "Fixture Lantern", idCreatedByUser: testUser },
      ])
      .returning({ id: tables.elements.idElement });

    const links = await db
      .insert(tables.sceneElements)
      .values([
        { idStoryScene: docks, idElement: zed, tags: ["scene"], idCreatedByUser: testUser },
        { idStoryScene: abbey, idElement: lantern, idCreatedByUser: testUser },
      ])
      .returning({
        id: tables.sceneElements.idSceneElement,
        idElement: tables.sceneElements.idElement,
      });
    zedLink = links.find((link) => link.idElement === zed)!.id;
    lanternLink = links.find((link) => link.idElement === lantern)!.id;
  });

  beforeEach(async () => {
    publishStoryEvent.mock.resetCalls();
    await db.delete(tables.storySessions).where(eq(tables.storySessions.idStory, story));
    await db
      .update(tables.sceneElements)
      .set({ status: "READY" })
      .where(inArray(tables.sceneElements.idStoryScene, [docks, abbey]));
  });

  after(async () => {
    if (!db) return;
    if (story) await db.delete(tables.stories).where(eq(tables.stories.idStory, story));
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  async function play(idStoryScene: number | null, status = "OPEN") {
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory: story, status, idStoryScene, idCreatedByUser: testUser })
      .returning({ id: tables.storySessions.idStorySession });
    await db
      .update(tables.stories)
      .set({ idStorySession: session.id })
      .where(eq(tables.stories.idStory, story));
    return session.id;
  }

  describe("publishSceneElement", () => {
    it("sends the element and its link whole, the players' notes included", async () => {
      await play(docks);
      await helpers.publishSceneElement(story, docks, zedLink);

      const [event] = sent();
      expect(event).toMatchObject({
        v: 1,
        idStory: story,
        type: "scene_element.upserted",
        element: { idElement: zed, name: "Fixture Zed", notes: "The villain" },
        sceneElement: { idStoryScene: docks, idElement: zed, tags: ["scene"], status: "READY" },
      });
      expect(publishStoryEvent.mock.calls[0].arguments[0]).toBe(story);
    });

    it("keeps the description back while the link does not show its info", async () => {
      await play(docks);
      await db
        .update(tables.elements)
        .set({ description: "Keeps the docks." })
        .where(eq(tables.elements.idElement, zed));
      await db
        .update(tables.sceneElements)
        .set({ showInfo: false })
        .where(eq(tables.sceneElements.idElement, zed));

      await helpers.publishSceneElement(story, docks, zedLink);
      expect(sent()[0]).toMatchObject({
        element: { description: null },
        sceneElement: { showInfo: false },
      });

      await db
        .update(tables.sceneElements)
        .set({ showInfo: true })
        .where(eq(tables.sceneElements.idElement, zed));
      await helpers.publishSceneElement(story, docks, zedLink);
      expect(sent()[1]).toMatchObject({
        element: { description: "Keeps the docks." },
        sceneElement: { showInfo: true },
      });
    });

    it("sends only ids for a hidden link", async () => {
      await play(docks);
      await db
        .update(tables.sceneElements)
        .set({ status: "INVISIBLE" })
        .where(eq(tables.sceneElements.idElement, zed));

      await helpers.publishSceneElement(story, docks, zedLink);

      expect(sent()).toEqual([
        expect.objectContaining({
          type: "scene_element.removed",
          idStoryScene: docks,
          idElement: zed,
          idSceneElement: zedLink,
        }),
      ]);
    });

    it("says nothing for a link that is gone, or not the scene's", async () => {
      await play(docks);
      await helpers.publishSceneElement(story, docks, 999);
      await helpers.publishSceneElement(story, docks, lanternLink);
      expect(sent()).toEqual([]);
    });

    it("says nothing about a scene the session is not on, or with no session", async () => {
      await helpers.publishSceneElement(story, docks, zedLink);
      await play(abbey);
      await helpers.publishSceneElement(story, docks, zedLink);
      expect(sent()).toEqual([]);
    });

    it("says nothing while the session is paused", async () => {
      await play(docks, "SUSPENDED");
      await helpers.publishSceneElement(story, docks, zedLink);
      expect(sent()).toEqual([]);
    });
  });

  describe("publishElementChanged", () => {
    it("sends the element through its link to the current scene", async () => {
      await play(docks);
      await helpers.publishElementChanged(story, zed);
      expect(sent()).toEqual([expect.objectContaining({ type: "scene_element.upserted" })]);
    });

    it("sends the element once per link when it is in the scene twice, and nothing when it is not", async () => {
      await play(docks);
      const [copy] = await db
        .insert(tables.sceneElements)
        .values({
          idStoryScene: docks,
          idElement: zed,
          label: "Fixture Zed 1",
          idCreatedByUser: testUser,
        })
        .returning({ id: tables.sceneElements.idSceneElement });
      try {
        await helpers.publishElementChanged(story, zed);
        expect(
          sent().map((event) => event.type === "scene_element.upserted" && event.sceneElement),
        ).toEqual([
          expect.objectContaining({ idSceneElement: zedLink, label: null }),
          expect.objectContaining({ idSceneElement: copy.id, label: "Fixture Zed 1" }),
        ]);
        publishStoryEvent.mock.resetCalls();
        await helpers.publishElementChanged(story, lantern);
        expect(sent()).toEqual([]);
      } finally {
        await db
          .delete(tables.sceneElements)
          .where(eq(tables.sceneElements.idSceneElement, copy.id));
      }
    });

    it("says nothing with no scene at the table", async () => {
      await play(null);
      await helpers.publishElementChanged(story, zed);
      expect(sent()).toEqual([]);
    });
  });

  describe("publishSceneChanged", () => {
    it("names the scene the table is on, or none", async () => {
      await helpers.publishSceneChanged(story);
      await play(abbey);
      await helpers.publishSceneChanged(story);
      expect(sent()).toEqual([
        expect.objectContaining({ type: "scene.changed", idStoryScene: null }),
        expect.objectContaining({ type: "scene.changed", idStoryScene: abbey }),
      ]);
    });
  });

  describe("publishSceneElementRemoved", () => {
    it("sends the ids given, for the current scene only", async () => {
      await helpers.publishSceneElementRemoved(story, docks, zed, 99);
      await play(docks);
      await helpers.publishSceneElementRemoved(story, docks, zed, 99);
      expect(sent()).toEqual([
        expect.objectContaining({
          type: "scene_element.removed",
          idStoryScene: docks,
          idElement: zed,
          idSceneElement: 99,
        }),
      ]);
    });
  });

  describe("publishSceneElementPulse", () => {
    it("sends the pulse as given, naming the link's element, for the current scene's links only", async () => {
      await helpers.publishSceneElementPulse(story, docks, zedLink, { action: "preview.open" });
      await play(docks);
      await helpers.publishSceneElementPulse(story, docks, zedLink, { action: "preview.open" });
      // Whatever the pulse carries goes as it is; the helper does not look at
      // it, only at whether the link is the scene's.
      await helpers.publishSceneElementPulse(story, docks, zedLink, {
        action: "dice.roll",
        sides: 20,
      });
      await helpers.publishSceneElementPulse(story, docks, 999, { action: "preview.open" });
      expect(sent()).toEqual([
        expect.objectContaining({
          type: "scene_element.custom",
          idStoryScene: docks,
          idElement: zed,
          idSceneElement: zedLink,
          custom: { action: "preview.open" },
        }),
        expect.objectContaining({
          type: "scene_element.custom",
          idSceneElement: zedLink,
          custom: { action: "dice.roll", sides: 20 },
        }),
      ]);
    });
  });

  describe("publishSessionUpdated", () => {
    it("sends the session's new title", async () => {
      await helpers.publishSessionUpdated(story, 4, "Kildealg");
      expect(sent()).toEqual([
        expect.objectContaining({ type: "session.updated", idStorySession: 4, title: "Kildealg" }),
      ]);
    });
  });
});
