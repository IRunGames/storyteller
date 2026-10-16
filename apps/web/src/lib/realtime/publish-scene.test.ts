// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes a story with two
// scenes and two elements, one of them linked to each scene; each test opens
// the session it needs on one of the scenes. The publish itself is mocked:
// what is checked is which events the helpers choose to send.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

import type { StoryEvent } from "./events";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
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

const sent = () => publishStoryEvent.mock.calls.map((call) => call.arguments[1]);

describe("publish-scene", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("./publish", { namedExports: { publishStoryEvent, publishLater: () => {} } });
    ({ db, schema: tables } = await import("@/db"));
    helpers = await import("./publish-scene");

    [{ id: story }] = await db
      .insert(tables.stories)
      .values({ title: "Publish scene fixture", idCreatedByUser: SEED_USER })
      .returning({ id: tables.stories.idStory });

    [{ id: docks }, { id: abbey }] = await db
      .insert(tables.storyScenes)
      .values([
        { idStory: story, sceneTitle: "Fixture docks", idCreatedByUser: SEED_USER },
        { idStory: story, sceneTitle: "Fixture abbey", idCreatedByUser: SEED_USER },
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
          idCreatedByUser: SEED_USER,
        },
        { idStory: story, kind: "THING", name: "Fixture Lantern", idCreatedByUser: SEED_USER },
      ])
      .returning({ id: tables.elements.idElement });

    await db.insert(tables.sceneElements).values([
      { idStoryScene: docks, idElement: zed, tags: ["scene"], idCreatedByUser: SEED_USER },
      { idStoryScene: abbey, idElement: lantern, idCreatedByUser: SEED_USER },
    ]);
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
    await db.$client.end();
  });

  async function play(idStoryScene: number | null, status = "OPEN") {
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory: story, status, idStoryScene, idCreatedByUser: SEED_USER })
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
      await helpers.publishSceneElement(story, docks, zed);

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

      await helpers.publishSceneElement(story, docks, zed);
      expect(sent()[0]).toMatchObject({
        element: { description: null },
        sceneElement: { showInfo: false },
      });

      await db
        .update(tables.sceneElements)
        .set({ showInfo: true })
        .where(eq(tables.sceneElements.idElement, zed));
      await helpers.publishSceneElement(story, docks, zed);
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

      await helpers.publishSceneElement(story, docks, zed);

      expect(sent()).toEqual([
        expect.objectContaining({
          type: "scene_element.removed",
          idStoryScene: docks,
          idElement: zed,
          idSceneElement: expect.any(Number),
        }),
      ]);
    });

    it("sends a removal for an element not linked to the scene", async () => {
      await play(docks);
      await helpers.publishSceneElement(story, docks, lantern);
      expect(sent()).toEqual([
        expect.objectContaining({
          type: "scene_element.removed",
          idElement: lantern,
          idSceneElement: null,
        }),
      ]);
    });

    it("says nothing about a scene the session is not on, or with no session", async () => {
      await helpers.publishSceneElement(story, docks, zed);
      await play(abbey);
      await helpers.publishSceneElement(story, docks, zed);
      expect(sent()).toEqual([]);
    });

    it("says nothing while the session is paused", async () => {
      await play(docks, "SUSPENDED");
      await helpers.publishSceneElement(story, docks, zed);
      expect(sent()).toEqual([]);
    });
  });

  describe("publishElementChanged", () => {
    it("sends the element through its link to the current scene", async () => {
      await play(docks);
      await helpers.publishElementChanged(story, zed);
      expect(sent()).toEqual([expect.objectContaining({ type: "scene_element.upserted" })]);
    });

    it("sends a removal for one not in the current scene", async () => {
      await play(docks);
      await helpers.publishElementChanged(story, lantern);
      expect(sent()).toEqual([expect.objectContaining({ type: "scene_element.removed" })]);
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

  describe("publishSessionUpdated", () => {
    it("sends the session's new title", async () => {
      await helpers.publishSessionUpdated(story, 4, "Kildealg");
      expect(sent()).toEqual([
        expect.objectContaining({ type: "session.updated", idStorySession: 4, title: "Kildealg" }),
      ]);
    });
  });
});
