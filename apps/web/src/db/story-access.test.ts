// Integration test against the real database for the ownership helpers every
// storyteller action starts with, skipped when DATABASE_URL is unset. A story
// of the test user's and one of another storyteller's (makeStoryPair), each
// with a scene, an element and a link; the test user's scene is moved to
// COMPLETE by the tests that check the lock and set back after.
import { after, before, it } from "node:test";
import { expect } from "expect";
import { eq } from "drizzle-orm";
import { SCENE_LOCKED_STATUS, SCENE_PENDING_STATUS, SESSION_STATUS } from "@/lib/status";
import {
  describeWithDb,
  makeStoryPair,
  removeStoryPair,
  type Db,
  type StoryPair,
  type Tables,
} from "@/test/db-suite";

let db: Db;
let tables: Tables;
let access: typeof import("./story-access");
let pair: StoryPair;
let me = "";
let player = "";
let myElement = 0;
let myLink = 0;
let theirElement = 0;
let theirLink = 0;

describeWithDb("story access helpers", { email: "story-access@example.test" }, (suite) => {
  before(async () => {
    ({ db, tables } = suite);
    me = suite.testUser;
    access = await import("./story-access");
    pair = await makeStoryPair(suite, {
      label: "Story access fixture",
      otherEmail: "story-access-other@example.test",
    });
    player = await suite.makeUser("story-access-player@example.test");
    await db.insert(tables.storyPlayers).values({ idStory: pair.mine, idUser: player });
    [{ id: myElement }, { id: theirElement }] = await db
      .insert(tables.elements)
      .values([
        { idStory: pair.mine, kind: "PERSON", name: "Access fixture", idCreatedByUser: me },
        { idStory: pair.theirs, kind: "PERSON", name: "Theirs", idCreatedByUser: pair.otherUser },
      ])
      .returning({ id: tables.elements.idElement });
    [{ id: myLink }, { id: theirLink }] = await db
      .insert(tables.sceneElements)
      .values([
        { idStoryScene: pair.myScene, idElement: myElement, idCreatedByUser: me },
        {
          idStoryScene: pair.theirScene,
          idElement: theirElement,
          idCreatedByUser: pair.otherUser,
        },
      ])
      .returning({ id: tables.sceneElements.idSceneElement });
  });

  after(async () => {
    if (!db) return;
    // The seat has no cascade from its story, so it goes first.
    await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, pair.mine));
    await removeStoryPair(suite, pair);
  });

  async function setSceneStatus(status: string) {
    await db
      .update(tables.storyScenes)
      .set({ status })
      .where(eq(tables.storyScenes.idStoryScene, pair.myScene));
  }

  it("answers the storyteller's own story and nobody else's", async () => {
    expect(await access.ownedStory(me, pair.mine)).toEqual({ idStory: pair.mine, idSystem: null });
    expect(await access.ownedStory(me, pair.theirs)).toBeNull();
    expect(await access.ownedStory(player, pair.mine)).toBeNull();
    expect(await access.ownedStory(me, 2_000_000_000)).toBeNull();
  });

  it("answers the storyteller's scene, held to the story named, and refuses a complete one", async () => {
    const owned = await access.ownedScene(me, pair.myScene, { idStory: pair.mine });
    expect(owned.ok && owned.scene.idStoryScene).toBe(pair.myScene);
    expect(owned.ok && owned.scene.status).toBe(SCENE_PENDING_STATUS);
    expect(await access.ownedScene(me, pair.myScene, { idStory: pair.theirs })).toEqual({
      ok: false,
      reason: "not-yours",
    });
    expect(await access.ownedScene(me, pair.theirScene)).toEqual({
      ok: false,
      reason: "not-yours",
    });
    expect(await access.ownedScene(player, pair.myScene)).toEqual({
      ok: false,
      reason: "not-yours",
    });

    await setSceneStatus(SCENE_LOCKED_STATUS);
    try {
      expect(await access.ownedScene(me, pair.myScene)).toEqual({ ok: false, reason: "locked" });
      const read = await access.ownedScene(me, pair.myScene, { allowLocked: true });
      expect(read.ok && read.scene.status).toBe(SCENE_LOCKED_STATUS);
    } finally {
      await setSceneStatus(SCENE_PENDING_STATUS);
    }
  });

  it("answers the storyteller's session and element, and nobody else's", async () => {
    const [{ id }] = await db
      .insert(tables.storySessions)
      .values({ idStory: pair.mine, title: "Access sitting", idCreatedByUser: me })
      .returning({ id: tables.storySessions.idStorySession });
    expect(await access.ownedSession(me, id)).toEqual({
      idStorySession: id,
      idStory: pair.mine,
      status: SESSION_STATUS.OPEN,
      title: "Access sitting",
    });
    expect(await access.ownedSession(me, id, { idStory: pair.theirs })).toBeNull();
    expect(await access.ownedSession(pair.otherUser, id)).toBeNull();

    expect(await access.ownedElement(me, myElement)).toMatchObject({
      idElement: myElement,
      idStory: pair.mine,
    });
    expect(await access.ownedElement(me, myElement, { idStory: pair.theirs })).toBeNull();
    expect(await access.ownedElement(me, theirElement)).toBeNull();
  });

  it("answers a link in the storyteller's scene, and locks it with the scene", async () => {
    const owned = await access.ownedSceneElement(me, myLink, { idStory: pair.mine });
    expect(owned.ok && owned.link).toMatchObject({
      idSceneElement: myLink,
      idStoryScene: pair.myScene,
      idStory: pair.mine,
      idElement: myElement,
    });
    expect(await access.ownedSceneElement(me, theirLink)).toEqual({
      ok: false,
      reason: "not-yours",
    });
    expect(await access.ownedSceneElement(me, myLink, { idStoryScene: pair.theirScene })).toEqual({
      ok: false,
      reason: "not-yours",
    });

    await setSceneStatus(SCENE_LOCKED_STATUS);
    try {
      expect(await access.ownedSceneElement(me, myLink)).toEqual({
        ok: false,
        reason: "locked",
      });
      const read = await access.ownedSceneElement(me, myLink, { allowLocked: true });
      expect(read.ok && read.link.sceneStatus).toBe(SCENE_LOCKED_STATUS);
    } finally {
      await setSceneStatus(SCENE_PENDING_STATUS);
    }
  });

  it("finds the session being played, and the one shown while paused", async () => {
    expect(await access.playingSession(me, pair.mine)).toBeNull();
    expect(await access.shownSession(me, pair.mine)).toBeNull();
    const [{ id }] = await db
      .insert(tables.storySessions)
      .values({ idStory: pair.mine, idStoryScene: pair.myScene, idCreatedByUser: me })
      .returning({ id: tables.storySessions.idStorySession });
    await db
      .update(tables.stories)
      .set({ idStorySession: id })
      .where(eq(tables.stories.idStory, pair.mine));
    try {
      expect(await access.playingSession(me, pair.mine)).toBe(id);
      expect(await access.playingSession(pair.otherUser, pair.mine)).toBeNull();
      expect(await access.shownSession(me, pair.mine)).toEqual({
        idStorySession: id,
        idStoryScene: pair.myScene,
        isPlaying: true,
      });

      await db
        .update(tables.storySessions)
        .set({ status: SESSION_STATUS.SUSPENDED })
        .where(eq(tables.storySessions.idStorySession, id));
      expect(await access.playingSession(me, pair.mine)).toBeNull();
      expect(await access.shownSession(me, pair.mine)).toMatchObject({ isPlaying: false });

      await db
        .update(tables.storySessions)
        .set({ status: SESSION_STATUS.DONE })
        .where(eq(tables.storySessions.idStorySession, id));
      expect(await access.shownSession(me, pair.mine)).toBeNull();
    } finally {
      await db.delete(tables.storySessions).where(eq(tables.storySessions.idStorySession, id));
    }
  });

  it("lets the storyteller write any scene but a complete one, and a player only the scene being played", async () => {
    const mine = await access.writableScene(me, pair.mine, pair.myScene);
    expect(mine.ok && mine.as).toBe("storyteller");
    expect(await access.writableScene(me, pair.theirs, pair.theirScene)).toEqual({
      ok: false,
      reason: "not-yours",
    });
    expect(await access.writableScene(me, pair.mine, pair.theirScene)).toEqual({
      ok: false,
      reason: "not-yours",
    });

    // Nothing being played: the player has no scene to write.
    expect(await access.writableScene(player, pair.mine, pair.myScene)).toEqual({
      ok: false,
      reason: "not-being-played",
    });
    const [{ id }] = await db
      .insert(tables.storySessions)
      .values({ idStory: pair.mine, idStoryScene: pair.myScene, idCreatedByUser: me })
      .returning({ id: tables.storySessions.idStorySession });
    await db
      .update(tables.stories)
      .set({ idStorySession: id })
      .where(eq(tables.stories.idStory, pair.mine));
    try {
      const played = await access.writableScene(player, pair.mine, pair.myScene);
      expect(played.ok && played.as).toBe("player");
      // A stranger, even with the story public, has no seat to write from.
      await db
        .update(tables.stories)
        .set({ isPublic: true })
        .where(eq(tables.stories.idStory, pair.mine));
      expect(await access.writableScene(pair.otherUser, pair.mine, pair.myScene)).toEqual({
        ok: false,
        reason: "not-yours",
      });

      await setSceneStatus(SCENE_LOCKED_STATUS);
      expect(await access.writableScene(me, pair.mine, pair.myScene)).toEqual({
        ok: false,
        reason: "locked",
      });
      // The run table lets the storyteller write up a finished scene; a
      // player is held to the lock whatever the caller allows.
      const finished = await access.writableScene(me, pair.mine, pair.myScene, {
        allowLocked: true,
      });
      expect(finished.ok && finished.as).toBe("storyteller");
      expect(
        await access.writableScene(player, pair.mine, pair.myScene, { allowLocked: true }),
      ).toEqual({ ok: false, reason: "locked" });
    } finally {
      await setSceneStatus(SCENE_PENDING_STATUS);
      await db
        .update(tables.stories)
        .set({ isPublic: false })
        .where(eq(tables.stories.idStory, pair.mine));
      await db.delete(tables.storySessions).where(eq(tables.storySessions.idStorySession, id));
    }
  });
});
