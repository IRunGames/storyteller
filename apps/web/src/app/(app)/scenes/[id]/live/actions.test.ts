// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes a story the seed
// user owns, with a scene and two sessions, and a story belonging to someone
// else with a scene and a session of its own. Fixture ids are positive and
// left to the database, so they never collide with the seed's negative ids,
// and `after` deletes only the two stories it made, which takes their
// scenes and sessions with them.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

// Signed in as a test user of its own, never a real account (test-user.ts).
const TEST_USER_EMAIL = "scenes-id-live-actions@example.test";
let testUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: testUser } }));
const publishSceneChanged = mock.fn(async (..._args: unknown[]) => {});

let actions: typeof import("./actions");

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

let otherUserId = "";
let mine = 0;
let theirs = 0;
let scene = 0;
let theirScene = 0;
let first = 0;
let second = 0;
let theirSession = 0;

describe("live scene actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    mock.module("@/lib/realtime/publish-scene", { namedExports: { publishSceneChanged } });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
    actions = await import("./actions");

    // A rerun after a crash would trip the unique email.
    await db.delete(tables.user).where(eq(tables.user.email, "live-scene-fixture@example.test"));
    const [otherUser] = await db
      .insert(tables.user)
      .values({ name: "Live Scene Fixture", email: "live-scene-fixture@example.test" })
      .returning({ id: tables.user.id });
    otherUserId = otherUser.id;

    [{ id: mine }, { id: theirs }] = await db
      .insert(tables.stories)
      .values([
        { title: "Live scene fixture — mine", idCreatedByUser: testUser },
        { title: "Live scene fixture — theirs", idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.stories.idStory });

    [{ id: scene }, { id: theirScene }] = await db
      .insert(tables.storyScenes)
      .values([
        { idStory: mine, sceneTitle: "Fixture scene at the docks", idCreatedByUser: testUser },
        { idStory: theirs, sceneTitle: "Fixture scene of theirs", idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.storyScenes.idStoryScene });

    [{ id: first }, { id: second }, { id: theirSession }] = await db
      .insert(tables.storySessions)
      .values([
        { idStory: mine, status: "DONE", idCreatedByUser: testUser },
        { idStory: mine, status: "DONE", idCreatedByUser: testUser },
        { idStory: theirs, status: "DONE", idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.storySessions.idStorySession });
  });

  beforeEach(async () => {
    publishSceneChanged.mock.resetCalls();
    await db
      .update(tables.storyScenes)
      .set({
        sceneTitle: "Fixture scene at the docks",
        sceneDescription: null,
        notes: null,
        status: "PENDING",
        idStorySession: null,
      })
      .where(eq(tables.storyScenes.idStoryScene, scene));
  });

  after(async () => {
    if (!db) return;
    if (mine || theirs) {
      await db.delete(tables.stories).where(inArray(tables.stories.idStory, [mine, theirs]));
    }
    if (otherUserId) await db.delete(tables.user).where(eq(tables.user.id, otherUserId));
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await db.$client.end();
  });

  async function sceneRow() {
    const [row] = await db
      .select({
        title: tables.storyScenes.sceneTitle,
        description: tables.storyScenes.sceneDescription,
        notes: tables.storyScenes.notes,
        idStorySession: tables.storyScenes.idStorySession,
      })
      .from(tables.storyScenes)
      .where(eq(tables.storyScenes.idStoryScene, scene));
    return row;
  }

  async function complete() {
    await db
      .update(tables.storyScenes)
      .set({ status: "COMPLETE", idStorySession: first })
      .where(eq(tables.storyScenes.idStoryScene, scene));
  }

  it("renames the scene and writes its text, and tells the players' table", async () => {
    const result = await actions.sa_setLiveSceneText(mine, scene, {
      title: "  Fixture scene at noon ",
      description: "Fog on the water.",
      notes: "",
    });

    expect(result).toEqual({
      ok: true,
      title: "Fixture scene at noon",
      text: { description: "Fog on the water.", notes: null },
    });
    expect(await sceneRow()).toMatchObject({
      title: "Fixture scene at noon",
      description: "Fog on the water.",
      notes: null,
    });
    expect(publishSceneChanged.mock.callCount()).toBe(1);
  });

  it("refuses a scene with no title, on its field", async () => {
    const result = await actions.sa_setLiveSceneText(mine, scene, {
      title: " ",
      description: "",
      notes: "",
    });

    expect(result).toEqual({ ok: false, errors: { title: "Please give the scene a title." } });
    expect((await sceneRow()).title).toBe("Fixture scene at the docks");
  });

  it("writes nothing over a complete scene, another story's or anyone else's", async () => {
    const values = { title: "Taken", description: "", notes: "" };
    expect(await actions.sa_setLiveSceneText(mine, theirScene, values)).toEqual({
      ok: false,
      errors: { root: "That scene is not part of this story." },
    });
    expect(await actions.sa_setLiveSceneText(theirs, theirScene, values)).toEqual({
      ok: false,
      errors: { root: "That scene is not part of this story." },
    });

    await complete();
    expect(await actions.sa_setLiveSceneText(mine, scene, values)).toEqual({
      ok: false,
      errors: { root: "That scene is complete, so nothing in it can change." },
    });
    expect((await sceneRow()).title).toBe("Fixture scene at the docks");
  });

  it("sets the sitting the scene was played in, and takes it off again", async () => {
    expect(await actions.sa_setLiveSceneSession(mine, scene, second)).toEqual({
      ok: true,
      idStorySession: second,
    });
    expect((await sceneRow()).idStorySession).toBe(second);

    expect(await actions.sa_setLiveSceneSession(mine, scene, null)).toEqual({
      ok: true,
      idStorySession: null,
    });
    expect((await sceneRow()).idStorySession).toBeNull();
  });

  it("moves a complete scene to another sitting, but not to none", async () => {
    await complete();

    expect(await actions.sa_setLiveSceneSession(mine, scene, second)).toEqual({
      ok: true,
      idStorySession: second,
    });
    expect(await actions.sa_setLiveSceneSession(mine, scene, null)).toEqual({
      ok: false,
      error: "A complete scene was played in a session, so it keeps one.",
    });
    expect((await sceneRow()).idStorySession).toBe(second);
  });

  it("refuses another story's session, and another story's scene", async () => {
    expect(await actions.sa_setLiveSceneSession(mine, scene, theirSession)).toEqual({
      ok: false,
      error: "That session is not part of this story.",
    });
    expect(await actions.sa_setLiveSceneSession(theirs, theirScene, theirSession)).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
    expect((await sceneRow()).idStorySession).toBeNull();
  });

  it("searches the story's scenes in no session, and in the sessions chosen, by status and words", async () => {
    const all = ["PENDING", "ACTIVE", "COMPLETE"];

    // In no session, as the page starts: the docks scene is there.
    const unplayed = await actions.sa_searchLiveScenes(mine, {
      query: "",
      statuses: all,
      sessions: [],
    });
    expect(unplayed.map((row) => row.idStoryScene)).toContain(scene);
    expect(unplayed.map((row) => row.idStoryScene)).not.toContain(theirScene);
    expect(unplayed.find((row) => row.idStoryScene === scene)?.sessionHeading).toBeNull();

    // Choosing a session still lists the scenes in none.
    expect(
      (
        await actions.sa_searchLiveScenes(mine, { query: "", statuses: all, sessions: [first] })
      ).map((row) => row.idStoryScene),
    ).toContain(scene);

    // Put in the second session, it moves to that session's list, headed by it.
    await actions.sa_setLiveSceneSession(mine, scene, second);
    const none = await actions.sa_searchLiveScenes(mine, {
      query: "",
      statuses: all,
      sessions: [],
    });
    expect(none.map((row) => row.idStoryScene)).not.toContain(scene);
    expect(
      (
        await actions.sa_searchLiveScenes(mine, { query: "", statuses: all, sessions: [first] })
      ).map((row) => row.idStoryScene),
    ).not.toContain(scene);
    const inSecond = await actions.sa_searchLiveScenes(mine, {
      query: "docks",
      statuses: all,
      sessions: [second],
    });
    expect(inSecond).toEqual([
      {
        idStoryScene: scene,
        title: "Fixture scene at the docks",
        status: "PENDING",
        sessionHeading: "Session 2",
      },
    ]);

    // A status switched off, or words it does not hold, leave it out.
    expect(
      await actions.sa_searchLiveScenes(mine, {
        query: "",
        statuses: ["ACTIVE"],
        sessions: [second],
      }),
    ).toEqual([]);
    expect(
      await actions.sa_searchLiveScenes(mine, {
        query: "abbey",
        statuses: all,
        sessions: [second],
      }),
    ).toEqual([]);
  });

  it("searches nothing on someone else's story", async () => {
    expect(
      await actions.sa_searchLiveScenes(theirs, {
        query: "",
        statuses: ["PENDING"],
        sessions: [],
      }),
    ).toEqual([]);
  });

  it("lists the scenes in no session first, then the latest session's, each most recently touched first", async () => {
    // Two more scenes of the story: one in the first session, one in the second.
    const [{ id: inFirst }, { id: inSecond }] = await db
      .insert(tables.storyScenes)
      .values([
        {
          idStory: mine,
          sceneTitle: "Fixture scene of the first sitting",
          idStorySession: first,
          idCreatedByUser: testUser,
        },
        {
          idStory: mine,
          sceneTitle: "Fixture scene of the second sitting",
          idStorySession: second,
          idCreatedByUser: testUser,
        },
      ])
      .returning({ id: tables.storyScenes.idStoryScene });

    const listed = await actions.sa_searchLiveScenes(mine, {
      query: "",
      statuses: ["PENDING", "ACTIVE", "COMPLETE"],
      sessions: [first, second],
    });
    expect(listed.map((row) => row.idStoryScene)).toEqual([scene, inSecond, inFirst]);

    await db
      .delete(tables.storyScenes)
      .where(inArray(tables.storyScenes.idStoryScene, [inFirst, inSecond]));
  });
});
