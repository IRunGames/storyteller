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

const STORE = "https://abc.public.blob.vercel-storage.com";
const MAP_URL = `${STORE}/uploads/u/map.png`;
const OTHER_URL = `${STORE}/uploads/u/other.png`;
const COPY_URL = `${STORE}/annotations/1/players-copy-x.webp`;
const OTHER_COPY_URL = `${STORE}/annotations/2/players-copy-y.webp`;

let sceneItems: typeof import("./scene-items").sceneItems;
let sceneLink: typeof import("./scene-items").sceneLink;
let spaceFor: typeof import("./scene-space").spaceFor;
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
  },
);
