// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The storyteller's table: opening the play space, choosing and making scenes, and writing up a scene's text and stacks.
// The fixture is test/scene-fixtures.ts's: a story of the test user's with a
// scene and elements, and a story belonging to someone else; each test opens
// the session it needs and `beforeEach` clears them.
import { after, before, beforeEach, it } from "node:test";
import { expect } from "expect";
import { and, eq, inArray } from "drizzle-orm";
import { elementIdOf } from "@/lib/scene-elements";
import { describeWithDb, type Db, type Tables } from "@/test/db-suite";
import {
  DEFAULT_TAGS,
  EMPTY_SPACE,
  type SceneFixture,
  makeSceneFixture,
  mockPublishing,
  publishMocks,
} from "@/test/scene-fixtures";

const mocks = publishMocks();
const { publishChat } = mocks;

let actions: typeof import("./actions");
let links: typeof import("@/components/scene-elements/actions");
let db: Db;
let tables: Tables;
let fx: SceneFixture;
let testUser = "";
let mine = 0;
let theirs = 0;
let scene = 0;
let theirScene = 0;
let zed = 0;
let abbey = 0;

describeWithDb("run table actions", { email: "run-actions@example.test" }, (suite) => {
  before(async () => {
    mockPublishing(mocks);
    ({ db, tables } = suite);
    testUser = suite.testUser;
    actions = await import("./actions");
    links = await import("@/components/scene-elements/actions");
    fx = await makeSceneFixture(suite, "Run table fixture");
    ({ mine, theirs, scene, theirScene, zed, abbey } = fx);
  });

  beforeEach(() => fx.clearSessions());

  after(async () => {
    if (!db) return;
    await fx.remove();
  });

  const openSession = (...args: Parameters<SceneFixture["openSession"]>) => fx.openSession(...args);
  const sceneIn = (...args: Parameters<SceneFixture["sceneIn"]>) => fx.sceneIn(...args);
  const sceneRow = (...args: Parameters<SceneFixture["sceneRow"]>) => fx.sceneRow(...args);
  const currentSceneOf = (...args: Parameters<SceneFixture["currentSceneOf"]>) =>
    fx.currentSceneOf(...args);

  const linksOf = (...args: Parameters<SceneFixture["linksOf"]>) => fx.linksOf(...args);
  const linkOf = (...args: Parameters<SceneFixture["linkOf"]>) => fx.linkOf(...args);

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
      sessionHeading: null,
    });
    expect(listed.map((row) => row.idStoryScene)).not.toContain(ids[0]);
    expect(listed.map((row) => row.idStoryScene)).not.toContain(theirScene);

    await db.delete(tables.storyScenes).where(inArray(tables.storyScenes.idStoryScene, ids));
  });

  it("names the sitting each listed scene was played in, as the Timeline heads it", async () => {
    const session = await openSession(mine, null, "DONE");
    const played = await sceneIn("COMPLETE", "Fixture played scene");
    await db
      .update(tables.storyScenes)
      .set({ idStorySession: session })
      .where(eq(tables.storyScenes.idStoryScene, played));

    const listed = await actions.sa_listRunScenes(mine);
    // The story's only sitting, with no title of its own.
    expect(listed.find((row) => row.idStoryScene === played)?.sessionHeading).toBe("Session 1");

    await db.delete(tables.storyScenes).where(eq(tables.storyScenes.idStoryScene, played));
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
        scene: {
          idStoryScene: pending,
          title: "Fixture pending scene",
          status: "ACTIVE",
          text: { description: null, notes: null },
        },
        tags: DEFAULT_TAGS,
        wideTags: [],
        coverUrl: null,
        inPlay: [],
      },
    });
    expect(await sceneRow(pending)).toEqual({ status: "ACTIVE", idStorySession: session });
    expect(await currentSceneOf(session)).toBe(pending);
  });

  it("puts an Entering divider in the chat when the table moves, and only then", async () => {
    const session = await openSession(mine, null);
    const pending = await sceneIn("PENDING", "Fixture divider scene");
    publishChat.mock.resetCalls();
    const dividers = () =>
      db
        .select({
          text: tables.chats.chatText,
          idStoryScene: tables.chats.idStoryScene,
          isSystem: tables.chats.isSystem,
          idCreatedByUser: tables.chats.idCreatedByUser,
        })
        .from(tables.chats)
        .where(eq(tables.chats.idStoryScene, pending));

    await actions.sa_loadRunScene(mine, pending);
    expect(await dividers()).toEqual([
      {
        text: "Entering Fixture divider scene",
        idStoryScene: pending,
        isSystem: true,
        idCreatedByUser: testUser,
      },
    ]);
    expect(publishChat.mock.calls).toHaveLength(1);
    expect(publishChat.mock.calls[0].arguments[1]).toMatchObject({
      text: "Entering Fixture divider scene",
      from: "Storyteller",
      isSystem: true,
    });

    // Loading the scene the table is already on is no move.
    await actions.sa_loadRunScene(mine, pending);
    expect(await dividers()).toHaveLength(1);
    expect(publishChat.mock.calls).toHaveLength(1);
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

  it("puts the table on a complete scene, leaving it complete and unplayed", async () => {
    const session = await openSession(mine, null);
    const complete = await sceneIn("COMPLETE");

    const result = await actions.sa_loadRunScene(mine, complete);

    expect(result.ok && result.space.scene?.status).toBe("COMPLETE");
    // Still complete, and not recorded as played in this sitting.
    expect(await sceneRow(complete)).toEqual({ status: "COMPLETE", idStorySession: null });
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

  it("reads a scene's play space for its edit page without a session, and moves nothing", async () => {
    const pending = await sceneIn("PENDING");

    expect(await actions.sa_getScenePlaySpace(mine, pending)).toEqual({
      scene: {
        idStoryScene: pending,
        title: "Fixture pending scene",
        status: "PENDING",
        text: { description: null, notes: null },
      },
      tags: DEFAULT_TAGS,
      wideTags: [],
      coverUrl: null,
      inPlay: [],
    });
    // Only read: the scene is not made active or recorded as played.
    expect(await sceneRow(pending)).toEqual({ status: "PENDING", idStorySession: null });

    const space = await actions.sa_getScenePlaySpace(mine, scene);
    expect(space.inPlay.map(elementIdOf)).toEqual([zed, abbey]);
  });

  it("reads no play space for another story's scene, nor for anyone but its storyteller", async () => {
    expect(await actions.sa_getScenePlaySpace(mine, theirScene)).toEqual(EMPTY_SPACE);
    expect(await actions.sa_getScenePlaySpace(theirs, theirScene)).toEqual(EMPTY_SPACE);
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

  it("refuses a new scene with no title", async () => {
    await openSession(mine, null);
    expect(await actions.sa_createRunScene(mine, { title: " ", description: "" })).toEqual({
      ok: false,
      errors: { title: "Please give the scene a title." },
    });
  });

  it("creates a scene to prepare, pending and in no sitting, with no session being played", async () => {
    const result = await actions.sa_createRunScene(mine, {
      title: "Fixture scene made between sessions",
      description: "",
    });

    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
    const created = result.space.scene!;
    expect(created).toMatchObject({ status: "PENDING" });
    expect(await sceneRow(created.idStoryScene)).toEqual({
      status: "PENDING",
      idStorySession: null,
    });
  });

  it("puts the session's current scene's tags and elements in play, by kind", async () => {
    await openSession(mine, scene);

    const space = await actions.sa_openRunPlaySpace(mine);
    expect(space.scene).toEqual({
      idStoryScene: scene,
      title: "Fixture scene at the docks",
      status: "PENDING",
      text: { description: null, notes: null },
    });
    expect(space.tags).toEqual(DEFAULT_TAGS);
    expect(space.coverUrl).toBeNull();
    // Keyed by the element and its link (playItemKey).
    const [zedLink, abbeyLink] = [await linkOf(scene, zed), await linkOf(scene, abbey)];
    expect(space.inPlay).toEqual([
      {
        key: `PERSON:${zed}:${zedLink}`,
        kind: "PERSON",
        // Its initial name: the name it goes by when it first turns up.
        label: "Fixture hooded figure",
        detail: "Harbourmaster",
        imageUrl: null,
        sceneTags: ["scene"],
        sceneStatus: "READY",
        showInfo: true,
        idSceneElement: zedLink,
        hasStatBlocks: false,
        fields: {
          initial_name: "Fixture hooded figure",
          name: "Fixture Zed",
          title: "Harbourmaster",
          label: null,
        },
        showing: "initial_name",
        link: null,
      },
      {
        key: `PLACE:${abbey}:${abbeyLink}`,
        kind: "PLACE",
        label: "Fixture Abbey",
        detail: null,
        imageUrl: null,
        sceneTags: [],
        sceneStatus: "READY",
        showInfo: true,
        idSceneElement: abbeyLink,
        hasStatBlocks: false,
        // No initial name, so the default shows the name.
        fields: { initial_name: null, name: "Fixture Abbey", title: null, label: null },
        showing: "initial_name",
        link: null,
      },
    ]);
  });

  it("starts empty when the session is on no scene and none is active", async () => {
    // The selector's tests above leave active scenes behind them.
    await db
      .delete(tables.storyScenes)
      .where(and(eq(tables.storyScenes.idStory, mine), eq(tables.storyScenes.status, "ACTIVE")));
    await openSession(mine, null);
    expect(await actions.sa_openRunPlaySpace(mine)).toEqual(EMPTY_SPACE);
  });

  it("puts a session on no scene onto the story's active scene, the most recently touched", async () => {
    const session = await openSession(mine, null);
    const older = await sceneIn("ACTIVE", "Fixture older active scene");
    const newer = await sceneIn("ACTIVE", "Fixture newer active scene");
    // A touch after the newer one was made, so updated_at and not the id
    // decides, as it does in the header's selector.
    await db
      .update(tables.storyScenes)
      .set({ sceneTitle: "Fixture older active scene, touched" })
      .where(eq(tables.storyScenes.idStoryScene, older));

    const space = await actions.sa_openRunPlaySpace(mine);

    expect(space.scene).toEqual({
      idStoryScene: older,
      title: "Fixture older active scene, touched",
      status: "ACTIVE",
      text: { description: null, notes: null },
    });
    expect(await currentSceneOf(session)).toBe(older);
    // Chosen at the table, so played in this sitting, as the header would do.
    expect(await sceneRow(older)).toEqual({ status: "ACTIVE", idStorySession: session });
    expect(await sceneRow(newer)).toEqual({ status: "ACTIVE", idStorySession: null });
  });

  it("starts empty with no session, or an ended one", async () => {
    expect(await actions.sa_openRunPlaySpace(mine)).toEqual(EMPTY_SPACE);
    await openSession(mine, scene, "DONE");
    expect(await actions.sa_openRunPlaySpace(mine)).toEqual(EMPTY_SPACE);
  });

  it("keeps a paused session on its scene, but puts a paused session on no scene onto none", async () => {
    await openSession(mine, scene, "SUSPENDED");
    expect((await actions.sa_openRunPlaySpace(mine)).scene?.idStoryScene).toBe(scene);

    const session = await openSession(mine, null, "SUSPENDED");
    await sceneIn("ACTIVE", "Fixture active scene during a pause");
    expect(await actions.sa_openRunPlaySpace(mine)).toEqual(EMPTY_SPACE);
    expect(await currentSceneOf(session)).toBeNull();
  });

  it("gives nothing to anyone but the storyteller, and nothing for an unusable id", async () => {
    await openSession(theirs, theirScene);
    expect(await actions.sa_openRunPlaySpace(theirs)).toEqual(EMPTY_SPACE);
    expect(await actions.sa_openRunPlaySpace(2147483648)).toEqual(EMPTY_SPACE);
  });

  it("shows the scene's cover in its play space", async () => {
    await openSession(mine, scene);
    const [cover] = await db
      .insert(tables.attachments)
      .values({
        idStory: mine,
        status: "READY",
        url: "https://x.test/fixture-docks.png",
        idCreatedByUser: testUser,
      })
      .returning({ id: tables.attachments.idAttachment });
    // The scene's cover is its use of the picture, tagged cover.
    await db.insert(tables.attachmentUses).values({
      idAttachment: cover.id,
      kind: "STORY_SCENE",
      idExternal: scene,
      tags: ["cover"],
      idCreatedByUser: testUser,
    });

    expect((await actions.sa_openRunPlaySpace(mine)).coverUrl).toBe(
      "https://x.test/fixture-docks.png",
    );
    await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, cover.id));
  });

  it("writes up a scene's description and notes from the panel behind its title", async () => {
    const target = await sceneIn("COMPLETE", "Fixture scene to write up");
    const textOf = async () =>
      (
        await db
          .select({
            description: tables.storyScenes.sceneDescription,
            notes: tables.storyScenes.notes,
          })
          .from(tables.storyScenes)
          .where(eq(tables.storyScenes.idStoryScene, target))
      )[0];

    // Trimmed, and a complete scene takes it: notes are written once it is done.
    expect(
      await actions.sa_setSceneText(mine, target, {
        description: "  Fog on the water. ",
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
    // Empty is null, as the columns hold it.
    expect(await actions.sa_setSceneText(mine, target, { description: "", notes: " " })).toEqual({
      ok: true,
      text: { description: null, notes: null },
    });

    expect(
      await actions.sa_setSceneText(mine, target, { description: "x".repeat(8001), notes: "" }),
    ).toEqual({
      ok: false,
      errors: { description: "Keep the description under 8000 characters." },
    });
    expect(
      await actions.sa_setSceneText(theirs, theirScene, { description: "Mine now", notes: "" }),
    ).toEqual({ ok: false, errors: { root: "That scene is not part of this story." } });
  });

  it("renames the scene from the panel when a title comes with the text, and leaves the name alone when none does", async () => {
    const target = await sceneIn("COMPLETE", "Fixture scene to rename");
    const titleOf = async () =>
      (
        await db
          .select({ title: tables.storyScenes.sceneTitle })
          .from(tables.storyScenes)
          .where(eq(tables.storyScenes.idStoryScene, target))
      )[0].title;

    // The storyboard's card: title, description and notes together, the
    // title trimmed and handed back for the card, on a complete scene too.
    expect(
      await actions.sa_setSceneText(mine, target, {
        title: " Fixture scene renamed ",
        description: "Fog.",
        notes: "",
      }),
    ).toEqual({
      ok: true,
      text: { description: "Fog.", notes: null },
      title: "Fixture scene renamed",
    });
    expect(await titleOf()).toBe("Fixture scene renamed");

    // The tables' panel: no title among the values, so the name stays.
    expect(
      await actions.sa_setSceneText(mine, target, { description: "Mist.", notes: "" }),
    ).toEqual({ ok: true, text: { description: "Mist.", notes: null } });
    expect(await titleOf()).toBe("Fixture scene renamed");

    // A title given has to be a title, as the scene forms require.
    expect(
      await actions.sa_setSceneText(mine, target, { title: "  ", description: "", notes: "" }),
    ).toEqual({ ok: false, errors: { title: "Please give the scene a title." } });
    expect(await titleOf()).toBe("Fixture scene renamed");
  });

  it("sets a scene's stacks, and the story's default stacks only when asked", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for stacks");
    const sceneTags = async () =>
      (
        await db
          .select({ tags: tables.storyScenes.tags })
          .from(tables.storyScenes)
          .where(eq(tables.storyScenes.idStoryScene, target))
      )[0].tags;
    const storyTags = async () =>
      (
        await db
          .select({ tags: tables.stories.standardTags })
          .from(tables.stories)
          .where(eq(tables.stories.idStory, mine))
      )[0].tags;
    const before = await storyTags();

    try {
      expect(
        await actions.sa_setSceneStacks(mine, target, {
          tags: ["scene", " Docks "],
          saveForStory: false,
        }),
      ).toEqual({ ok: true, tags: ["scene", "Docks"] });
      expect(await sceneTags()).toEqual(["scene", "Docks"]);
      expect(await storyTags()).toEqual(before);

      await actions.sa_setSceneStacks(mine, target, { tags: ["Docks"], saveForStory: true });
      expect(await storyTags()).toEqual(["Docks"]);
      // A scene made afterwards starts with the story's stacks.
      const later = await sceneIn("PENDING", "Fixture scene after the story's stacks");
      expect(
        (
          await db
            .select({ tags: tables.storyScenes.tags })
            .from(tables.storyScenes)
            .where(eq(tables.storyScenes.idStoryScene, later))
        )[0].tags,
      ).toEqual(["Docks"]);

      expect(
        await actions.sa_setSceneStacks(mine, target, {
          tags: ["Docks", "docks"],
          saveForStory: false,
        }),
      ).toEqual({ ok: false, errors: { tags: "Each stack needs its own name." } });
      expect(
        await actions.sa_setSceneStacks(theirs, theirScene, { tags: [], saveForStory: false }),
      ).toEqual({ ok: false, errors: { root: "That scene is not part of this story." } });
    } finally {
      // Later scenes in this file take the story's stacks, so put them back.
      await db
        .update(tables.stories)
        .set({ standardTags: before })
        .where(eq(tables.stories.idStory, mine));
    }
  });

  it("widens a stack for every table, the Default stack as an empty name, and narrows it again", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for wide stacks");
    const wideTags = async () =>
      (
        await db
          .select({ wideTags: tables.storyScenes.wideTags })
          .from(tables.storyScenes)
          .where(eq(tables.storyScenes.idStoryScene, target))
      )[0].wideTags;
    mocks.published.publishSceneChanged.mock.resetCalls();

    expect(await actions.sa_setStackWide(mine, target, { tag: "Docks", wide: true })).toEqual({
      ok: true,
      wideTags: ["Docks"],
    });
    expect(await wideTags()).toEqual(["Docks"]);
    // Widening a stack again changes nothing, and the Default stack (tag
    // null) is kept as "", which no real stack can be called.
    expect(await actions.sa_setStackWide(mine, target, { tag: "Docks", wide: true })).toEqual({
      ok: true,
      wideTags: ["Docks"],
    });
    expect(await actions.sa_setStackWide(mine, target, { tag: null, wide: true })).toEqual({
      ok: true,
      wideTags: ["Docks", ""],
    });
    expect(await actions.sa_setStackWide(mine, target, { tag: "Docks", wide: false })).toEqual({
      ok: true,
      wideTags: [""],
    });
    expect(await wideTags()).toEqual([""]);
    // Every table hears the scene changed and reads it afresh, the wide
    // stacks included (sa_getPlayScene, spaceFor).
    expect(mocks.published.publishSceneChanged.mock.callCount()).toBe(4);
    expect((await actions.sa_getScenePlaySpace(mine, target))?.wideTags).toEqual([""]);

    expect(await actions.sa_setStackWide(mine, target, { tag: "Docks", wide: "yes" })).toEqual({
      ok: false,
      error: "That could not be changed. Try again.",
    });
    expect(await actions.sa_setStackWide(theirs, theirScene, { tag: null, wide: true })).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
  });

  it("keeps a widened stack wide through a rename, and forgets one taken away", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for wide renamed stacks");
    const wideTags = async () =>
      (
        await db
          .select({ wideTags: tables.storyScenes.wideTags })
          .from(tables.storyScenes)
          .where(eq(tables.storyScenes.idStoryScene, target))
      )[0].wideTags;
    await actions.sa_setStackWide(mine, target, { tag: "scene", wide: true });
    await actions.sa_setStackWide(mine, target, { tag: null, wide: true });

    await actions.sa_setSceneStacks(mine, target, {
      tags: ["Docks", "elements"],
      renames: [{ from: "scene", to: "Docks" }],
      saveForStory: false,
    });
    // The Default stack's "" stays: it is no tag, so no change of tags
    // takes it away.
    expect(await wideTags()).toEqual(["Docks", ""]);

    await actions.sa_setSceneStacks(mine, target, { tags: ["elements"], saveForStory: false });
    expect(await wideTags()).toEqual([""]);
  });

  it("widens a stack of a complete scene: how it is shown is not what is in it", async () => {
    const done = await sceneIn("COMPLETE", "Fixture complete scene for wide stacks");
    expect(await actions.sa_setStackWide(mine, done, { tag: "scene", wide: true })).toEqual({
      ok: true,
      wideTags: ["scene"],
    });
  });

  it("renames a scene's stacks, taking the links filed under them along, even in a swap", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for renamed stacks");
    // Each element's stack tags; the rows' order is the database's to choose.
    const filed = async () =>
      Object.fromEntries((await linksOf(target)).map((link) => [link.idElement, link.tags]));
    await links.sa_linkSceneElement(mine, target, zed, { tag: DEFAULT_TAGS[0] });
    await links.sa_linkSceneElement(mine, target, abbey, { tag: DEFAULT_TAGS[1] });

    // elements and scene swap names, so each link must end under the other.
    expect(
      await actions.sa_setSceneStacks(mine, target, {
        tags: ["scene", "elements"],
        renames: [
          { from: "elements", to: "scene" },
          { from: "scene", to: "elements" },
        ],
        saveForStory: false,
      }),
    ).toEqual({ ok: true, tags: ["scene", "elements"] });
    expect(await filed()).toEqual({ [zed]: ["scene"], [abbey]: ["elements"] });

    await actions.sa_setSceneStacks(mine, target, {
      tags: ["Docks", "elements"],
      renames: [{ from: "scene", to: "Docks" }],
      saveForStory: false,
    });
    expect(await filed()).toEqual({ [zed]: ["Docks"], [abbey]: ["elements"] });

    // A rename of a stack the scene does not have: the list is out of date.
    expect(
      await actions.sa_setSceneStacks(mine, target, {
        tags: ["Harbour", "elements"],
        renames: [{ from: "weather", to: "Harbour" }],
        saveForStory: false,
      }),
    ).toEqual({ ok: false, errors: { tags: "That stack is no longer one of the scene's tags." } });
  });
});
