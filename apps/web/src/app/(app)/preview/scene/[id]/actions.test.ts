// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes a story a second
// user tells and the seed user plays in, with one scene holding a shown and a
// hidden element, and a stranger's story with a scene of its own.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

let caller = SEED_USER;
const getSession = mock.fn(async () => ({ user: { id: caller } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let tellerId = "";
let playsIn = 0;
let strangers = 0;
let docks = 0;
let strangersScene = 0;
let zed = 0;
let lantern = 0;

describe("scene preview actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    await db.delete(tables.user).where(eq(tables.user.email, "scene-preview-fixture@example.test"));
    const [teller] = await db
      .insert(tables.user)
      .values({ name: "Scene Preview Fixture", email: "scene-preview-fixture@example.test" })
      .returning({ id: tables.user.id });
    tellerId = teller.id;

    [{ id: playsIn }, { id: strangers }] = await db
      .insert(tables.stories)
      .values([
        { title: "Scene preview fixture — plays in", idCreatedByUser: tellerId },
        { title: "Scene preview fixture — strangers", idCreatedByUser: tellerId },
      ])
      .returning({ id: tables.stories.idStory });
    await db.insert(tables.storyPlayers).values({ idStory: playsIn, idUser: SEED_USER });

    [{ id: docks }, { id: strangersScene }] = await db
      .insert(tables.storyScenes)
      .values([
        {
          idStory: playsIn,
          sceneTitle: "Fixture docks",
          sceneDescription: "Fog on the water.",
          tags: ["scene", "elements"],
          idCreatedByUser: tellerId,
        },
        { idStory: strangers, sceneTitle: "Fixture elsewhere", idCreatedByUser: tellerId },
      ])
      .returning({ id: tables.storyScenes.idStoryScene });

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
    caller = SEED_USER;
  });

  after(async () => {
    if (!db) return;
    if (playsIn || strangers) {
      await db
        .delete(tables.storyPlayers)
        .where(inArray(tables.storyPlayers.idStory, [playsIn, strangers]));
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, [playsIn, strangers]));
    }
    if (tellerId) await db.delete(tables.user).where(eq(tables.user.id, tellerId));
    await db.$client.end();
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

  it("shows the storyteller the same", async () => {
    caller = tellerId;
    expect((await actions.sa_getScenePreview(docks))?.scene.scene?.title).toBe("Fixture docks");
  });

  it("finds nothing for a stranger, a scene that is not there, or an id out of range", async () => {
    expect(await actions.sa_getScenePreview(strangersScene)).toBeNull();
    expect(await actions.sa_getScenePreview(2 ** 20)).toBeNull();
    expect(await actions.sa_getScenePreview(2 ** 40)).toBeNull();
  });
});
