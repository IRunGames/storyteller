// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. An element of the story apart from any scene: the library's list, the panel's detail, its edit, its picture and its tags.
// The fixture is test/scene-fixtures.ts's: a story of the test user's with a
// scene and elements, and a story belonging to someone else; each test opens
// the session it needs and `beforeEach` clears them.
import { after, before, beforeEach, it } from "node:test";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";
import { elementIdOf } from "@/lib/scene-elements";
import { describeWithDb, type Db, type Tables } from "@/test/db-suite";
import {
  type SceneFixture,
  elementForm,
  makeSceneFixture,
  mockPublishing,
  publishMocks,
} from "@/test/scene-fixtures";

const mocks = publishMocks();

let actions: typeof import("./actions");
let links: typeof import("@/components/scene-elements/actions");
let run: typeof import("@/components/run/actions");
let db: Db;
let tables: Tables;
let fx: SceneFixture;
let testUser = "";
let mine = 0;
let theirs = 0;
let scene = 0;
let theirScene = 0;
let zed = 0;

describeWithDb("element actions", { email: "element-actions@example.test" }, (suite) => {
  before(async () => {
    mockPublishing(mocks);
    ({ db, tables } = suite);
    testUser = suite.testUser;
    actions = await import("./actions");
    links = await import("@/components/scene-elements/actions");
    run = await import("@/components/run/actions");
    fx = await makeSceneFixture(suite, "Element actions fixture");
    ({ mine, theirs, scene, theirScene, zed } = fx);
  });

  beforeEach(() => fx.clearSessions());

  after(async () => {
    if (!db) return;
    await fx.remove();
  });

  const openSession = (...args: Parameters<SceneFixture["openSession"]>) => fx.openSession(...args);
  const sceneIn = (...args: Parameters<SceneFixture["sceneIn"]>) => fx.sceneIn(...args);

  const form = elementForm;

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
      const item = (await run.sa_openRunPlaySpace(mine)).inPlay.find(
        (each) => elementIdOf(each) === zed,
      );
      expect(item?.imageUrl).toBe("https://x.test/zed.png");

      // A new element can start with one, chosen in its form, and with one
      // for its link in this scene, which is what the pill shows there.
      const target = await sceneIn("ACTIVE", "Fixture scene for a pictured element");
      const pictured = await links.sa_createSceneElement(mine, target, null, {
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
        await links.sa_createSceneElement(mine, target, null, {
          ...form({ name: "Fixture stolen picture" }),
          idAttachment: theirAttachment.id,
        }),
      ).toEqual(refusal);
      expect(
        await links.sa_createSceneElement(mine, target, null, {
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
    expect(await actions.sa_updateStoryElement(theirs, made.id, values)).toEqual({
      ok: false,
      errors: { root: "That scene is not part of this story." },
    });
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
    // A sort it does not know is a bad request, answered as an unowned scene is.
    expect(
      await actions.sa_listSceneLibraryElements(mine, scene, "PERSON", "", "colour" as never),
    ).toEqual([]);
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
});
