// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. `before` makes a story the seed
// user owns, with a scene, three elements of which two are in the scene, and
// a story belonging to someone else. Each test opens the session it needs;
// `beforeEach` clears them. Fixture ids are positive and left to the
// database, so they never collide with the seed's negative ids.
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { and, eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { elementIdOf } from "@/lib/run";
import { makeTestUser, removeTestUser } from "@/test/test-user";

loadEnvConfig(process.cwd());

// Signed in as a test user of its own, never a real account (test-user.ts).
const TEST_USER_EMAIL = "run-id-actions@example.test";
let testUser = "";
const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: testUser } }));

// What each write tells the players' table, mocked so the tests see which
// helper an action reached for; what the helpers send is their own test's
// business (lib/realtime/publish-scene.test.ts).
const published = {
  publishSceneElement: mock.fn(async (..._args: unknown[]) => {}),
  publishSceneElementPulse: mock.fn(async (..._args: unknown[]) => {}),
  publishElementChanged: mock.fn(async (..._args: unknown[]) => {}),
  publishSceneElementRemoved: mock.fn(async (..._args: unknown[]) => {}),
  publishSceneChanged: mock.fn(async (..._args: unknown[]) => {}),
  publishSessionUpdated: mock.fn(async (..._args: unknown[]) => {}),
};

// The chat's divider goes out over the broker; caught here, and run at once.
const publishChat = mock.fn(async (_idStory: number, _chat: unknown) => {});
const publishLater = (work: () => Promise<void>) => void work();
// The head count a removed player's table is told; caught, and run at once.
const publishTableCount = mock.fn(async (_idStory: number, _atTable: number) => {});
const LINK_GUEST_EMAIL = "run-id-actions-link-guest@example.test";

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

const EMPTY = { scene: null, tags: [], coverUrl: null, inPlay: [] };
// The tags a new scene of a story with no standard tags and no system starts
// with (db/functions/standard_tags_for_story.sql).
const DEFAULT_TAGS = ["elements", "scene"];

