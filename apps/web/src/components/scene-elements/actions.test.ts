// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. An element's link to a scene: bringing an element in, changing how its pill stands, taking it out, and what each write tells the players' table.
// The fixture is test/scene-fixtures.ts's: a story of the test user's with a
// scene and elements, and a story belonging to someone else; each test opens
// the session it needs and `beforeEach` clears them.
import { after, before, beforeEach, describe, it } from "node:test";
import { expect } from "expect";
import { and, eq } from "drizzle-orm";
import { elementIdOf } from "@/lib/scene-elements";
import { describeWithDb, type Db, type Tables } from "@/test/db-suite";
import {
  DEFAULT_TAGS,
  type SceneFixture,
  elementForm,
  makeSceneFixture,
  mockPublishing,
  publishMocks,
} from "@/test/scene-fixtures";

const mocks = publishMocks();
const { published } = mocks;

let actions: typeof import("./actions");
let elementActions: typeof import("@/components/elements/actions");
let run: typeof import("@/components/run/actions");
let sessions: typeof import("@/components/sessions/actions");
let db: Db;
let tables: Tables;
let fx: SceneFixture;
let otherUserId = "";
let mine = 0;
let theirs = 0;
let scene = 0;
let theirScene = 0;
let zed = 0;
let abbey = 0;

