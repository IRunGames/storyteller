// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. What a player is given for an
// element's picture in a scene, read the two ways the players' side reads
// it: sceneItems (the players' table, the preview, the storyboard) and
// sceneLink (every realtime element message). Makes a story with a scene, an
// element linked to it and two pictures for a test user of its own, and
// takes them away again in `after`.
import { after, before, beforeEach, it } from "node:test";
import { expect } from "expect";
import { and, eq, inArray } from "drizzle-orm";

import { describeWithDb, type Db, type Tables } from "@/test/db-suite";
import type { AnnotationMode, AnnotationOp } from "@/lib/annotation-schemas";

const STORE = "https://abc.public.blob.vercel-storage.com";
const MAP_URL = `${STORE}/uploads/u/map.png`;
const OTHER_URL = `${STORE}/uploads/u/other.png`;
const COPY_URL = `${STORE}/annotations/1/players-copy-x.webp`;
const OTHER_COPY_URL = `${STORE}/annotations/2/players-copy-y.webp`;

let sceneItems: typeof import("./scene-items").sceneItems;
let sceneLink: typeof import("./scene-items").sceneLink;
let spaceFor: typeof import("./scene-space").spaceFor;
let urls: typeof import("./attachment-url");
let db: Db;
let tables: Tables;
let storyId = 0;
let sceneId = 0;
let elementId = 0;
let linkId = 0;
let mapId = 0;
let otherId = 0;