describe("run table actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    mock.module("@/lib/realtime/publish-scene", { namedExports: published });
    mock.module("@/lib/realtime/publish", {
      namedExports: { publishChat, publishLater, publishTableCount },
    });
    ({ db, schema: tables } = await import("@/db"));
    testUser = await makeTestUser(db, tables, TEST_USER_EMAIL);
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
        { title: "Run table fixture — mine", idCreatedByUser: testUser },
        { title: "Run table fixture — theirs", idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.stories.idStory });

    [{ id: scene }, { id: theirScene }] = await db
      .insert(tables.storyScenes)
      .values([
        { idStory: mine, sceneTitle: "Fixture scene at the docks", idCreatedByUser: testUser },
        { idStory: theirs, sceneTitle: "Fixture scene of theirs", idCreatedByUser: otherUserId },
      ])
      .returning({ id: tables.storyScenes.idStoryScene });

    // A place named before the person, so the order shown is the kinds'
    // rather than the names'; and one element left out of the scene.
    [{ id: abbey }, { id: zed }] = await db
      .insert(tables.elements)
      .values([
        { idStory: mine, kind: "PLACE", name: "Fixture Abbey", idCreatedByUser: testUser },
        {
          idStory: mine,
          kind: "PERSON",
          name: "Fixture Zed",
          initialName: "Fixture hooded figure",
          title: "Harbourmaster",
          idCreatedByUser: testUser,
        },
        { idStory: mine, kind: "THING", name: "Fixture Lantern", idCreatedByUser: testUser },
      ])
      .returning({ id: tables.elements.idElement });

    await db.insert(tables.sceneElements).values([
      { idStoryScene: scene, idElement: abbey, idCreatedByUser: testUser },
      { idStoryScene: scene, idElement: zed, tags: ["scene"], idCreatedByUser: testUser },
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
    await removeTestUser(db, tables, TEST_USER_EMAIL);
    await removeTestUser(db, tables, LINK_GUEST_EMAIL);
    await db.$client.end();
  });

  async function openSession(
    idStory: number,
    idStoryScene: number | null,
    status = "OPEN",
  ): Promise<number> {
    const [session] = await db
      .insert(tables.storySessions)
      .values({ idStory, status, idStoryScene, idCreatedByUser: testUser })
      .returning({ id: tables.storySessions.idStorySession });
    await db
      .update(tables.stories)
      .set({ idStorySession: session.id })
      .where(eq(tables.stories.idStory, idStory));
    return session.id;
  }

  // A scene of the test user's story in the given status, for the selector's
  // tests; they go with the story in `after`.
  async function sceneIn(status: string, title = `Fixture ${status.toLowerCase()} scene`) {
    const [row] = await db
      .insert(tables.storyScenes)
      .values({ idStory: mine, sceneTitle: title, status, idCreatedByUser: testUser })
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
      coverUrl: null,
      inPlay: [],
    });
    // Only read: the scene is not made active or recorded as played.
    expect(await sceneRow(pending)).toEqual({ status: "PENDING", idStorySession: null });

    const space = await actions.sa_getScenePlaySpace(mine, scene);
    expect(space.inPlay.map(elementIdOf)).toEqual([zed, abbey]);
  });

  it("reads no play space for another story's scene, nor for anyone but its storyteller", async () => {
    expect(await actions.sa_getScenePlaySpace(mine, theirScene)).toEqual(EMPTY);
    expect(await actions.sa_getScenePlaySpace(theirs, theirScene)).toEqual(EMPTY);
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

  it("creates a scene from the live-edit page without moving the session, playing or not", async () => {
    const session = await openSession(mine, scene);

    const result = await actions.sa_createLiveScene(mine, {
      title: "  Fixture scene made to prepare ",
      description: "Two guards.",
    });

    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
    const created = result.space.scene!;
    expect(created).toMatchObject({ title: "Fixture scene made to prepare", status: "PENDING" });
    expect(await sceneRow(created.idStoryScene)).toEqual({
      status: "PENDING",
      idStorySession: null,
    });
    // Still on the scene it was on.
    expect(await currentSceneOf(session)).toBe(scene);

    expect(await actions.sa_createLiveScene(mine, { title: "", description: "" })).toEqual({
      ok: false,
      errors: { title: "Please give the scene a title." },
    });
    await expect(
      actions.sa_createLiveScene(theirs, { title: "Theirs", description: "" }),
    ).rejects.toThrow();
  });

  it("puts the session's current scene's tags and elements in play, by kind", async () => {
    await openSession(mine, scene);

    const space = await actions.sa_getRunPlaySpace(mine);
    expect(space.scene).toEqual({
      idStoryScene: scene,
      title: "Fixture scene at the docks",
      status: "PENDING",
      text: { description: null, notes: null },
    });
    expect(space.tags).toEqual(DEFAULT_TAGS);
    expect(space.coverUrl).toBeNull();
    expect(space.inPlay).toEqual([
      {
        key: `PERSON:${zed}`,
        kind: "PERSON",
        // Its initial name: the name it goes by when it first turns up.
        label: "Fixture hooded figure",
        detail: "Harbourmaster",
        imageUrl: null,
        sceneTags: ["scene"],
        sceneStatus: "READY",
        showInfo: true,
        fields: {
          initial_name: "Fixture hooded figure",
          name: "Fixture Zed",
          title: "Harbourmaster",
        },
        showing: "initial_name",
        link: null,
      },
      {
        key: `PLACE:${abbey}`,
        kind: "PLACE",
        label: "Fixture Abbey",
        detail: null,
        imageUrl: null,
        sceneTags: [],
        sceneStatus: "READY",
        showInfo: true,
        // No initial name, so the default shows the name.
        fields: { initial_name: null, name: "Fixture Abbey", title: null },
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
    expect(await actions.sa_getRunPlaySpace(mine)).toEqual(EMPTY);
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

    const space = await actions.sa_getRunPlaySpace(mine);

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
    expect(await actions.sa_getRunPlaySpace(mine)).toEqual(EMPTY);
    await openSession(mine, scene, "DONE");
    expect(await actions.sa_getRunPlaySpace(mine)).toEqual(EMPTY);
  });

  it("keeps a paused session on its scene, but puts a paused session on no scene onto none", async () => {
    await openSession(mine, scene, "SUSPENDED");
    expect((await actions.sa_getRunPlaySpace(mine)).scene?.idStoryScene).toBe(scene);

    const session = await openSession(mine, null, "SUSPENDED");
    await sceneIn("ACTIVE", "Fixture active scene during a pause");
    expect(await actions.sa_getRunPlaySpace(mine)).toEqual(EMPTY);
    expect(await currentSceneOf(session)).toBeNull();
  });

  it("gives nothing to anyone but the storyteller, and nothing for an unusable id", async () => {
    await openSession(theirs, theirScene);
    expect(await actions.sa_getRunPlaySpace(theirs)).toEqual(EMPTY);
    expect(await actions.sa_getRunPlaySpace(2147483648)).toEqual(EMPTY);
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

    expect((await actions.sa_getRunPlaySpace(mine)).coverUrl).toBe(
      "https://x.test/fixture-docks.png",
    );
    await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, cover.id));
  });

  async function linksOf(idStoryScene: number) {
    return db
      .select({ idElement: tables.sceneElements.idElement, tags: tables.sceneElements.tags })
      .from(tables.sceneElements)
      .where(eq(tables.sceneElements.idStoryScene, idStoryScene));
  }

  // Whether one link shows the players its element's description, or
  // undefined for no link.
  async function showInfoOf(idStoryScene: number, idElement: number) {
    const [row] = await db
      .select({ showInfo: tables.sceneElements.showInfo })
      .from(tables.sceneElements)
      .where(
        and(
          eq(tables.sceneElements.idStoryScene, idStoryScene),
          eq(tables.sceneElements.idElement, idElement),
        ),
      );
    return row?.showInfo;
  }

  // The element form's fields, blank but for what a test sets.
  const form = (values: Record<string, string>) => ({
    kind: "PLACE",
    name: "",
    initialName: "",
    title: "",
    description: "",
    notes: "",
    url: "",
    urlText: "",
    status: "PENDING",
    sceneStatus: "READY",
    sceneUrl: "",
    sceneUrlText: "",
    ...values,
  });

  it("makes a new element from a stack's + and links it under the stack's tag", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for new elements");

    const result = await actions.sa_createSceneElement(
      mine,
      target,
      "scene",
      form({
        name: "  Fixture tide pool ",
        initialName: "Fixture pool",
        notes: "Cold.",
        status: "READY",
        sceneStatus: "INVISIBLE",
      }),
    );

    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
    expect(result.item).toMatchObject({
      kind: "PLACE",
      label: "Fixture pool",
      showing: "initial_name",
      link: null,
      detail: null,
      sceneTags: ["scene"],
      sceneStatus: "INVISIBLE",
    });
    const idElement = Number(result.item.key.split(":")[1]);
    const [element] = await db
      .select({
        idStory: tables.elements.idStory,
        name: tables.elements.name,
        notes: tables.elements.notes,
        status: tables.elements.status,
      })
      .from(tables.elements)
      .where(eq(tables.elements.idElement, idElement));
    expect(element).toEqual({
      idStory: mine,
      name: "Fixture tide pool",
      notes: "Cold.",
      status: "READY",
    });
    expect(await linksOf(target)).toEqual([{ idElement, tags: ["scene"] }]);

    // No tag, as the library's + sends: the scene's first tag, the first
    // stack's, as the library's arrow gives.
    const fromLibrary = await actions.sa_createSceneElement(
      mine,
      target,
      null,
      form({ kind: "THING", name: "Fixture net", title: "Torn" }),
    );
    expect(fromLibrary.ok && fromLibrary.item.sceneTags).toEqual([DEFAULT_TAGS[0]]);
    expect(fromLibrary.ok && fromLibrary.item.sceneStatus).toBe("READY");

    // The Default stack of a scene with no tags links with none.
    const untagged = await sceneIn("ACTIVE", "Fixture scene with no tags to create in");
    await db
      .update(tables.storyScenes)
      .set({ tags: [] })
      .where(eq(tables.storyScenes.idStoryScene, untagged));
    const plain = await actions.sa_createSceneElement(
      mine,
      untagged,
      null,
      form({ kind: "THING", name: "Fixture rope" }),
    );
    expect(plain.ok && plain.item.sceneTags).toEqual([]);
  });

  it("refuses a new element with no name, a status off its workflow, a tag the scene lacks, or another's scene", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for refusals");

    expect(await actions.sa_createSceneElement(mine, target, "scene", form({ name: " " }))).toEqual(
      { ok: false, errors: { name: "Please give the element a name." } },
    );
    expect(
      await actions.sa_createSceneElement(
        mine,
        target,
        "scene",
        form({ name: "Fixture odd", status: "INVISIBLE", sceneStatus: "PENDING" }),
      ),
    ).toEqual({
      ok: false,
      errors: {
        status: "Choose one of the element's statuses.",
        sceneStatus: "Choose one of the scene's statuses.",
      },
    });
    expect(
      await actions.sa_createSceneElement(mine, target, "weather", form({ name: "Fixture fog" })),
    ).toEqual({ ok: false, errors: { root: "That stack is no longer one of the scene's tags." } });
    await expect(
      actions.sa_createSceneElement(theirs, theirScene, null, form({ name: "Fixture intrusion" })),
    ).rejects.toThrow();
    expect(await linksOf(target)).toEqual([]);
  });

  it("carries an element's link, and the link's own for the scene in front of it", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene with links");
    const created = await actions.sa_createSceneElement(
      mine,
      target,
      "elements",
      form({
        name: "Fixture chart",
        url: "https://example.com/chart",
        urlText: "The chart",
        sceneUrl: "https://example.com/chart#docks",
        sceneUrlText: "The docks on the chart",
      }),
    );
    if (!created.ok) throw new Error("not created");
    const idElement = elementIdOf(created.item);
    // The scene's link leads on the pill.
    expect(created.item.link).toEqual({
      url: "https://example.com/chart#docks",
      text: "The docks on the chart",
    });
    const detail = await actions.sa_getElementDetail(mine, idElement, target);
    expect(detail?.element).toMatchObject({
      url: "https://example.com/chart",
      urlText: "The chart",
    });
    expect(detail?.link).toMatchObject({
      url: "https://example.com/chart#docks",
      urlText: "The docks on the chart",
    });

    // Without one of its own, the pill falls back to the element's; with
    // no words, the address is the tooltip.
    const edited = await actions.sa_updateSceneElement(
      mine,
      target,
      idElement,
      form({ name: "Fixture chart", url: "https://example.com/chart", sceneStatus: "READY" }),
    );
    expect(edited.ok && edited.item.link).toEqual({
      url: "https://example.com/chart",
      text: "https://example.com/chart",
    });
    expect((await actions.sa_getElementDetail(mine, idElement, target))?.link?.url).toBeNull();

    // A link that is not a web address is refused by the form's field.
    expect(
      await actions.sa_updateSceneElement(
        mine,
        target,
        idElement,
        form({ name: "Fixture chart", url: "chart.html", sceneStatus: "READY" }),
      ),
    ).toEqual({
      ok: false,
      errors: { url: "Please enter a full web address, starting with http:// or https://." },
    });
  });

  it("edits an element and its place in the scene from the info popover", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for edits");
    const created = await actions.sa_createSceneElement(
      mine,
      target,
      "scene",
      form({ name: "Fixture lighthouse" }),
    );
    if (!created.ok) throw new Error("not created");
    const idElement = Number(created.item.key.split(":")[1]);

    const result = await actions.sa_updateSceneElement(
      mine,
      target,
      idElement,
      form({
        name: "Fixture lighthouse",
        initialName: "Fixture light",
        title: "Unlit",
        description: "Tall.",
        status: "INACTIVE",
        sceneStatus: "DISABLED",
      }),
    );

    expect(result).toEqual({
      ok: true,
      item: {
        key: `PLACE:${idElement}`,
        kind: "PLACE",
        label: "Fixture light",
        detail: "Unlit",
        imageUrl: null,
        sceneTags: ["scene"],
        sceneStatus: "DISABLED",
        showInfo: true,
        fields: { initial_name: "Fixture light", name: "Fixture lighthouse", title: "Unlit" },
        showing: "initial_name",
        link: null,
      },
    });
    const detail = await actions.sa_getElementDetail(mine, idElement, target);
    expect(detail).toMatchObject({
      element: { description: "Tall.", status: "INACTIVE", initialName: "Fixture light" },
      link: { status: "DISABLED", tags: ["scene"] },
    });

    // Nothing linked, or another's scene.
    const elsewhere = await sceneIn("ACTIVE", "Fixture scene without the lighthouse");
    expect(
      await actions.sa_updateSceneElement(mine, elsewhere, idElement, form({ name: "X" })),
    ).toEqual({ ok: false, errors: { root: "That element is not in this scene." } });
    await expect(
      actions.sa_updateSceneElement(theirs, theirScene, idElement, form({ name: "X" })),
    ).rejects.toThrow();
  });

  it("links a library element as invisible with the Add as invisible switch", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for hidden links");

    const result = await actions.sa_linkSceneElement(mine, target, abbey, { hidden: true });
    expect(result.ok && result.item.sceneStatus).toBe("INVISIBLE");
  });

  it("links a library element with its info kept back from the Add showing info switch", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for links without info");

    const result = await actions.sa_linkSceneElement(mine, target, abbey, { showInfo: false });
    expect(result.ok && result.item.showInfo).toBe(false);
    expect(await showInfoOf(target, abbey)).toBe(false);

    // Already linked, the link keeps what it has.
    const again = await actions.sa_linkSceneElement(mine, target, abbey, { showInfo: true });
    expect(again.ok && again.item.showInfo).toBe(false);
  });

  it("makes a new element with its info kept back, and sets whether the players see it", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for new elements without info");
    const made = await actions.sa_createSceneElement(mine, target, null, {
      ...form({ kind: "THING", name: "Fixture lantern" }),
      showInfo: false,
    });
    expect(made.ok && made.item.showInfo).toBe(false);
    const idElement = made.ok ? elementIdOf(made.item) : 0;
    expect(await showInfoOf(target, idElement)).toBe(false);

    expect(await actions.sa_setSceneElementShowInfo(mine, target, idElement, true)).toEqual({
      ok: true,
      showInfo: true,
    });
    expect(await showInfoOf(target, idElement)).toBe(true);
    expect(await actions.sa_setSceneElementShowInfo(mine, target, abbey, false)).toEqual({
      ok: false,
      error: "That element is not in this scene.",
    });
    expect(await actions.sa_setSceneElementShowInfo(theirs, theirScene, abbey, false)).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
  });

  it("sends the tack's pulse to the players without writing anything, and refuses it where a write would be", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for pulses");
    await actions.sa_linkSceneElement(mine, target, zed);
    published.publishSceneElementPulse.mock.resetCalls();

    expect(
      await actions.sa_pulseSceneElement(mine, target, zed, { action: "preview.open" }),
    ).toEqual({ ok: true });
    expect(
      await actions.sa_pulseSceneElement(mine, target, zed, { action: "preview.close" }),
    ).toEqual({ ok: true });
    expect(published.publishSceneElementPulse.mock.calls.map((call) => call.arguments)).toEqual([
      [mine, target, zed, { action: "preview.open" }],
      [mine, target, zed, { action: "preview.close" }],
    ]);
    // Nothing of it reaches the row.
    const [row] = await db
      .select({
        showImage: tables.sceneElements.showImage,
        updatedAt: tables.sceneElements.updatedAt,
      })
      .from(tables.sceneElements)
      .where(
        and(eq(tables.sceneElements.idStoryScene, target), eq(tables.sceneElements.idElement, zed)),
      );
    expect(row.showImage).toBe(false);

    const [lantern] = await db
      .select({ id: tables.elements.idElement })
      .from(tables.elements)
      .where(and(eq(tables.elements.idStory, mine), eq(tables.elements.name, "Fixture Lantern")));
    expect(await actions.sa_pulseSceneElement(mine, target, zed, { action: "dice.roll" })).toEqual({
      ok: false,
      error: "That is not something the players' table answers.",
    });
    expect(
      await actions.sa_pulseSceneElement(mine, target, lantern.id, { action: "preview.open" }),
    ).toEqual({ ok: false, error: "That element is not in this scene." });
    expect(
      await actions.sa_pulseSceneElement(theirs, theirScene, abbey, { action: "preview.open" }),
    ).toEqual({ ok: false, error: "That scene is not part of this story." });
    expect(published.publishSceneElementPulse.mock.calls).toHaveLength(2);
  });

  it("links a library element under the scene's first tag, and leaves an existing link as it is", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for links");

    const result = await actions.sa_linkSceneElement(mine, target, abbey);
    expect(result).toEqual({
      ok: true,
      item: {
        key: `PLACE:${abbey}`,
        kind: "PLACE",
        label: "Fixture Abbey",
        detail: null,
        imageUrl: null,
        // The first of the scene's tags, the first stack's.
        sceneTags: [DEFAULT_TAGS[0]],
        sceneStatus: "READY",
        showInfo: true,
        fields: { initial_name: null, name: "Fixture Abbey", title: null },
        showing: "initial_name",
        link: null,
      },
    });
    expect(await linksOf(target)).toEqual([{ idElement: abbey, tags: [DEFAULT_TAGS[0]] }]);

    // A scene with no tags has only the Default stack, so no tag to give.
    const untagged = await sceneIn("ACTIVE", "Fixture scene with no tags");
    await db
      .update(tables.storyScenes)
      .set({ tags: [] })
      .where(eq(tables.storyScenes.idStoryScene, untagged));
    const plain = await actions.sa_linkSceneElement(mine, untagged, abbey);
    expect(plain.ok && plain.item.sceneTags).toEqual([]);

    // Zed is in the fixture scene under "scene", and stays so.
    const again = await actions.sa_linkSceneElement(mine, scene, zed);
    expect(again.ok && again.item.sceneTags).toEqual(["scene"]);
  });

  it("links no element of another story, nor into another's scene", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for bad links");
    const [stranger] = await db
      .insert(tables.elements)
      .values({
        idStory: theirs,
        kind: "PERSON",
        name: "Fixture stranger",
        idCreatedByUser: otherUserId,
      })
      .returning({ id: tables.elements.idElement });

    expect(await actions.sa_linkSceneElement(mine, target, stranger.id)).toEqual({
      ok: false,
      error: "That element is not part of this story.",
    });
    expect(await actions.sa_linkSceneElement(theirs, theirScene, stranger.id)).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
    expect(await linksOf(target)).toEqual([]);
  });

  it("moves an element's link to any of the workflow's statuses from the status menu", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for the status menu");
    await actions.sa_linkSceneElement(mine, target, abbey);
    const statusOf = async () =>
      (
        await db
          .select({ status: tables.sceneElements.status })
          .from(tables.sceneElements)
          .where(
            and(
              eq(tables.sceneElements.idStoryScene, target),
              eq(tables.sceneElements.idElement, abbey),
            ),
          )
      )[0].status;

    for (const status of ["TAPPED", "INVISIBLE", "DISABLED", "READY"]) {
      expect(await actions.sa_setSceneElementStatus(mine, target, abbey, status)).toEqual({
        ok: true,
        status,
      });
      expect(await statusOf()).toBe(status);
    }
    // Already there, it stays as it is.
    expect(await actions.sa_setSceneElementStatus(mine, target, abbey, "READY")).toEqual({
      ok: true,
      status: "READY",
    });
    expect(await actions.sa_setSceneElementStatus(mine, target, abbey, "INITIAL")).toEqual({
      ok: false,
      error: "Choose one of READY, INVISIBLE, TAPPED, DISABLED.",
    });
    expect(await statusOf()).toBe("READY");
  });

  it("moves nothing that is not linked to the scene, nor in another's scene", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene with nothing in it");
    expect(await actions.sa_setSceneElementStatus(mine, target, abbey, "INVISIBLE")).toEqual({
      ok: false,
      error: "That element is not in this scene.",
    });
    expect(await actions.sa_setSceneElementStatus(theirs, theirScene, abbey, "INVISIBLE")).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
  });

  it("sets which field a pill shows in one scene, and the play space shows it", async () => {
    const showingOf = async (idStoryScene: number) =>
      (
        await db
          .select({ showing: tables.sceneElements.elementShowing })
          .from(tables.sceneElements)
          .where(
            and(
              eq(tables.sceneElements.idStoryScene, idStoryScene),
              eq(tables.sceneElements.idElement, zed),
            ),
          )
      )[0].showing;

    expect(await actions.sa_setSceneElementShowing(mine, scene, zed, "title")).toEqual({
      ok: true,
      showing: "title",
    });
    expect(await showingOf(scene)).toBe("title");
    await openSession(mine, scene);
    const titled = (await actions.sa_getRunPlaySpace(mine)).inPlay.find(
      (item) => item.key === `PERSON:${zed}`,
    );
    // The title is the label, so it is not repeated underneath.
    expect(titled).toMatchObject({ label: "Harbourmaster", detail: null, showing: "title" });

    expect(await actions.sa_setSceneElementShowing(mine, scene, zed, "name")).toEqual({
      ok: true,
      showing: "name",
    });
    const named = (await actions.sa_getRunPlaySpace(mine)).inPlay.find(
      (item) => item.key === `PERSON:${zed}`,
    );
    expect(named).toMatchObject({ label: "Fixture Zed", detail: "Harbourmaster" });

    await actions.sa_setSceneElementShowing(mine, scene, zed, "initial_name");
    expect(await showingOf(scene)).toBe("initial_name");
  });

  it("refuses a field it does not know, an unlinked element and another's scene", async () => {
    expect(await actions.sa_setSceneElementShowing(mine, scene, zed, "notes")).toEqual({
      ok: false,
      error: "Choose the initial name, the name or the title.",
    });
    const empty = await sceneIn("ACTIVE", "Fixture scene without a showing");
    expect(await actions.sa_setSceneElementShowing(mine, empty, zed, "name")).toEqual({
      ok: false,
      error: "That element is not in this scene.",
    });
    expect(await actions.sa_setSceneElementShowing(theirs, theirScene, zed, "name")).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
  });

  it("gives one of the story's elements for the library's info popover", async () => {
    expect(await actions.sa_getElementDetail(mine, zed)).toMatchObject({
      element: {
        idElement: zed,
        kind: "PERSON",
        name: "Fixture Zed",
        initialName: "Fixture hooded figure",
        title: "Harbourmaster",
        tags: [],
      },
      // No scene asked about, so in none.
      link: null,
    });
    expect((await actions.sa_getElementDetail(mine, zed, scene))?.link).toMatchObject({
      tags: ["scene"],
    });
    const empty = await sceneIn("ACTIVE", "Fixture scene Zed is not in");
    expect((await actions.sa_getElementDetail(mine, zed, empty))?.link).toBeNull();
    // Not the caller's story, so nothing, even for an element that exists.
    expect(await actions.sa_getElementDetail(theirs, zed)).toBeNull();
    expect(await actions.sa_getElementDetail(mine, 2147483647)).toBeNull();
  });

  it("renames a session of the story, clearing an empty title", async () => {
    const session = await openSession(mine, null);
    const titleOf = async () =>
      (
        await db
          .select({ title: tables.storySessions.title })
          .from(tables.storySessions)
          .where(eq(tables.storySessions.idStorySession, session))
      )[0].title;

    expect(await actions.sa_setSessionTitle(mine, session, "  The drowned bell ")).toEqual({
      ok: true,
      title: "The drowned bell",
    });
    expect(await titleOf()).toBe("The drowned bell");
    expect(await actions.sa_setSessionTitle(mine, session, "   ")).toEqual({
      ok: true,
      title: null,
    });
    expect(await titleOf()).toBeNull();

    expect(await actions.sa_setSessionTitle(mine, session, "x".repeat(201))).toEqual({
      ok: false,
      error: "Keep the title under 200 characters.",
    });
    // Another's story, or a session of a story other than the one named.
    expect(await actions.sa_setSessionTitle(theirs, session, "Mine now")).toEqual({
      ok: false,
      error: "That session is not part of this story.",
    });
    expect(await titleOf()).toBeNull();
  });

  it("suspends a session left inactive, noting why in its activity_log", async () => {
    const session = await openSession(mine, null);
    published.publishSceneChanged.mock.resetCalls();

    expect(await actions.sa_suspendInactiveSession(mine, session, false)).toEqual({
      ok: true,
      status: "SUSPENDED",
    });
    const [row] = await db
      .select({ status: tables.storySessions.status, log: tables.storySessions.activityLog })
      .from(tables.storySessions)
      .where(eq(tables.storySessions.idStorySession, session));
    expect(row.status).toBe("SUSPENDED");
    const entry = (row.log as Record<string, unknown>[]).find(
      (e) => e.activityCategory === "inactivity_log",
    );
    expect(entry).toMatchObject({
      activityDetails: "suspended for inactivity",
      userId: testUser,
      activityData: { answered: false },
    });
    expect(published.publishSceneChanged.mock.calls.map((c) => c.arguments)).toEqual([[mine]]);

    // Already suspended: nothing moves again.
    expect(await actions.sa_suspendInactiveSession(mine, session, true)).toEqual({
      ok: false,
      error: "That session is not being played.",
    });
  });

  it("suspends no session of another's story, nor one that is not being played", async () => {
    const theirSession = await openSession(theirs, null);
    expect(await actions.sa_suspendInactiveSession(theirs, theirSession, false)).toEqual({
      ok: false,
      error: "That session is not being played.",
    });
    const done = await openSession(mine, null, "DONE");
    expect(await actions.sa_suspendInactiveSession(mine, done, false)).toEqual({
      ok: false,
      error: "That session is not being played.",
    });
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
      await expect(
        actions.sa_setSceneStacks(theirs, theirScene, { tags: [], saveForStory: false }),
      ).rejects.toThrow("That scene is not part of this story.");
    } finally {
      // Later scenes in this file take the story's stacks, so put them back.
      await db
        .update(tables.stories)
        .set({ standardTags: before })
        .where(eq(tables.stories.idStory, mine));
    }
  });

  it("renames a scene's stacks, taking the links filed under them along, even in a swap", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for renamed stacks");
    // Each element's stack tags; the rows' order is the database's to choose.
    const filed = async () =>
      Object.fromEntries((await linksOf(target)).map((link) => [link.idElement, link.tags]));
    await actions.sa_linkSceneElement(mine, target, zed, { tag: DEFAULT_TAGS[0] });
    await actions.sa_linkSceneElement(mine, target, abbey, { tag: DEFAULT_TAGS[1] });

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

  it("links into the stack it is asked for, and refuses one the scene lacks", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene to link into a stack");

    const result = await actions.sa_linkSceneElement(mine, target, abbey, { tag: DEFAULT_TAGS[1] });
    expect(result.ok && result.item.sceneTags).toEqual([DEFAULT_TAGS[1]]);
    expect(await actions.sa_linkSceneElement(mine, target, zed, { tag: "weather" })).toEqual({
      ok: false,
      error: "That stack is no longer one of the scene's tags.",
    });
  });

  it("changes nothing in a complete scene", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene to complete");
    await actions.sa_linkSceneElement(mine, target, zed);
    await db
      .update(tables.storyScenes)
      .set({ status: "COMPLETE" })
      .where(eq(tables.storyScenes.idStoryScene, target));
    const refused = { ok: false, error: "That scene is complete, so nothing in it can change." };

    expect(await actions.sa_linkSceneElement(mine, target, abbey)).toEqual(refused);
    expect(await actions.sa_unlinkSceneElement(mine, target, zed)).toEqual(refused);
    expect(await actions.sa_setSceneElementStatus(mine, target, zed, "INVISIBLE")).toEqual(refused);
    expect(await actions.sa_setSceneElementShowInfo(mine, target, zed, false)).toEqual(refused);
    expect(
      await actions.sa_pulseSceneElement(mine, target, zed, { action: "preview.open" }),
    ).toEqual(refused);
    expect(await actions.sa_setSceneElementShowing(mine, target, zed, "name")).toEqual(refused);
    expect(
      await actions.sa_moveSceneElement(mine, target, zed, DEFAULT_TAGS[0], DEFAULT_TAGS[1]),
    ).toEqual(refused);
    expect(
      await actions.sa_createSceneElement(mine, target, null, form({ name: "Fixture late" })),
    ).toEqual({ ok: false, errors: { root: refused.error } });
    expect(
      await actions.sa_setSceneStacks(mine, target, { tags: [], saveForStory: false }),
    ).toEqual({ ok: false, errors: { tags: refused.error } });
    // Still linked, as it was; reading it still works.
    expect(await linksOf(target)).toEqual([{ idElement: zed, tags: [DEFAULT_TAGS[0]] }]);
    expect((await actions.sa_getElementDetail(mine, zed, target))?.link).not.toBeNull();
  });

  it("sets an element's tags, trimmed, lower-cased and deduplicated", async () => {
    expect(await actions.sa_setElementTags(mine, zed, [" Docks ", "docks", "Harbour"])).toEqual({
      ok: true,
      tags: ["docks", "harbour"],
    });
    const tagsOf = async () => {
      const [row] = await db
        .select({ tags: tables.elements.tags })
        .from(tables.elements)
        .where(eq(tables.elements.idElement, zed));
      return row.tags;
    };
    expect(await tagsOf()).toEqual(["docks", "harbour"]);

    expect(await actions.sa_setElementTags(theirs, zed, ["x"])).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
    expect(await actions.sa_setElementTags(mine, 2 ** 20, ["x"])).toEqual({
      ok: false,
      error: "That element is not part of this story.",
    });
    expect(await actions.sa_setElementTags(mine, zed, ["a".repeat(41)])).toEqual({
      ok: false,
      error: "Keep a tag under 40 characters.",
    });
    expect(await tagsOf()).toEqual(["docks", "harbour"]);

    expect(await actions.sa_setElementTags(mine, zed, [])).toEqual({ ok: true, tags: [] });
    expect(await tagsOf()).toEqual([]);
  });

  it("gives an element one of its story's attachments as its picture", async () => {
    const [mineAttachment, theirAttachment, unfinished, forScene] = await db
      .insert(tables.attachments)
      .values([
        { idStory: mine, status: "READY", url: "https://x.test/zed.png" },
        { idStory: theirs, status: "READY", url: "https://x.test/other.png" },
        { idStory: mine, status: "UPLOADING" },
        { idStory: mine, status: "READY", url: "https://x.test/zed-in-scene.png" },
      ])
      .returning({ id: tables.attachments.idAttachment });

    try {
      expect(await actions.sa_setElementImage(mine, zed, mineAttachment.id)).toEqual({
        ok: true,
        imageUrl: "https://x.test/zed.png",
      });
      // The play space shows it, and the attachment is still the story's.
      await openSession(mine, scene);
      const item = (await actions.sa_getRunPlaySpace(mine)).inPlay.find(
        (each) => each.key === `PERSON:${zed}`,
      );
      expect(item?.imageUrl).toBe("https://x.test/zed.png");

      // A new element can start with one, chosen in its form, and with one
      // for its link in this scene, which is what the pill shows there.
      const target = await sceneIn("ACTIVE", "Fixture scene for a pictured element");
      const pictured = await actions.sa_createSceneElement(mine, target, null, {
        ...form({ name: "Fixture pictured" }),
        idAttachment: mineAttachment.id,
        idSceneAttachment: forScene.id,
      });
      expect(pictured.ok && pictured.item.imageUrl).toBe("https://x.test/zed-in-scene.png");
      const refusal = {
        ok: false,
        errors: { root: "That attachment is not a picture in this story." },
      };
      expect(
        await actions.sa_createSceneElement(mine, target, null, {
          ...form({ name: "Fixture stolen picture" }),
          idAttachment: theirAttachment.id,
        }),
      ).toEqual(refusal);
      expect(
        await actions.sa_createSceneElement(mine, target, null, {
          ...form({ name: "Fixture stolen scene picture" }),
          idSceneAttachment: theirAttachment.id,
        }),
      ).toEqual(refusal);
      if (pictured.ok) {
        const idPictured = Number(pictured.item.key.split(":")[1]);
        // The element's own picture is the element's use; the scene's is
        // the link's, so the detail shows the first and the link the second.
        const detail = await actions.sa_getElementDetail(mine, idPictured, target);
        expect(detail?.element.imageUrl).toBe("https://x.test/zed.png");
        const uses = await db
          .select({ kind: tables.attachmentUses.kind })
          .from(tables.attachmentUses)
          .where(eq(tables.attachmentUses.idAttachment, forScene.id));
        expect(uses).toEqual([{ kind: "SCENE_ELEMENT" }]);
        await db.delete(tables.elements).where(eq(tables.elements.idElement, idPictured));
      }

      // The info popover shows it too, and its − takes it away again.
      expect((await actions.sa_getElementDetail(mine, zed))?.element.imageUrl).toBe(
        "https://x.test/zed.png",
      );
      expect(await actions.sa_setElementImage(mine, zed, null)).toEqual({
        ok: true,
        imageUrl: null,
      });
      expect((await actions.sa_getElementDetail(mine, zed, scene))?.element.imageUrl).toBeNull();

      const refused = { ok: false, error: "That attachment is not a picture in this story." };
      expect(await actions.sa_setElementImage(mine, zed, theirAttachment.id)).toEqual(refused);
      expect(await actions.sa_setElementImage(mine, zed, unfinished.id)).toEqual(refused);
      expect(await actions.sa_setElementImage(theirs, zed, mineAttachment.id)).toEqual({
        ok: false,
        error: "That scene is not part of this story.",
      });
    } finally {
      // The attachments take their uses with them, the element's picture included.
      await db
        .delete(tables.attachments)
        .where(
          inArray(tables.attachments.idAttachment, [
            mineAttachment.id,
            theirAttachment.id,
            unfinished.id,
            forScene.id,
          ]),
        );
    }
  });

  it("edits a story's element from the library, apart from any scene", async () => {
    const [made] = await db
      .insert(tables.elements)
      .values({ idStory: mine, kind: "THING", name: "Fixture lantern", idCreatedByUser: testUser })
      .returning({ id: tables.elements.idElement });
    const values = {
      kind: "THING",
      name: "  Fixture storm lantern ",
      initialName: "",
      title: "Brass",
      description: "",
      notes: "Smells of oil.",
      url: "",
      urlText: "",
      status: "READY",
    };

    const result = await actions.sa_updateStoryElement(mine, made.id, values);
    expect(result).toMatchObject({
      ok: true,
      element: {
        idElement: made.id,
        name: "Fixture storm lantern",
        title: "Brass",
        notes: "Smells of oil.",
        status: "READY",
        initialName: null,
      },
    });

    expect(
      await actions.sa_updateStoryElement(mine, made.id, { ...values, status: "NOT_A_STATUS" }),
    ).toEqual({ ok: false, errors: { status: "Choose one of the element's statuses." } });
    expect(
      await actions.sa_updateStoryElement(mine, made.id, { ...values, name: " " }),
    ).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    await expect(actions.sa_updateStoryElement(theirs, made.id, values)).rejects.toThrow(
      "That scene is not part of this story.",
    );
  });

  it("lists the scene's elements of one kind for the library's Scene only", async () => {
    const list = await actions.sa_listSceneLibraryElements(mine, scene, "PERSON");
    expect(list.map((element) => element.name)).toEqual(["Fixture Zed"]);
    expect(list[0]).toMatchObject({ idElement: zed, title: "Harbourmaster" });
    // Searched the way All is, by the element's search text.
    expect(
      await actions.sa_listSceneLibraryElements(mine, scene, "PERSON", "harbour"),
    ).toHaveLength(1);
    expect(await actions.sa_listSceneLibraryElements(mine, scene, "PERSON", "nowhere")).toEqual([]);
    expect(await actions.sa_listSceneLibraryElements(mine, scene, "THING")).toEqual([]);
    expect(await actions.sa_listSceneLibraryElements(theirs, theirScene, "PERSON")).toEqual([]);
    // Sorted as the library's menu asks, over the element's own columns.
    for (const sort of ["initial_name", "title", "created", "updated"] as const) {
      expect(
        (await actions.sa_listSceneLibraryElements(mine, scene, "PERSON", "", sort)).map(
          (element) => element.name,
        ),
      ).toEqual(["Fixture Zed"]);
    }
    await expect(
      actions.sa_listSceneLibraryElements(mine, scene, "PERSON", "", "colour" as never),
    ).rejects.toThrow();
  });

  it("removes an element from a scene, leaving it in the story", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene to remove from");
    await actions.sa_linkSceneElement(mine, target, abbey);

    expect(await actions.sa_unlinkSceneElement(mine, target, abbey)).toEqual({ ok: true });
    expect(await linksOf(target)).toEqual([]);
    expect(await actions.sa_getElementDetail(mine, abbey, target)).toMatchObject({
      element: { name: "Fixture Abbey" },
      link: null,
    });
    // Gone already, and never in another's scene.
    expect(await actions.sa_unlinkSceneElement(mine, target, abbey)).toEqual({
      ok: false,
      error: "That element is not in this scene.",
    });
    expect(await actions.sa_unlinkSceneElement(theirs, theirScene, abbey)).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
  });

  it("gives the element and its link to the scene for the info popover", async () => {
    const detail = await actions.sa_getElementDetail(mine, zed, scene);

    expect(detail).toMatchObject({
      element: {
        kind: "PERSON",
        name: "Fixture Zed",
        initialName: "Fixture hooded figure",
        title: "Harbourmaster",
        description: null,
        notes: null,
        tags: [],
      },
      link: { status: "READY", tags: ["scene"], showInfo: true },
    });
    expect(detail?.link?.createdAt).toBeInstanceOf(Date);

    const empty = await sceneIn("ACTIVE", "Fixture scene without Zed");
    // Not in that scene: the element alone, with no link.
    expect(await actions.sa_getElementDetail(mine, zed, empty)).toMatchObject({ link: null });
    expect(await actions.sa_getElementDetail(theirs, zed, theirScene)).toBeNull();
  });

  it("moves an element between stacks by swapping one tag for another", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for moves");
    const created = await actions.sa_createSceneElement(
      mine,
      target,
      "elements",
      form({ name: "Fixture buoy" }),
    );
    if (!created.ok) throw new Error("not created");
    const idElement = Number(created.item.key.split(":")[1]);

    const moved = await actions.sa_moveSceneElement(mine, target, idElement, "elements", "scene");
    expect(moved.ok && moved.item.sceneTags).toEqual(["scene"]);
    expect(await linksOf(target)).toEqual([{ idElement, tags: ["scene"] }]);

    // From a stack whose tag the link lacks, the target is only added.
    const added = await actions.sa_moveSceneElement(mine, target, idElement, null, "elements");
    expect(added.ok && added.item.sceneTags).toEqual(["scene", "elements"]);

    expect(await actions.sa_moveSceneElement(mine, target, idElement, "scene", "weather")).toEqual({
      ok: false,
      error: "That stack is no longer one of the scene's tags.",
    });
    expect(await actions.sa_moveSceneElement(theirs, theirScene, idElement, null, "scene")).toEqual(
      {
        ok: false,
        error: "That scene is not part of this story.",
      },
    );
  });

  it("files an element under the stacks ticked in its panel's stacks dialog", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for stacks");
    const created = await actions.sa_createSceneElement(
      mine,
      target,
      "elements",
      form({ name: "Fixture rope" }),
    );
    if (!created.ok) throw new Error("not created");
    const idElement = elementIdOf(created.item);

    // Kept in the scene's order, whatever order they were ticked in.
    const both = await actions.sa_setSceneElementTags(mine, target, idElement, [
      "scene",
      "elements",
    ]);
    expect(both.ok && both.item.sceneTags).toEqual(["elements", "scene"]);
    expect(await linksOf(target)).toEqual([{ idElement, tags: ["elements", "scene"] }]);

    // None at all: the pill goes to the first stack.
    const none = await actions.sa_setSceneElementTags(mine, target, idElement, []);
    expect(none.ok && none.item.sceneTags).toEqual([]);

    expect(await actions.sa_setSceneElementTags(mine, target, idElement, ["weather"])).toEqual({
      ok: false,
      error: "That stack is no longer one of the scene's tags.",
    });
    expect(await actions.sa_setSceneElementTags(mine, target, zed, ["scene"])).toEqual({
      ok: false,
      error: "That element is not in this scene.",
    });
    expect(await actions.sa_setSceneElementTags(theirs, theirScene, idElement, ["scene"])).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
  });

  describe("telling the players' table", () => {
    beforeEach(() => {
      for (const fn of Object.values(published)) fn.mock.resetCalls();
    });

    const calls = (name: keyof typeof published) =>
      published[name].mock.calls.map((call) => call.arguments);

    it("sends the link after the status menu, the info toggle, the name dropdown, a move and the stacks dialog", async () => {
      await openSession(mine, scene);
      await actions.sa_setSceneElementStatus(mine, scene, abbey, "INVISIBLE");
      await actions.sa_setSceneElementShowInfo(mine, scene, abbey, false);
      await actions.sa_setSceneElementShowing(mine, scene, abbey, "name");
      await actions.sa_moveSceneElement(mine, scene, abbey, null, "scene");
      await actions.sa_setSceneElementTags(mine, scene, abbey, ["elements"]);
      expect(calls("publishSceneElement")).toEqual([
        [mine, scene, abbey],
        [mine, scene, abbey],
        [mine, scene, abbey],
        [mine, scene, abbey],
        [mine, scene, abbey],
      ]);
      await db
        .update(tables.sceneElements)
        .set({ status: "READY", tags: [], elementShowing: "initial_name", showInfo: true })
        .where(eq(tables.sceneElements.idElement, abbey));
    });

    it("sends the tack's pulse as it is, element and action", async () => {
      await openSession(mine, scene);
      await actions.sa_pulseSceneElement(mine, scene, abbey, { action: "preview.open" });
      expect(calls("publishSceneElementPulse")).toEqual([
        [mine, scene, abbey, { action: "preview.open" }],
      ]);
      // A pulse is not a change to the link, so the link itself is not sent.
      expect(calls("publishSceneElement")).toEqual([]);
    });

    it("sends a removal after Remove from scene, and links the element back", async () => {
      await openSession(mine, scene);
      await actions.sa_unlinkSceneElement(mine, scene, abbey);
      expect(calls("publishSceneElementRemoved")).toEqual([
        [mine, scene, abbey, expect.any(Number)],
      ]);

      await actions.sa_linkSceneElement(mine, scene, abbey);
      expect(calls("publishSceneElement")).toEqual([[mine, scene, abbey]]);
    });

    it("says the scene changed after choosing one, and the session after renaming it", async () => {
      const session = await openSession(mine, null);
      await actions.sa_loadRunScene(mine, scene);
      expect(calls("publishSceneChanged")).toEqual([[mine]]);

      await actions.sa_setSessionTitle(mine, session, "Kildealg");
      expect(calls("publishSessionUpdated")).toEqual([[mine, session, "Kildealg"]]);

      // Writing the scene up says it changed too, so the players read it afresh.
      await actions.sa_setSceneText(mine, scene, { description: "Fog.", notes: "" });
      expect(calls("publishSceneChanged")).toEqual([[mine], [mine]]);
    });

    it("sends the element after a library edit or a new picture", async () => {
      await openSession(mine, scene);
      await actions.sa_setElementImage(mine, zed, null);
      await actions.sa_setElementTags(mine, zed, ["docks"]);
      expect(calls("publishElementChanged")).toEqual([
        [mine, zed],
        [mine, zed],
      ]);
      await actions.sa_setElementTags(mine, zed, []);
    });

    it("says nothing when a write is refused", async () => {
      await actions.sa_setSceneElementStatus(theirs, theirScene, abbey, "INVISIBLE");
      await actions.sa_unlinkSceneElement(mine, scene, 2 ** 20);
      for (const fn of Object.values(published)) expect(fn.mock.calls).toHaveLength(0);
    });
  });
  describe("sa_getJoinLink", () => {
    it("makes the story's code once, and keeps it", async () => {
      const first = await actions.sa_getJoinLink(mine);
      expect(first?.code).toMatch(/^[A-Za-z0-9_-]{12}$/);
      // An unpaid storyteller by default, with no one in by the link yet.
      expect(first).toMatchObject({ joined: 0, cap: 3 });

      const again = await actions.sa_getJoinLink(mine);
      expect(again?.code).toBe(first?.code);
    });

    it("counts only the seats the link gave out", async () => {
      await db
        .insert(tables.storyPlayers)
        .values([{ idStory: mine, idUser: otherUserId, isFromLink: true }]);
      try {
        expect((await actions.sa_getJoinLink(mine))?.joined).toBe(1);
      } finally {
        await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, mine));
      }
    });

    it("gives nothing for someone else's story, and does not make it a code", async () => {
      expect(await actions.sa_getJoinLink(theirs)).toBeNull();
      const [row] = await db
        .select({ code: tables.stories.joinCode })
        .from(tables.stories)
        .where(eq(tables.stories.idStory, theirs));
      expect(row.code).toBeNull();
    });
  });

  describe("who joined by the link", () => {
    // A guest of this file's and the other user, both seated at the story
    // by its link, the guest present at an open session and the other
    // waiting from before it.
    async function seatTwo(): Promise<{ guest: string; idStorySession: number }> {
      const guest = await makeTestUser(db, tables, LINK_GUEST_EMAIL);
      await db
        .update(tables.user)
        .set({ isAnonymous: true, nickName: "Sleepy Otter" })
        .where(eq(tables.user.id, guest));
      await db.insert(tables.storyPlayers).values([
        { idStory: mine, idUser: otherUserId, isFromLink: true },
        { idStory: mine, idUser: guest, isFromLink: true },
      ]);
      const idStorySession = await openSession(mine, null, "OPEN");
      await db.insert(tables.sessionPlayers).values([
        {
          idStory: mine,
          idStorySession,
          status: "PRESENT",
          idCreatedByUser: guest,
          idUpdatedByUser: guest,
        },
        { idStory: mine, idCreatedByUser: otherUserId, idUpdatedByUser: otherUserId },
      ]);
      return { guest, idStorySession };
    }

    async function cleanUp() {
      await db.delete(tables.sessionPlayers).where(eq(tables.sessionPlayers.idStory, mine));
      await db.delete(tables.storyPlayers).where(eq(tables.storyPlayers.idStory, mine));
      await removeTestUser(db, tables, LINK_GUEST_EMAIL);
    }

    it("counts the link's seats for the chip without making a code", async () => {
      await db
        .update(tables.stories)
        .set({ joinCode: null })
        .where(eq(tables.stories.idStory, mine));
      await seatTwo();
      try {
        expect(await actions.sa_getJoinCount(mine)).toEqual({ joined: 2, cap: 3 });
        expect(await actions.sa_getJoinCount(theirs)).toBeNull();
        const [row] = await db
          .select({ code: tables.stories.joinCode })
          .from(tables.stories)
          .where(eq(tables.stories.idStory, mine));
        expect(row.code).toBeNull();
      } finally {
        await cleanUp();
      }
    });

    it("lists who joined by the link, guest or not, and where each is", async () => {
      const { guest } = await seatTwo();
      try {
        const players = await actions.sa_listLinkPlayers(mine);
        expect(players).toEqual([
          { idUser: otherUserId, name: expect.any(String), isGuest: false, status: "WAITING" },
          { idUser: guest, name: "Sleepy Otter", isGuest: true, status: "PRESENT" },
        ]);
        expect(await actions.sa_listLinkPlayers(theirs)).toEqual([]);
      } finally {
        await cleanUp();
      }
    });

    it("deletes a guest the storyteller removes, and tells the table", async () => {
      const { guest } = await seatTwo();
      try {
        published.publishSceneChanged.mock.resetCalls();
        publishTableCount.mock.resetCalls();

        expect(await actions.sa_removeLinkPlayer(mine, guest)).toEqual({ ok: true });

        const left = await db
          .select({ id: tables.user.id })
          .from(tables.user)
          .where(eq(tables.user.id, guest));
        expect(left).toEqual([]);
        expect(published.publishSceneChanged.mock.calls[0].arguments).toEqual([mine]);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(publishTableCount.mock.calls[0]?.arguments[0]).toBe(mine);
      } finally {
        await cleanUp();
      }
    });

    it("takes an account's seat and presence, and leaves the account", async () => {
      await seatTwo();
      try {
        expect(await actions.sa_removeLinkPlayer(mine, otherUserId)).toEqual({ ok: true });

        const seats = await db
          .select({ id: tables.storyPlayers.idUser })
          .from(tables.storyPlayers)
          .where(
            and(eq(tables.storyPlayers.idStory, mine), eq(tables.storyPlayers.idUser, otherUserId)),
          );
        expect(seats).toEqual([]);
        const rows = await db
          .select({ id: tables.sessionPlayers.idSessionPlayer })
          .from(tables.sessionPlayers)
          .where(eq(tables.sessionPlayers.idCreatedByUser, otherUserId));
        expect(rows).toEqual([]);
        const [still] = await db
          .select({ id: tables.user.id })
          .from(tables.user)
          .where(eq(tables.user.id, otherUserId));
        expect(still).toEqual({ id: otherUserId });
      } finally {
        await cleanUp();
      }
    });

    it("refuses someone not seated by the link, and someone else's story", async () => {
      const { guest } = await seatTwo();
      try {
        await db
          .update(tables.storyPlayers)
          .set({ isFromLink: false })
          .where(eq(tables.storyPlayers.idUser, otherUserId));
        expect(await actions.sa_removeLinkPlayer(mine, otherUserId)).toMatchObject({ ok: false });
        expect(await actions.sa_removeLinkPlayer(theirs, guest)).toMatchObject({ ok: false });
        expect(await actions.sa_removeLinkPlayer(mine, "not-a-uuid")).toMatchObject({ ok: false });
      } finally {
        await cleanUp();
      }
    });
  });
});