describeWithDb(
  "scene element actions",
  { email: "scene-element-actions@example.test" },
  (suite) => {
    before(async () => {
      mockPublishing(mocks);
      ({ db, tables } = suite);
      actions = await import("./actions");
      elementActions = await import("@/components/elements/actions");
      run = await import("@/components/run/actions");
      sessions = await import("@/components/sessions/actions");
      fx = await makeSceneFixture(suite, "Scene element fixture");
      ({ mine, theirs, scene, theirScene, zed, abbey, otherUser: otherUserId } = fx);
    });

    beforeEach(() => fx.clearSessions());

    after(async () => {
      if (!db) return;
      await fx.remove();
    });

    const openSession = (...args: Parameters<SceneFixture["openSession"]>) =>
      fx.openSession(...args);
    const sceneIn = (...args: Parameters<SceneFixture["sceneIn"]>) => fx.sceneIn(...args);

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

      expect(
        await actions.sa_createSceneElement(mine, target, "scene", form({ name: " " })),
      ).toEqual({ ok: false, errors: { name: "Please give the element a name." } });
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
      ).toEqual({
        ok: false,
        errors: { root: "That stack is no longer one of the scene's tags." },
      });
      expect(
        await actions.sa_createSceneElement(
          theirs,
          theirScene,
          null,
          form({ name: "Fixture intrusion" }),
        ),
      ).toEqual({ ok: false, errors: { root: "That scene is not part of this story." } });
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
      const idLink = created.item.idSceneElement!;
      // The scene's link leads on the pill.
      expect(created.item.link).toEqual({
        url: "https://example.com/chart#docks",
        text: "The docks on the chart",
      });
      const detail = await elementActions.sa_getElementDetail(mine, idElement, target);
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
        idLink,
        form({ name: "Fixture chart", url: "https://example.com/chart", sceneStatus: "READY" }),
      );
      expect(edited.ok && edited.item.link).toEqual({
        url: "https://example.com/chart",
        text: "https://example.com/chart",
      });
      expect(
        (await elementActions.sa_getElementDetail(mine, idElement, target))?.link?.url,
      ).toBeNull();

      // A link that is not a web address is refused by the form's field.
      expect(
        await actions.sa_updateSceneElement(
          mine,
          target,
          idLink,
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
      const idElement = elementIdOf(created.item);
      const idLink = created.item.idSceneElement!;

      const result = await actions.sa_updateSceneElement(
        mine,
        target,
        idLink,
        form({
          name: "Fixture lighthouse",
          initialName: "Fixture light",
          title: "Unlit",
          description: "Tall.",
          status: "INACTIVE",
          sceneStatus: "DISABLED",
          sceneLabel: "The old light",
        }),
      );

      expect(result).toEqual({
        ok: true,
        item: {
          key: `PLACE:${idElement}:${idLink}`,
          kind: "PLACE",
          label: "Fixture light",
          detail: "Unlit",
          imageUrl: null,
          sceneTags: ["scene"],
          sceneStatus: "DISABLED",
          showInfo: true,
          idSceneElement: idLink,
          hasStatBlocks: false,
          // The link's own name is a field the pill may show, kept until chosen.
          fields: {
            initial_name: "Fixture light",
            name: "Fixture lighthouse",
            title: "Unlit",
            label: "The old light",
          },
          showing: "initial_name",
          link: null,
        },
      });
      const detail = await elementActions.sa_getElementDetail(mine, idElement, target);
      expect(detail).toMatchObject({
        element: { description: "Tall.", status: "INACTIVE", initialName: "Fixture light" },
        link: { status: "DISABLED", tags: ["scene"], label: "The old light" },
      });

      // A link that is not the scene's, or another's scene.
      const elsewhere = await sceneIn("ACTIVE", "Fixture scene without the lighthouse");
      expect(
        await actions.sa_updateSceneElement(mine, elsewhere, idLink, form({ name: "X" })),
      ).toEqual({ ok: false, errors: { root: "That element is not in this scene." } });
      expect(
        await actions.sa_updateSceneElement(theirs, theirScene, idLink, form({ name: "X" })),
      ).toEqual({ ok: false, errors: { root: "That scene is not part of this story." } });
    });

    it("gives a new link a copy of the element's stat blocks, and a copy of the element its own", async () => {
      const target = await sceneIn("ACTIVE", "Fixture scene for stat block copies");
      const blocks = { "-1": { stats: { str: { value: 14 } } } };
      await db
        .update(tables.elements)
        .set({ statBlocks: blocks })
        .where(eq(tables.elements.idElement, abbey));
      const linkBlocks = async (idSceneElement: number) => {
        const [row] = await db
          .select({ statBlocks: tables.sceneElements.statBlocks })
          .from(tables.sceneElements)
          .where(eq(tables.sceneElements.idSceneElement, idSceneElement));
        return row?.statBlocks;
      };

      const first = await actions.sa_linkSceneElement(mine, target, abbey);
      if (!first.ok) throw new Error("not linked");
      const firstLink = first.item.idSceneElement!;
      expect(first.duplicate).toBe(false);
      expect(await linkBlocks(firstLink)).toEqual(blocks);

      // Play changes the link; linking the element again makes a copy from the
      // element's baseline and leaves the played link as it is.
      const played = { "-1": { stats: { str: { value: 9 } } } };
      await db
        .update(tables.sceneElements)
        .set({ statBlocks: played })
        .where(eq(tables.sceneElements.idSceneElement, firstLink));
      const second = await actions.sa_linkSceneElement(mine, target, abbey);
      if (!second.ok) throw new Error("not linked");
      expect(second.duplicate).toBe(true);
      expect(second.item.idSceneElement).not.toBe(firstLink);
      expect(await linkBlocks(firstLink)).toEqual(played);
      expect(await linkBlocks(second.item.idSceneElement!)).toEqual(blocks);

      // An element made at the table starts its link with none.
      const made = await actions.sa_createSceneElement(
        mine,
        target,
        null,
        form({ kind: "PERSON", name: "Fixture Blockless" }),
      );
      expect(made.ok).toBe(true);
      if (made.ok) {
        const [link] = await db
          .select({ statBlocks: tables.sceneElements.statBlocks })
          .from(tables.sceneElements)
          .where(eq(tables.sceneElements.idElement, Number(made.item.key.split(":")[1])));
        expect(link.statBlocks).toEqual({});
      }
      await db
        .update(tables.elements)
        .set({ statBlocks: {} })
        .where(eq(tables.elements.idElement, abbey));
    });

    it("rolls each new link's Initialized as afresh, hit points from the element's own hit dice", async () => {
      const target = await sceneIn("ACTIVE", "Fixture scene for rolled stat blocks");
      const base = {
        label: "",
        description: "",
        rack: [],
        computedAs: "",
        visible: true,
        format: "number" as const,
        sticky: false,
        static: false,
        roll: "",
        global: false,
        upDown: false,
        leftRight: false,
        initialRoll: "",
        initialFrom: "",
      };
      const definition = {
        groups: [
          {
            name: "life",
            label: "",
            keyedBy: "",
            rollAll: false,
            canHaveMultiples: false,
            stats: [
              { ...base, name: "hd", type: "dice" as const, format: "" as const },
              { ...base, name: "hp", type: "pool" as const, initialFrom: "life.hd" },
              { ...base, name: "luck", type: "display" as const, initialRoll: "1d1+2" },
              { ...base, name: "str", type: "display" as const },
            ],
          },
        ],
      };
      const [system] = await db
        .insert(tables.systems)
        .values({ systemName: "Fixture run table rolls", statBlockDefinition: definition })
        .returning({ idSystem: tables.systems.idSystem });
      const key = String(system.idSystem);
      const prepared = {
        [key]: {
          life: {
            hd: { value: "1d1+40" },
            hp: { value: 7, min: 0, max: 7 },
            luck: { value: 0 },
            str: { value: 12 },
          },
        },
      };
      await db
        .update(tables.stories)
        .set({ idSystem: system.idSystem })
        .where(eq(tables.stories.idStory, mine));
      await db
        .update(tables.elements)
        .set({ statBlocks: prepared })
        .where(eq(tables.elements.idElement, abbey));
      try {
        const linked = await actions.sa_linkSceneElement(mine, target, abbey);
        if (!linked.ok) throw new Error("not linked");
        const [link] = await db
          .select({ statBlocks: tables.sceneElements.statBlocks })
          .from(tables.sceneElements)
          .where(eq(tables.sceneElements.idSceneElement, linked.item.idSceneElement!));
        // Hit points rolled from the element's dice, luck from the
        // template's; the dice themselves and a stat with no roll as they are.
        expect(link.statBlocks).toEqual({
          [key]: {
            life: {
              hd: { value: "1d1+40" },
              hp: { value: 41, min: 0, max: 41 },
              luck: { value: 3 },
              str: { value: 12 },
            },
          },
        });
        // The element keeps the values it was prepared with.
        const [element] = await db
          .select({ statBlocks: tables.elements.statBlocks })
          .from(tables.elements)
          .where(eq(tables.elements.idElement, abbey));
        expect(element.statBlocks).toEqual(prepared);
      } finally {
        await db
          .update(tables.elements)
          .set({ statBlocks: {} })
          .where(eq(tables.elements.idElement, abbey));
        await db
          .update(tables.stories)
          .set({ idSystem: null })
          .where(eq(tables.stories.idStory, mine));
        await db.delete(tables.systems).where(eq(tables.systems.idSystem, system.idSystem));
      }
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

      // Linked again, the copy takes the switch as it now stands.
      const again = await actions.sa_linkSceneElement(mine, target, abbey, { showInfo: true });
      expect(again.ok && again.duplicate).toBe(true);
      expect(again.ok && again.item.showInfo).toBe(true);
    });

    it("makes a new element with its info kept back, and sets whether the players see it", async () => {
      const target = await sceneIn("ACTIVE", "Fixture scene for new elements without info");
      const made = await actions.sa_createSceneElement(mine, target, null, {
        ...form({ kind: "THING", name: "Fixture lantern" }),
        showInfo: false,
      });
      expect(made.ok && made.item.showInfo).toBe(false);
      const idElement = made.ok ? elementIdOf(made.item) : 0;
      const idLink = made.ok ? made.item.idSceneElement! : 0;
      expect(await showInfoOf(target, idElement)).toBe(false);

      expect(await actions.sa_setSceneElementShowInfo(mine, target, idLink, true)).toEqual({
        ok: true,
        showInfo: true,
      });
      expect(await showInfoOf(target, idElement)).toBe(true);
      // A link that is not the scene's: Zed's to the fixture scene.
      const zedLink = await linkOf(scene, zed);
      expect(await actions.sa_setSceneElementShowInfo(mine, target, zedLink, false)).toEqual({
        ok: false,
        error: "That element is not in this scene.",
      });
      expect(await actions.sa_setSceneElementShowInfo(theirs, theirScene, zedLink, false)).toEqual({
        ok: false,
        error: "That scene is not part of this story.",
      });
    });

    it("sends the tack's pulse to the players without writing anything, and refuses it where a write would be", async () => {
      const target = await sceneIn("ACTIVE", "Fixture scene for pulses");
      const linked = await actions.sa_linkSceneElement(mine, target, zed);
      const zedLink = linked.ok ? linked.item.idSceneElement! : 0;
      published.publishSceneElementPulse.mock.resetCalls();

      expect(
        await actions.sa_pulseSceneElement(mine, target, zedLink, { action: "preview.open" }),
      ).toEqual({ ok: true });
      expect(
        await actions.sa_pulseSceneElement(mine, target, zedLink, { action: "preview.close" }),
      ).toEqual({ ok: true });
      expect(published.publishSceneElementPulse.mock.calls.map((call) => call.arguments)).toEqual([
        [mine, target, zedLink, { action: "preview.open" }],
        [mine, target, zedLink, { action: "preview.close" }],
      ]);
      // Nothing of it reaches the row.
      const [row] = await db
        .select({
          showImage: tables.sceneElements.showImage,
          updatedAt: tables.sceneElements.updatedAt,
        })
        .from(tables.sceneElements)
        .where(
          and(
            eq(tables.sceneElements.idStoryScene, target),
            eq(tables.sceneElements.idElement, zed),
          ),
        );
      expect(row.showImage).toBe(false);

      expect(
        await actions.sa_pulseSceneElement(mine, target, zedLink, { action: "dice.roll" }),
      ).toEqual({
        ok: false,
        error: "That is not something the players' table answers.",
      });
      // Zed's link to the fixture scene is not this scene's.
      expect(
        await actions.sa_pulseSceneElement(mine, target, await linkOf(scene, zed), {
          action: "preview.open",
        }),
      ).toEqual({ ok: false, error: "That element is not in this scene." });
      expect(
        await actions.sa_pulseSceneElement(theirs, theirScene, zedLink, { action: "preview.open" }),
      ).toEqual({ ok: false, error: "That scene is not part of this story." });
      expect(published.publishSceneElementPulse.mock.calls).toHaveLength(2);
    });

    it("links a library element under the scene's first tag, and an element already there again as a numbered copy", async () => {
      const target = await sceneIn("ACTIVE", "Fixture scene for links");

      const result = await actions.sa_linkSceneElement(mine, target, abbey);
      if (!result.ok) throw new Error("not linked");
      const idLink = result.item.idSceneElement!;
      expect(result).toEqual({
        ok: true,
        duplicate: false,
        item: {
          key: `PLACE:${abbey}:${idLink}`,
          kind: "PLACE",
          label: "Fixture Abbey",
          detail: null,
          imageUrl: null,
          // The first of the scene's tags, the first stack's.
          sceneTags: [DEFAULT_TAGS[0]],
          sceneStatus: "READY",
          showInfo: true,
          idSceneElement: idLink,
          hasStatBlocks: false,
          fields: { initial_name: null, name: "Fixture Abbey", title: null, label: null },
          showing: "initial_name",
          link: null,
        },
      });
      expect(await linksOf(target)).toEqual([{ idElement: abbey, tags: [DEFAULT_TAGS[0]] }]);

      // Again: a second link, its pill showing a label of the name and a
      // counter, and a third counting on from it.
      const copy = await actions.sa_linkSceneElement(mine, target, abbey);
      expect(copy.ok && copy.duplicate).toBe(true);
      expect(copy.ok && copy.item).toMatchObject({
        key: `PLACE:${abbey}:${copy.ok ? copy.item.idSceneElement : 0}`,
        label: "Fixture Abbey 1",
        showing: "label",
        fields: { name: "Fixture Abbey", label: "Fixture Abbey 1" },
      });
      const third = await actions.sa_linkSceneElement(mine, target, abbey);
      expect(third.ok && third.item.label).toBe("Fixture Abbey 2");
      expect(await linksOf(target)).toHaveLength(3);
      // Each copy is its own link in the play space.
      await openSession(mine, target);
      const keys = (await run.sa_openRunPlaySpace(mine)).inPlay.map((item) => item.key);
      expect(new Set(keys).size).toBe(3);

      // A scene with no tags has only the Default stack, so no tag to give.
      const untagged = await sceneIn("ACTIVE", "Fixture scene with no tags");
      await db
        .update(tables.storyScenes)
        .set({ tags: [] })
        .where(eq(tables.storyScenes.idStoryScene, untagged));
      const plain = await actions.sa_linkSceneElement(mine, untagged, abbey);
      expect(plain.ok && plain.item.sceneTags).toEqual([]);

      // Zed is in the fixture scene under "scene"; linked again, the copy
      // goes under the first tag like any new link, and is taken out again
      // here so the fixture scene keeps him once.
      const again = await actions.sa_linkSceneElement(mine, scene, zed);
      expect(again.ok && again.duplicate).toBe(true);
      expect(again.ok && again.item.sceneTags).toEqual([DEFAULT_TAGS[0]]);
      if (again.ok) {
        await db
          .delete(tables.sceneElements)
          .where(eq(tables.sceneElements.idSceneElement, again.item.idSceneElement!));
      }
    });

    it("marks an annotated element's pill as annotated when it is linked and after an edit", async () => {
      const target = await sceneIn("ACTIVE", "Fixture scene for an annotated map");
      const [{ idAttachment }] = await db
        .insert(tables.attachments)
        .values({
          idStory: mine,
          status: "READY",
          url: "https://abc.public.blob.vercel-storage.com/uploads/u/abbey-map.png",
          isUploaded: true,
          idCreatedByUser: suite.testUser,
        })
        .returning({ idAttachment: tables.attachments.idAttachment });
      try {
        await db.insert(tables.attachmentUses).values({
          idAttachment,
          kind: "ELEMENT",
          idExternal: abbey,
          tags: ["cover"],
          idCreatedByUser: suite.testUser,
        });
        await db.insert(tables.attachmentAnnotations).values({
          idAttachment,
          width: 100,
          height: 50,
          idCreatedByUser: suite.testUser,
        });

        const linked = await actions.sa_linkSceneElement(mine, target, abbey);
        if (!linked.ok) throw new Error("not linked");
        expect(linked.item.annotated).toBe(true);

        const edited = await actions.sa_updateSceneElement(
          mine,
          target,
          linked.item.idSceneElement!,
          form({ name: "Fixture Abbey" }),
        );
        if (!edited.ok) throw new Error("not edited");
        expect(edited.item.annotated).toBe(true);
      } finally {
        // The attachment takes its use and the drawing with it.
        await db
          .delete(tables.attachments)
          .where(eq(tables.attachments.idAttachment, idAttachment));
      }
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
      const linked = await actions.sa_linkSceneElement(mine, target, abbey);
      const abbeyLink = linked.ok ? linked.item.idSceneElement! : 0;
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
        expect(await actions.sa_setSceneElementStatus(mine, target, abbeyLink, status)).toEqual({
          ok: true,
          status,
        });
        expect(await statusOf()).toBe(status);
      }
      // Already there, it stays as it is.
      expect(await actions.sa_setSceneElementStatus(mine, target, abbeyLink, "READY")).toEqual({
        ok: true,
        status: "READY",
      });
      expect(await actions.sa_setSceneElementStatus(mine, target, abbeyLink, "INITIAL")).toEqual({
        ok: false,
        error: "Choose one of READY, INVISIBLE, TAPPED, DISABLED.",
      });
      expect(await statusOf()).toBe("READY");
    });

    it("moves nothing that is not linked to the scene, nor in another's scene", async () => {
      const target = await sceneIn("ACTIVE", "Fixture scene with nothing in it");
      const abbeyLink = await linkOf(scene, abbey);
      expect(await actions.sa_setSceneElementStatus(mine, target, abbeyLink, "INVISIBLE")).toEqual({
        ok: false,
        error: "That element is not in this scene.",
      });
      expect(
        await actions.sa_setSceneElementStatus(theirs, theirScene, abbeyLink, "INVISIBLE"),
      ).toEqual({
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

      const zedLink = await linkOf(scene, zed);
      const zedItem = async () =>
        (await run.sa_openRunPlaySpace(mine)).inPlay.find((item) => elementIdOf(item) === zed);
      expect(await actions.sa_setSceneElementShowing(mine, scene, zedLink, "title")).toEqual({
        ok: true,
        showing: "title",
      });
      expect(await showingOf(scene)).toBe("title");
      await openSession(mine, scene);
      // The title is the label, so it is not repeated underneath.
      expect(await zedItem()).toMatchObject({
        label: "Harbourmaster",
        detail: null,
        showing: "title",
      });

      expect(await actions.sa_setSceneElementShowing(mine, scene, zedLink, "name")).toEqual({
        ok: true,
        showing: "name",
      });
      expect(await zedItem()).toMatchObject({ label: "Fixture Zed", detail: "Harbourmaster" });

      // The link's own label is a field too, the name standing in while it is empty.
      expect(await actions.sa_setSceneElementShowing(mine, scene, zedLink, "label")).toEqual({
        ok: true,
        showing: "label",
      });
      expect(await zedItem()).toMatchObject({ label: "Fixture Zed", showing: "label" });
      await db
        .update(tables.sceneElements)
        .set({ label: "Zed the Grey" })
        .where(eq(tables.sceneElements.idSceneElement, zedLink));
      expect(await zedItem()).toMatchObject({ label: "Zed the Grey", detail: "Harbourmaster" });
      await db
        .update(tables.sceneElements)
        .set({ label: null })
        .where(eq(tables.sceneElements.idSceneElement, zedLink));

      await actions.sa_setSceneElementShowing(mine, scene, zedLink, "initial_name");
      expect(await showingOf(scene)).toBe("initial_name");
    });

    it("refuses a field it does not know, a link that is not the scene's and another's scene", async () => {
      const zedLink = await linkOf(scene, zed);
      expect(await actions.sa_setSceneElementShowing(mine, scene, zedLink, "notes")).toEqual({
        ok: false,
        error: "Choose the initial name, the name, the title or the label.",
      });
      const empty = await sceneIn("ACTIVE", "Fixture scene without a showing");
      expect(await actions.sa_setSceneElementShowing(mine, empty, zedLink, "name")).toEqual({
        ok: false,
        error: "That element is not in this scene.",
      });
      expect(await actions.sa_setSceneElementShowing(theirs, theirScene, zedLink, "name")).toEqual({
        ok: false,
        error: "That scene is not part of this story.",
      });
    });

    it("links into the stack it is asked for, and refuses one the scene lacks", async () => {
      const target = await sceneIn("ACTIVE", "Fixture scene to link into a stack");

      const result = await actions.sa_linkSceneElement(mine, target, abbey, {
        tag: DEFAULT_TAGS[1],
      });
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
      expect(await actions.sa_setSceneElementStatus(mine, target, zed, "INVISIBLE")).toEqual(
        refused,
      );
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
      expect(await run.sa_setSceneStacks(mine, target, { tags: [], saveForStory: false })).toEqual({
        ok: false,
        errors: { tags: refused.error },
      });
      // Still linked, as it was; reading it still works.
      expect(await linksOf(target)).toEqual([{ idElement: zed, tags: [DEFAULT_TAGS[0]] }]);
      expect((await elementActions.sa_getElementDetail(mine, zed, target))?.link).not.toBeNull();
    });

    it("removes one link of an element from a scene, leaving it in the story and its copies in the scene", async () => {
      const target = await sceneIn("ACTIVE", "Fixture scene to remove from");
      const first = await actions.sa_linkSceneElement(mine, target, abbey);
      const copy = await actions.sa_linkSceneElement(mine, target, abbey);
      const firstLink = first.ok ? first.item.idSceneElement! : 0;
      const copyLink = copy.ok ? copy.item.idSceneElement! : 0;

      expect(await actions.sa_unlinkSceneElement(mine, target, firstLink)).toEqual({ ok: true });
      expect(await linksOf(target)).toEqual([{ idElement: abbey, tags: [DEFAULT_TAGS[0]] }]);
      // The panel, asked for the element, now finds the copy; asked for the
      // gone link, nothing.
      expect(await elementActions.sa_getElementDetail(mine, abbey, target)).toMatchObject({
        element: { name: "Fixture Abbey" },
        link: { idSceneElement: copyLink, label: "Fixture Abbey 1" },
      });
      expect(
        await elementActions.sa_getElementDetail(mine, abbey, target, firstLink),
      ).toMatchObject({
        link: null,
      });
      expect(await actions.sa_unlinkSceneElement(mine, target, copyLink)).toEqual({ ok: true });
      expect(await linksOf(target)).toEqual([]);
      // Gone already, and never in another's scene.
      expect(await actions.sa_unlinkSceneElement(mine, target, copyLink)).toEqual({
        ok: false,
        error: "That element is not in this scene.",
      });
      expect(await actions.sa_unlinkSceneElement(theirs, theirScene, copyLink)).toEqual({
        ok: false,
        error: "That scene is not part of this story.",
      });
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
      const idElement = elementIdOf(created.item);
      const idLink = created.item.idSceneElement!;

      const moved = await actions.sa_moveSceneElement(mine, target, idLink, "elements", "scene");
      expect(moved.ok && moved.item.sceneTags).toEqual(["scene"]);
      expect(await linksOf(target)).toEqual([{ idElement, tags: ["scene"] }]);

      // From a stack whose tag the link lacks, the target is only added.
      const added = await actions.sa_moveSceneElement(mine, target, idLink, null, "elements");
      expect(added.ok && added.item.sceneTags).toEqual(["scene", "elements"]);

      expect(await actions.sa_moveSceneElement(mine, target, idLink, "scene", "weather")).toEqual({
        ok: false,
        error: "That stack is no longer one of the scene's tags.",
      });
      expect(await actions.sa_moveSceneElement(theirs, theirScene, idLink, null, "scene")).toEqual({
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

      it("sends the link after the status menu, the info toggle, the name dropdown and a move", async () => {
        await openSession(mine, scene);
        const abbeyLink = await linkOf(scene, abbey);
        await actions.sa_setSceneElementStatus(mine, scene, abbeyLink, "INVISIBLE");
        await actions.sa_setSceneElementShowInfo(mine, scene, abbeyLink, false);
        await actions.sa_setSceneElementShowing(mine, scene, abbeyLink, "name");
        await actions.sa_moveSceneElement(mine, scene, abbeyLink, null, "scene");
        expect(calls("publishSceneElement")).toEqual([
          [mine, scene, abbeyLink],
          [mine, scene, abbeyLink],
          [mine, scene, abbeyLink],
          [mine, scene, abbeyLink],
        ]);
        await db
          .update(tables.sceneElements)
          .set({ status: "READY", tags: [], elementShowing: "initial_name", showInfo: true })
          .where(eq(tables.sceneElements.idElement, abbey));
      });

      it("sends a new pill by its link's id, which is what the players' table draws it by", async () => {
        await openSession(mine, scene);
        const made = await actions.sa_createSceneElement(
          mine,
          scene,
          null,
          form({ name: "Fixture new pill" }),
        );
        if (!made.ok) throw new Error(`refused: ${JSON.stringify(made)}`);
        try {
          expect(calls("publishSceneElement")).toEqual([[mine, scene, made.item.idSceneElement]]);
        } finally {
          await db
            .delete(tables.elements)
            .where(eq(tables.elements.idElement, Number(made.item.key.split(":")[1])));
        }
      });

      it("sends the tack's pulse as it is, link and action", async () => {
        await openSession(mine, scene);
        const abbeyLink = await linkOf(scene, abbey);
        await actions.sa_pulseSceneElement(mine, scene, abbeyLink, { action: "preview.open" });
        expect(calls("publishSceneElementPulse")).toEqual([
          [mine, scene, abbeyLink, { action: "preview.open" }],
        ]);
        // A pulse is not a change to the link, so the link itself is not sent.
        expect(calls("publishSceneElement")).toEqual([]);
      });

      it("sends a removal after Remove from scene, and links the element back", async () => {
        await openSession(mine, scene);
        const abbeyLink = await linkOf(scene, abbey);
        await actions.sa_unlinkSceneElement(mine, scene, abbeyLink);
        expect(calls("publishSceneElementRemoved")).toEqual([[mine, scene, abbey, abbeyLink]]);

        const back = await actions.sa_linkSceneElement(mine, scene, abbey);
        expect(calls("publishSceneElement")).toEqual([
          [mine, scene, back.ok ? back.item.idSceneElement : 0],
        ]);
      });

      it("says the scene changed after choosing one, and the session after renaming it", async () => {
        const session = await openSession(mine, null);
        await run.sa_loadRunScene(mine, scene);
        expect(calls("publishSceneChanged")).toEqual([[mine]]);

        await sessions.sa_setSessionTitle(mine, session, "Kildealg");
        expect(calls("publishSessionUpdated")).toEqual([[mine, session, "Kildealg"]]);

        // Writing the scene up says it changed too, so the players read it afresh.
        await run.sa_setSceneText(mine, scene, { description: "Fog.", notes: "" });
        expect(calls("publishSceneChanged")).toEqual([[mine], [mine]]);
      });

      it("sends the element after a library edit or a new picture", async () => {
        await openSession(mine, scene);
        await elementActions.sa_setElementImage(mine, zed, null);
        await elementActions.sa_setElementTags(mine, zed, ["docks"]);
        expect(calls("publishElementChanged")).toEqual([
          [mine, zed],
          [mine, zed],
        ]);
        await elementActions.sa_setElementTags(mine, zed, []);
      });

      it("says nothing when a write is refused", async () => {
        await actions.sa_setSceneElementStatus(theirs, theirScene, 2 ** 20, "INVISIBLE");
        await actions.sa_unlinkSceneElement(mine, scene, 2 ** 20);
        for (const fn of Object.values(published)) expect(fn.mock.calls).toHaveLength(0);
      });
    });
  },
);
const linksOf = (...args: Parameters<SceneFixture["linksOf"]>) => fx.linksOf(...args);
const linkOf = (...args: Parameters<SceneFixture["linkOf"]>) => fx.linkOf(...args);
const showInfoOf = (...args: Parameters<SceneFixture["showInfoOf"]>) => fx.showInfoOf(...args);
const form = elementForm;
