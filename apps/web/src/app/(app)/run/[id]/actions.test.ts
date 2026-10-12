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
        fields: {
          initial_name: "Fixture hooded figure",
          name: "Fixture Zed",
          title: "Harbourmaster",
        },
        showing: "initial_name",
      },
      {
        key: `PLACE:${abbey}`,
        kind: "PLACE",
        label: "Fixture Abbey",
        detail: null,
        imageUrl: null,
        sceneTags: [],
        sceneStatus: "INITIAL",
        // No initial name, so the default shows the name.
        fields: { initial_name: null, name: "Fixture Abbey", title: null },
        showing: "initial_name",
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
      showing: "initial_name",
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
    expect(fromLibrary.ok && fromLibrary.item.sceneStatus).toBe("INITIAL");

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
        fields: { initial_name: "Fixture light", name: "Fixture lighthouse", title: "Unlit" },
        showing: "initial_name",
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
        fields: { initial_name: null, name: "Fixture Abbey", title: null },
        showing: "initial_name",
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
    await actions.sa_linkSceneElement(mine, target, zed, false, DEFAULT_TAGS[0]);
    await actions.sa_linkSceneElement(mine, target, abbey, false, DEFAULT_TAGS[1]);

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

    const result = await actions.sa_linkSceneElement(mine, target, abbey, false, DEFAULT_TAGS[1]);
    expect(result.ok && result.item.sceneTags).toEqual([DEFAULT_TAGS[1]]);
    expect(await actions.sa_linkSceneElement(mine, target, zed, false, "weather")).toEqual({
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
    expect(await actions.sa_setSceneElementShown(mine, target, zed, false)).toEqual(refused);
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

  it("gives an element one of its story's attachments as its picture", async () => {
    const [mineAttachment, theirAttachment, unfinished] = await db
      .insert(tables.attachments)
      .values([
        { kind: "STORY", idExternal: mine, status: "READY", url: "https://x.test/zed.png" },
        { kind: "STORY", idExternal: theirs, status: "READY", url: "https://x.test/other.png" },
        { kind: "STORY", idExternal: mine, status: "UPLOADING" },
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

      // A new element can start with one, chosen in its form.
      const target = await sceneIn("ACTIVE", "Fixture scene for a pictured element");
      const pictured = await actions.sa_createSceneElement(mine, target, null, {
        ...form({ name: "Fixture pictured" }),
        idAttachment: mineAttachment.id,
      });
      expect(pictured.ok && pictured.item.imageUrl).toBe("https://x.test/zed.png");
      expect(
        await actions.sa_createSceneElement(mine, target, null, {
          ...form({ name: "Fixture stolen picture" }),
          idAttachment: theirAttachment.id,
        }),
      ).toEqual({ ok: false, errors: { root: "That attachment is not a picture in this story." } });
      if (pictured.ok) {
        await db
          .delete(tables.elements)
          .where(eq(tables.elements.idElement, Number(pictured.item.key.split(":")[1])));
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
      await db
        .update(tables.elements)
        .set({ idAttachment: null })
        .where(eq(tables.elements.idElement, zed));
      await db
        .delete(tables.attachments)
        .where(
          inArray(tables.attachments.idAttachment, [
            mineAttachment.id,
            theirAttachment.id,
            unfinished.id,
          ]),
        );
    }
  });

  it("edits a story's element from the library, apart from any scene", async () => {
    const [made] = await db
      .insert(tables.elements)
      .values({ idStory: mine, kind: "THING", name: "Fixture lantern", idCreatedByUser: SEED_USER })
      .returning({ id: tables.elements.idElement });
    const values = {
      kind: "THING",
      name: "  Fixture storm lantern ",
      initialName: "",
      title: "Brass",
      description: "",
      notes: "Smells of oil.",
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
      link: { status: "INITIAL", tags: ["scene"] },
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
});