describeWithDb(
  "the picture players are given",
  { email: "db-attachment-url@example.test" },
  (suite) => {
    before(async () => {
      ({ db, tables } = suite);
      ({ sceneItems, sceneLink } = await import("./scene-items"));
      ({ spaceFor } = await import("./scene-space"));
      urls = await import("./attachment-url");
      const user = suite.testUser;
      [{ id: storyId }] = await db
        .insert(tables.stories)
        .values({ title: "Players' picture fixture story", idCreatedByUser: user })
        .returning({ id: tables.stories.idStory });
      [{ id: sceneId }] = await db
        .insert(tables.storyScenes)
        .values({ idStory: storyId, sceneTitle: "Fixture scene", idCreatedByUser: user })
        .returning({ id: tables.storyScenes.idStoryScene });
      [{ id: elementId }] = await db
        .insert(tables.elements)
        .values({ idStory: storyId, kind: "PLACE", name: "Map", idCreatedByUser: user })
        .returning({ id: tables.elements.idElement });
      [{ id: linkId }] = await db
        .insert(tables.sceneElements)
        .values({ idStoryScene: sceneId, idElement: elementId, idCreatedByUser: user })
        .returning({ id: tables.sceneElements.idSceneElement });
      [{ id: mapId }, { id: otherId }] = await db
        .insert(tables.attachments)
        .values([
          {
            idStory: storyId,
            status: "READY",
            url: MAP_URL,
            isUploaded: true,
            idCreatedByUser: user,
          },
          {
            idStory: storyId,
            status: "READY",
            url: OTHER_URL,
            isUploaded: true,
            idCreatedByUser: user,
          },
        ])
        .returning({ id: tables.attachments.idAttachment });
    });

    after(async () => {
      if (!db) return;
      // The story takes its scene, element and link with it; the pictures their drawings.
      if (storyId) await db.delete(tables.stories).where(eq(tables.stories.idStory, storyId));
      if (mapId) {
        await db
          .delete(tables.attachments)
          .where(inArray(tables.attachments.idAttachment, [mapId, otherId]));
      }
    });

    // Each case starts from the map as the element's cover, no link cover and no drawing.
    beforeEach(async () => {
      await db
        .delete(tables.attachmentAnnotations)
        .where(inArray(tables.attachmentAnnotations.idAttachment, [mapId, otherId]));
      await db
        .delete(tables.attachmentUses)
        .where(inArray(tables.attachmentUses.idAttachment, [mapId, otherId]));
      await useAsCover("ELEMENT", elementId, mapId);
    });

    async function useAsCover(kind: string, idExternal: number, idAttachment: number) {
      await db.insert(tables.attachmentUses).values({
        idAttachment,
        kind,
        idExternal,
        tags: ["cover"],
        idCreatedByUser: suite.testUser,
      });
    }

    // A drawing on a picture, the map unless another is named.
    async function draw(values: Partial<Tables["attachmentAnnotations"]["$inferInsert"]> = {}) {
      await db.insert(tables.attachmentAnnotations).values({
        idAttachment: mapId,
        width: 100,
        height: 50,
        idCreatedByUser: suite.testUser,
        ...values,
      });
    }

    async function playersPicture() {
      const [item] = await sceneItems(storyId, sceneId);
      const link = await sceneLink(storyId, linkId);
      // The two reads must agree, or a message would show players another picture.
      expect(link?.imageUrl).toBe(item.imageUrl);
      return item.imageUrl;
    }

    it("is the element's cover when it is not annotated", async () => {
      expect(await playersPicture()).toBe(MAP_URL);
    });

    it("is the players' copy when the picture is annotated", async () => {
      await draw({ playerUrl: COPY_URL, playerRevision: 0 });
      expect(await playersPicture()).toBe(COPY_URL);
    });

    it("is nothing, never the raw picture, while the first players' copy is still rendering", async () => {
      await draw();
      expect(await playersPicture()).toBeNull();
    });

    it("is the picture again once it is no longer annotated", async () => {
      await draw({ playerUrl: COPY_URL, isActive: false });
      expect(await playersPicture()).toBe(MAP_URL);
    });

    it("is the link's own cover in the scene, as it is when that picture is not annotated", async () => {
      await draw({ playerUrl: COPY_URL });
      await useAsCover("SCENE_ELEMENT", linkId, otherId);
      expect(await playersPicture()).toBe(OTHER_URL);
    });

    it("is the players' copy of the link's own cover when that picture is annotated", async () => {
      await draw({ idAttachment: otherId, playerUrl: OTHER_COPY_URL });
      await useAsCover("SCENE_ELEMENT", linkId, otherId);
      expect(await playersPicture()).toBe(OTHER_COPY_URL);
    });

    it("is nothing while the link's own annotated cover has no copy yet", async () => {
      await draw({ idAttachment: otherId });
      await useAsCover("SCENE_ELEMENT", linkId, otherId);
      expect(await playersPicture()).toBeNull();
    });

    it("follows the element to another picture, the drawing staying on the one it was made on", async () => {
      await draw({ playerUrl: COPY_URL });
      await db
        .update(tables.attachmentUses)
        .set({ idAttachment: otherId })
        .where(
          and(
            eq(tables.attachmentUses.kind, "ELEMENT"),
            eq(tables.attachmentUses.idExternal, elementId),
          ),
        );
      expect(await playersPicture()).toBe(OTHER_URL);
    });

    // The storyteller's pill shows the picture as the players see it once its
    // copy is rendered, the picture itself until then (only they are given
    // it), and is told whether it is annotated, for its fog mark.
    async function storytellersPill() {
      const { inPlay } = await spaceFor(storyId, sceneId);
      return { imageUrl: inPlay[0].imageUrl, annotated: inPlay[0].annotated ?? false };
    }

    it("shows the storyteller the players' copy once rendered, the picture until then", async () => {
      expect(await storytellersPill()).toEqual({ imageUrl: MAP_URL, annotated: false });
      await draw();
      expect(await storytellersPill()).toEqual({ imageUrl: MAP_URL, annotated: true });
      await db
        .update(tables.attachmentAnnotations)
        .set({ playerUrl: COPY_URL })
        .where(eq(tables.attachmentAnnotations.idAttachment, mapId));
      expect(await storytellersPill()).toEqual({ imageUrl: COPY_URL, annotated: true });
      await db
        .update(tables.attachmentAnnotations)
        .set({ isActive: false })
        .where(eq(tables.attachmentAnnotations.idAttachment, mapId));
      expect(await storytellersPill()).toEqual({ imageUrl: MAP_URL, annotated: false });
    });

    it("marks the pill by the picture it shows, the link's own where it has one", async () => {
      await draw({ playerUrl: COPY_URL });
      await useAsCover("SCENE_ELEMENT", linkId, otherId);
      expect(await storytellersPill()).toEqual({ imageUrl: OTHER_URL, annotated: false });
      await draw({ idAttachment: otherId });
      expect(await storytellersPill()).toEqual({ imageUrl: OTHER_URL, annotated: true });
    });

    // A picture whose players' copy shows nothing of it carries a note
    // saying so. Every read that hands out a players' copy says whether it is
    // covered, through the one SQL fragment, so the map's drawing is checked
    // through all of them at once: they must agree, or a pill and its preview
    // would say different things.
    async function expectFogCovered(expected: boolean) {
      const [item] = await sceneItems(storyId, sceneId);
      const link = await sceneLink(storyId, linkId);
      const { inPlay } = await spaceFor(storyId, sceneId);
      const [element] = await db
        .select({
          covered: urls.elementPictureFogCovered("elements"),
          picture: urls.elementPicture("elements"),
        })
        .from(tables.elements)
        .where(eq(tables.elements.idElement, elementId));
      const [scene] = await db
        .select({ picture: urls.scenePicture("scene_elements", "elements") })
        .from(tables.sceneElements)
        .innerJoin(tables.elements, eq(tables.elements.idElement, tables.sceneElements.idElement))
        .where(eq(tables.sceneElements.idSceneElement, linkId));
      const [file] = await db
        .select({ covered: urls.attachmentFogCovered("attachments") })
        .from(tables.attachments)
        .where(eq(tables.attachments.idAttachment, mapId));
      expect({
        players: item.fogCovered,
        message: link?.fogCovered,
        pill: inPlay[0].fogCovered === true,
        element: element.covered,
        elementControls: element.picture?.fogCovered,
        linkControls: scene.picture?.fogCovered,
        file: file.covered,
      }).toEqual({
        players: expected,
        message: expected,
        pill: expected,
        element: expected,
        elementControls: expected,
        linkControls: expected,
        file: expected,
      });
    }

    const brush = (mode: AnnotationMode): AnnotationOp => ({
      t: "brush",
      mode,
      radius: 5,
      points: [10, 10, 20, 10],
    });
    const rect = (mode: AnnotationMode): AnnotationOp => ({
      t: "rect",
      mode,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    });
    const flood = (mode: AnnotationMode): AnnotationOp => ({
      t: "flood",
      mode,
      rings: [[0, 0, 40, 0, 40, 40]],
    });
    const fogAll = (mode: AnnotationMode): AnnotationOp => ({ t: "fogAll", mode });

    // The map annotated with its players' copy rendered at full fog, the
    // steps given.
    async function drawRendered(
      ops: AnnotationOp[],
      values: Partial<Tables["attachmentAnnotations"]["$inferInsert"]> = {},
    ) {
      await draw({ ops, playerUrl: COPY_URL, playerRevision: 0, ...values });
    }

    it("is covered in fog while nothing of a new drawing is revealed", async () => {
      await drawRendered([]);
      await expectFogCovered(true);
    });

    it("is covered in fog again once Cover all follows what was revealed", async () => {
      await drawRendered([brush("reveal"), rect("reveal"), flood("reveal"), fogAll("cover")]);
      await expectFogCovered(true);
    });

    it("is not covered once a brush, a rectangle or a flood reveals after the last Cover all", async () => {
      for (const reveal of [brush("reveal"), rect("reveal"), flood("reveal")]) {
        await db
          .delete(tables.attachmentAnnotations)
          .where(eq(tables.attachmentAnnotations.idAttachment, mapId));
        await drawRendered([fogAll("cover"), reveal]);
        await expectFogCovered(false);
      }
    });

    // A new drawing is fogged whole with no Cover all among its steps.
    it("is not covered once a brush reveals, with no Cover all at all", async () => {
      await drawRendered([brush("reveal")]);
      await expectFogCovered(false);
    });

    it("is not covered after Clear all, fog laid down after it or not", async () => {
      await drawRendered([fogAll("cover"), fogAll("reveal")]);
      await expectFogCovered(false);
      await db
        .update(tables.attachmentAnnotations)
        .set({ ops: [fogAll("reveal"), brush("cover"), rect("cover"), flood("cover")] })
        .where(eq(tables.attachmentAnnotations.idAttachment, mapId));
      await expectFogCovered(false);
    });

    it("pays no heed to walls, the wall eraser, pen marks or fog laid down", async () => {
      await drawRendered([
        { t: "wall", points: [0, 0, 50, 50] },
        { t: "wallErase", targets: [0] },
        { t: "pen", color: "#ff0000", width: 2, points: [5, 5, 30, 30] },
        { t: "shape", shape: "circle", color: "#ff0000", width: 2, cx: 20, cy: 20, r: 5 },
        { t: "erase", targets: [2] },
        { t: "penClear" },
        brush("cover"),
      ]);
      await expectFogCovered(true);
    });

    it("is not covered while the players' fog is less than full", async () => {
      await drawRendered([], { fogOpacityPlayers: 90 });
      await expectFogCovered(false);
    });

    it("is not covered while the drawing is off, the players being given the picture", async () => {
      await drawRendered([], { isActive: false });
      await expectFogCovered(false);
    });

    it("is not covered while the players' copy is still being rendered", async () => {
      await draw({ ops: [] });
      await expectFogCovered(false);
    });

    it("is not covered when the picture has no drawing", async () => {
      await expectFogCovered(false);
    });

    // The storyteller's full-size previews mark a players' copy with fog on
    // it anywhere, whether it is covered whole or not. Every storyteller-side
    // read says so through the one SQL fragment, so they are checked
    // together; the players' reads do not work it out at all.
    async function expectFogActive(expected: boolean) {
      const [item] = await sceneItems(storyId, sceneId, [], { fogActive: true });
      const { inPlay } = await spaceFor(storyId, sceneId);
      const [element] = await db
        .select({
          active: urls.elementPictureFogActive("elements"),
          picture: urls.elementPicture("elements"),
        })
        .from(tables.elements)
        .where(eq(tables.elements.idElement, elementId));
      const [scene] = await db
        .select({ picture: urls.scenePicture("scene_elements", "elements") })
        .from(tables.sceneElements)
        .innerJoin(tables.elements, eq(tables.elements.idElement, tables.sceneElements.idElement))
        .where(eq(tables.sceneElements.idSceneElement, linkId));
      const [file] = await db
        .select({ active: urls.attachmentFogActive("attachments") })
        .from(tables.attachments)
        .where(eq(tables.attachments.idAttachment, mapId));
      expect({
        item: item.fogActive,
        pill: inPlay[0].fogActive === true,
        element: element.active,
        elementControls: element.picture?.fogActive,
        linkControls: scene.picture?.fogActive,
        file: file.active,
      }).toEqual({
        item: expected,
        pill: expected,
        element: expected,
        elementControls: expected,
        linkControls: expected,
        file: expected,
      });
    }

    it("has fog active when nothing is drawn but a brush reveals, or the steps are empty", async () => {
      await drawRendered([]);
      await expectFogActive(true);
      await db
        .update(tables.attachmentAnnotations)
        .set({ ops: [brush("reveal")] })
        .where(eq(tables.attachmentAnnotations.idAttachment, mapId));
      await expectFogActive(true);
    });

    it("has fog active after a Cover all, whatever was revealed before it", async () => {
      await drawRendered([fogAll("reveal"), brush("reveal"), fogAll("cover")]);
      await expectFogActive(true);
    });

    it("has no fog active after Clear all alone, or with only walls and pen marks after it", async () => {
      await drawRendered([brush("cover"), fogAll("reveal")]);
      await expectFogActive(false);
      await db
        .update(tables.attachmentAnnotations)
        .set({
          ops: [
            fogAll("reveal"),
            { t: "wall", points: [0, 0, 50, 50] },
            { t: "pen", color: "#ff0000", width: 2, points: [5, 5, 30, 30] },
            brush("reveal"),
          ],
        })
        .where(eq(tables.attachmentAnnotations.idAttachment, mapId));
      await expectFogActive(false);
    });

    it("has fog active once a brush, a rectangle or a flood lays fog after Clear all", async () => {
      for (const cover of [brush("cover"), rect("cover"), flood("cover")]) {
        await db
          .delete(tables.attachmentAnnotations)
          .where(eq(tables.attachmentAnnotations.idAttachment, mapId));
        await drawRendered([fogAll("reveal"), cover]);
        await expectFogActive(true);
      }
    });

    it("counts only the fog laid after the last Clear all", async () => {
      await drawRendered([fogAll("reveal"), brush("cover"), fogAll("reveal")]);
      await expectFogActive(false);
    });

    it("has fog active after Clear all and then Cover all", async () => {
      await drawRendered([fogAll("reveal"), fogAll("cover")]);
      await expectFogActive(true);
    });

    it("has no fog active while the players' fog is 0, the drawing is off, the copy is not rendered or there is no drawing", async () => {
      await drawRendered([], { fogOpacityPlayers: 0 });
      await expectFogActive(false);
      await db
        .delete(tables.attachmentAnnotations)
        .where(eq(tables.attachmentAnnotations.idAttachment, mapId));
      await drawRendered([], { isActive: false });
      await expectFogActive(false);
      await db
        .delete(tables.attachmentAnnotations)
        .where(eq(tables.attachmentAnnotations.idAttachment, mapId));
      await draw({ ops: [] });
      await expectFogActive(false);
      await db
        .delete(tables.attachmentAnnotations)
        .where(eq(tables.attachmentAnnotations.idAttachment, mapId));
      await expectFogActive(false);
    });

    it("has fog active at less than full players' fog, where the picture is not covered whole", async () => {
      await drawRendered([], { fogOpacityPlayers: 40 });
      await expectFogActive(true);
      await expectFogCovered(false);
    });

    it("has fog active wherever the picture is covered in fog", async () => {
      // Each of these is covered whole, which the first assertion pins, so
      // the second always has something to check.
      const cases: AnnotationOp[][] = [
        [],
        [fogAll("cover")],
        [brush("reveal"), fogAll("cover")],
        [fogAll("reveal"), fogAll("cover"), brush("cover")],
      ];
      for (const ops of cases) {
        await db
          .delete(tables.attachmentAnnotations)
          .where(eq(tables.attachmentAnnotations.idAttachment, mapId));
        await drawRendered(ops);
        const [{ covered, active }] = await db
          .select({
            covered: urls.attachmentFogCovered("attachments"),
            active: urls.attachmentFogActive("attachments"),
          })
          .from(tables.attachments)
          .where(eq(tables.attachments.idAttachment, mapId));
        expect(covered).toBe(true);
        expect(active).toBe(true);
      }
    });

    it("is not worked out for the players' read, which never carries it", async () => {
      await drawRendered([]);
      const [item] = await sceneItems(storyId, sceneId);
      expect(item.fogActive).toBe(false);
      const link = await sceneLink(storyId, linkId);
      expect(link?.fogActive).toBe(false);
    });
  },
);
