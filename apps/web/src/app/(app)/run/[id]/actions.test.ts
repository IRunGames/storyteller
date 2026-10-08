// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes a story the seed
// user owns, with a scene, three elements of which two are in the scene, and
// a story belonging to someone else. Each test opens the session it needs;
// `beforeEach` clears them. Fixture ids are positive and left to the
// database, so they never collide with the seed's negative ids.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let otherUserId = "";
let mine = 0;
let theirs = 0;
let scene = 0;
let theirScene = 0;
let zed = 0;
let abbey = 0;

const EMPTY = { scene: null, inPlay: [] };

describe("run table actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");

    // A rerun after a crash would trip the unique email.
    await db.delete(tables.user).where(eq(tables.user.email, "run-table-fixture@example.test"));
    const [otherUser] = await db
      .insert(tables.user)
      .values({ name: "Run Table Fixture", email: "run-table-fixture@example.test" })
      .returning({ id: tables.user.id });
    otherUserId = otherUser.id;

    [{ id: mine }, { id: theirs }] = await db
      .insert(tables.stories)
      .values([
        { title: "Run table fixture — mine", idCreatedByUser: SEED_USER },
        { title: "Run table fixture — theirs", idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.stories.idStory });

    [{ id: scene }, { id: theirScene }] = await db
      .insert(tables.storyScenes)
      .values([
        { idStory: mine, sceneTitle: "Fixture scene at the docks", idCreatedByUser: SEED_USER },
        { idStory: theirs, sceneTitle: "Fixture scene of theirs", idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.storyScenes.idStoryScene });

    // A place named before the person, so the order shown is the kinds'
    // rather than the names'; and one element left out of the scene.
    [{ id: abbey }, { id: zed }] = await db
      .insert(tables.elements)
      .values([
        { idStory: mine, kind: "PLACE", name: "Fixture Abbey", idCreatedByUser: SEED_USER },
        {
          idStory: mine,
          kind: "PERSON",
          name: "Fixture Zed",
          title: "Harbourmaster",
          idCreatedByUser: SEED_USER,
        },
        { idStory: mine, kind: "THING", name: "Fixture Lantern", idCreatedByUser: SEED_USER },
      ])
      .returning({ id: tables.elements.idElement });

    await db.insert(tables.sceneElements).values([
      { idStoryScene: scene, idElement: abbey, idCreatedByUser: SEED_USER },
      { idStoryScene: scene, idElement: zed, idCreatedByUser: SEED_USER },
    ]);
  });

  beforeEach(async () => {
    // Deleting the sessions clears the stories' pointers (ON DELETE SET NULL).
    await db
      .delete(tables.storySessions)
      .where(inArray(tables.storySessions.idStory, [mine, theirs]));
  });

  after(async () => {
    if (!db) return;
    if (mine || theirs) {
      // Sessions, scenes, elements and scene_elements all go with their story.
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, [mine, theirs]));
    }
    if (otherUserId) await db.delete(tables.user).where(eq(tables.user.id, otherUserId));
    await db.$client.end();
  });

  async function openSession(
    idStory: number,
    idStoryScene: number | null,
    status = "OPEN",
  ): Promise<number> {
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory, status, idStoryScene, idCreatedByUser: SEED_USER })
      .returning({ id: tables.storySessions.idStorySession });
    await db
      .update(tables.stories)
      .set({ idStorySession: session.id })
      .where(eq(tables.stories.idStory, idStory));
    return session.id;
  }

  // A scene of the seed user's story in the given status, for the selector's
  // tests; they go with the story in `after`.
  async function sceneIn(status: string, title = `Fixture ${status.toLowerCase()} scene`) {
    const [row] = await db
      .insert(tables.storyScenes)
      .values({ idStory: mine, sceneTitle: title, status, idCreatedByUser: SEED_USER })
      .returning({ id: tables.storyScenes.idStoryScene });
    return row.id;
  }

  async function sceneRow(id: number) {
    const [row] = await db
      .select({
        status: tables.storyScenes.status,
        idStorySession: tables.storyScenes.idStorySession,
      })
      .from(tables.storyScenes)
      .where(eq(tables.storyScenes.idStoryScene, id));
    return row;
  }

  async function currentSceneOf(idStorySession: number) {
    const [row] = await db
      .select({ idStoryScene: tables.storySessions.idStoryScene })
      .from(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, idStorySession));
    return row.idStoryScene;
  }

  it("lists the story's ten most recently touched scenes with their status", async () => {
    const ids: number[] = [];
    for (let i = 1; i <= 11; i++) ids.push(await sceneIn("PENDING", `Fixture listed scene ${i}`));

    const listed = await actions.sa_listRunScenes(mine);

    expect(listed).toHaveLength(10);
    // The last one written is the most recent; the first of the eleven, and
    // the docks scene before them, fall off the end.
    expect(listed[0]).toEqual({
      idStoryScene: ids[10],
      title: "Fixture listed scene 11",
      status: "PENDING",
    });
    expect(listed.map((row) => row.idStoryScene)).not.toContain(ids[0]);
    expect(listed.map((row) => row.idStoryScene)).not.toContain(theirScene);

    await db.delete(tables.storyScenes).where(inArray(tables.storyScenes.idStoryScene, ids));
  });

  it("lists no scenes for anyone but the storyteller", async () => {
    expect(await actions.sa_listRunScenes(theirs)).toEqual([]);
  });

  it("makes a pending scene active, puts the session on it and loads it", async () => {
    const session = await openSession(mine, null);
    const pending = await sceneIn("PENDING");

    const result = await actions.sa_loadRunScene(mine, pending);

    expect(result).toEqual({
      ok: true,
      space: {
        scene: { idStoryScene: pending, title: "Fixture pending scene", status: "ACTIVE" },
        inPlay: [],
      },
    });
    expect(await sceneRow(pending)).toEqual({ status: "ACTIVE", idStorySession: session });
    expect(await currentSceneOf(session)).toBe(pending);
  });

  it("loads an active scene as it is, and leaves the sitting it was played in", async () => {
    const earlier = await openSession(mine, null, "DONE");
    const active = await sceneIn("ACTIVE");
    await db
      .update(tables.storyScenes)
      .set({ idStorySession: earlier })
      .where(eq(tables.storyScenes.idStoryScene, active));
    const session = await openSession(mine, null);

    const result = await actions.sa_loadRunScene(mine, active);

    expect(result.ok && result.space.scene?.status).toBe("ACTIVE");
    expect(await sceneRow(active)).toEqual({ status: "ACTIVE", idStorySession: earlier });
    expect(await currentSceneOf(session)).toBe(active);
  });

  it("makes a complete scene active again", async () => {
    const session = await openSession(mine, null);
    const complete = await sceneIn("COMPLETE");

    const result = await actions.sa_loadRunScene(mine, complete);

    expect(result.ok && result.space.scene?.status).toBe("ACTIVE");
    expect((await sceneRow(complete)).status).toBe("ACTIVE");
    expect(await currentSceneOf(session)).toBe(complete);
  });

  it("loads no scene without a session being played, nor another story's", async () => {
    const pending = await sceneIn("PENDING");
    expect(await actions.sa_loadRunScene(mine, pending)).toEqual({
      ok: false,
      error: "Start a session before choosing a scene.",
    });
    expect((await sceneRow(pending)).status).toBe("PENDING");

    await openSession(mine, null);
    expect(await actions.sa_loadRunScene(mine, theirScene)).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
    expect(await actions.sa_loadRunScene(theirs, theirScene)).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
  });

  it("creates a scene in the session, active, and loads it", async () => {
    const session = await openSession(mine, null);

    const result = await actions.sa_createRunScene(mine, {
      title: "  Fixture scene made at the table ",
      description: "",
    });

    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
    const created = result.space.scene!;
    expect(created).toMatchObject({ title: "Fixture scene made at the table", status: "ACTIVE" });
    expect(await sceneRow(created.idStoryScene)).toEqual({
      status: "ACTIVE",
      idStorySession: session,
    });
    expect(await currentSceneOf(session)).toBe(created.idStoryScene);
  });

  it("refuses a new scene with no title, or with no session being played", async () => {
    await openSession(mine, null);
    expect(await actions.sa_createRunScene(mine, { title: " ", description: "" })).toEqual({
      ok: false,
      errors: { title: "Please give the scene a title." },
    });

    await db.delete(tables.storySessions).where(eq(tables.storySessions.idStory, mine));
    expect(await actions.sa_createRunScene(mine, { title: "Late", description: "" })).toEqual({
      ok: false,
      errors: { root: "Start a session before choosing a scene." },
    });
  });

  it("puts the session's current scene's elements in play by kind", async () => {
    await openSession(mine, scene);

    const space = await actions.sa_getRunPlaySpace(mine);
    expect(space.scene).toEqual({
      idStoryScene: scene,
      title: "Fixture scene at the docks",
      status: "PENDING",
    });
    expect(space.inPlay).toEqual([
      {
        key: `PERSON:${zed}`,
        kind: "PERSON",
        label: "Fixture Zed",
        detail: "Harbourmaster",
        imageUrl: null,
      },
      {
        key: `PLACE:${abbey}`,
        kind: "PLACE",
        label: "Fixture Abbey",
        detail: null,
        imageUrl: null,
      },
    ]);
  });

  it("starts empty when the session is on no scene", async () => {
    await openSession(mine, null);
    expect(await actions.sa_getRunPlaySpace(mine)).toEqual(EMPTY);
  });

  it("starts empty when no session is being played", async () => {
    expect(await actions.sa_getRunPlaySpace(mine)).toEqual(EMPTY);
    await openSession(mine, scene, "SUSPENDED");
    expect(await actions.sa_getRunPlaySpace(mine)).toEqual(EMPTY);
  });

  it("gives nothing to anyone but the storyteller, and nothing for an unusable id", async () => {
    await openSession(theirs, theirScene);
    expect(await actions.sa_getRunPlaySpace(theirs)).toEqual(EMPTY);
    expect(await actions.sa_getRunPlaySpace(2147483648)).toEqual(EMPTY);
  });
});
