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

const EMPTY = { scene: null, tags: [], coverUrl: null, inPlay: [] };
// The tags a new scene of a story with no standard tags and no system starts
// with (db/functions/standard_tags_for_story.sql).
const DEFAULT_TAGS = ["elements", "scene"];

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
          initialName: "Fixture hooded figure",
          title: "Harbourmaster",
          idCreatedByUser: SEED_USER,
        },
        { idStory: mine, kind: "THING", name: "Fixture Lantern", idCreatedByUser: SEED_USER },
      ])
      .returning({ id: tables.elements.idElement });

    await db.insert(tables.sceneElements).values([
      { idStoryScene: scene, idElement: abbey, idCreatedByUser: SEED_USER },
      { idStoryScene: scene, idElement: zed, tags: ["scene"], idCreatedByUser: SEED_USER },
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
        tags: DEFAULT_TAGS,
        coverUrl: null,
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

  it("puts the session's current scene's tags and elements in play, by kind", async () => {
    await openSession(mine, scene);

    const space = await actions.sa_getRunPlaySpace(mine);
    expect(space.scene).toEqual({
      idStoryScene: scene,
      title: "Fixture scene at the docks",
      status: "PENDING",
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
        sceneStatus: "INITIAL",
        realName: "Fixture Zed",
      },
      {
        key: `PLACE:${abbey}`,
        kind: "PLACE",
        label: "Fixture Abbey",
        detail: null,
        imageUrl: null,
        sceneTags: [],
        sceneStatus: "INITIAL",
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

  it("shows the scene's cover in its play space", async () => {
    await openSession(mine, scene);
    const [cover] = await db
      .insert(tables.attachments)
      .values({
        kind: "STORY_SCENE",
        idExternal: scene,
        status: "READY",
        url: "https://x.test/fixture-docks.png",
        tags: ["cover"],
        idCreatedByUser: SEED_USER,
      })
      .returning({ id: tables.attachments.idAttachment });

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

  // The element form's fields, blank but for what a test sets.
  const form = (values: Record<string, string>) => ({
    kind: "PLACE",
    name: "",
    initialName: "",
    title: "",
    description: "",
    notes: "",
    status: "PENDING",
    sceneStatus: "INITIAL",
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
      realName: "Fixture tide pool",
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

    // The Default stack links with no tag.
    const plain = await actions.sa_createSceneElement(
      mine,
      target,
      null,
      form({ kind: "THING", name: "Fixture net", title: "Torn" }),
    );
    expect(plain.ok && plain.item.sceneTags).toEqual([]);
    expect(plain.ok && plain.item.sceneStatus).toBe("INITIAL");
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
        realName: "Fixture lighthouse",
        detail: "Unlit",
        imageUrl: null,
        sceneTags: ["scene"],
        sceneStatus: "DISABLED",
      },
    });
    const detail = await actions.sa_getSceneElementDetail(mine, target, idElement);
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

    const result = await actions.sa_linkSceneElement(mine, target, abbey, true);
    expect(result.ok && result.item.sceneStatus).toBe("INVISIBLE");
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
        sceneStatus: "INITIAL",
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

  it("hides an element from whatever status it is in, and shows it again as READY", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene for the eye");
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

    expect(await actions.sa_setSceneElementShown(mine, target, abbey, false)).toEqual({
      ok: true,
      status: "INVISIBLE",
    });
    expect(await statusOf()).toBe("INVISIBLE");
    expect(await actions.sa_setSceneElementShown(mine, target, abbey, true)).toEqual({
      ok: true,
      status: "READY",
    });
    expect(await statusOf()).toBe("READY");

    // Disabled, the pill's lock: showing unlocks it to READY.
    await db
      .update(tables.sceneElements)
      .set({ status: "DISABLED" })
      .where(
        and(
          eq(tables.sceneElements.idStoryScene, target),
          eq(tables.sceneElements.idElement, abbey),
        ),
      );
    expect(await actions.sa_setSceneElementShown(mine, target, abbey, true)).toEqual({
      ok: true,
      status: "READY",
    });
    // Shown already, it stays as it is.
    expect(await actions.sa_setSceneElementShown(mine, target, abbey, true)).toEqual({
      ok: true,
      status: "READY",
    });
    expect(await actions.sa_setSceneElementShown(mine, target, abbey, false)).toEqual({
      ok: true,
      status: "INVISIBLE",
    });
  });

  it("hides nothing that is not linked to the scene, nor in another's scene", async () => {
    const target = await sceneIn("ACTIVE", "Fixture scene with nothing in it");
    expect(await actions.sa_setSceneElementShown(mine, target, abbey, false)).toEqual({
      ok: false,
      error: "That element is not in this scene.",
    });
    expect(await actions.sa_setSceneElementShown(theirs, theirScene, abbey, false)).toEqual({
      ok: false,
      error: "That scene is not part of this story.",
    });
  });

  it("gives the element and its link to the scene for the info popover", async () => {
    const detail = await actions.sa_getSceneElementDetail(mine, scene, zed);

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
      link: { status: "INITIAL", tags: ["scene"] },
    });
    expect(detail?.link.createdAt).toBeInstanceOf(Date);

    const empty = await sceneIn("ACTIVE", "Fixture scene without Zed");
    expect(await actions.sa_getSceneElementDetail(mine, empty, zed)).toBeNull();
    expect(await actions.sa_getSceneElementDetail(theirs, theirScene, zed)).toBeNull();
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
});
