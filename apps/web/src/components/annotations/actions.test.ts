// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. A picture's annotation: turning
// it on and off, saving the drawing, asking for the players' copy, and
// finding the picture a pill shows. The fixture is test/scene-fixtures.ts's:
// a story of the test user's with elements in a scene, and a story belonging
// to someone else. The picture's fetch and measure and the players' copy
// render are stood in for: the picture's address is not a real blob, and
// rendering is lib/players-copy.test.ts's.
import { after, before, beforeEach, it, mock } from "node:test";
import { createRequire } from "node:module";
import { expect } from "expect";
import { eq, inArray } from "drizzle-orm";

import type { AnnotationOp } from "@/lib/annotation-schemas";
import {
  DRAWING_CHANGED_ELSEWHERE,
  NO_PICTURE_TO_ANNOTATE,
  NOT_THIS_STORYS_ATTACHMENT,
  PICTURE_UNREADABLE,
} from "@/lib/messages";
import { describeWithDb, type Db, type Tables } from "@/test/db-suite";
import {
  type SceneFixture,
  makeSceneFixture,
  mockPublishing,
  publishMocks,
} from "@/test/scene-fixtures";

const STORE = "https://abc.public.blob.vercel-storage.com";
const MAP_URL = `${STORE}/uploads/u/map.png`;
const TOWER_URL = `${STORE}/uploads/u/tower.png`;

const mocks = publishMocks();
const renderPlayersCopyLater = mock.fn((_idStory: number, _idAttachment: number) => {});
const fetchUploadedPicture = mock.fn(async (_url: string) => Buffer.from("png"));
const measurePicture = mock.fn(async (_picture: Buffer) => ({ width: 400, height: 200 }));
// del() really would reach Vercel Blob, so it is swapped on the require-cached
// module, as components/uploads/actions.test.ts does.
const requireHere = createRequire(__filename);
const del = mock.fn(async (_url: string | string[]) => {});
let originalDel: unknown;
const COPY_URL = `${STORE}/annotations/old-copy.webp`;

let actions: typeof import("./actions");
let db: Db;
let tables: Tables;
let fx: SceneFixture;
let mine = 0;
let zed = 0;
let map = 0;
let tower = 0;
let typed = 0;
let unfinished = 0;
let theirPicture = 0;

const brush: AnnotationOp = { t: "brush", mode: "reveal", radius: 10, points: [1, 2, 3, 4] };
const pen: AnnotationOp = { t: "pen", color: "#e53935", width: 2, points: [5, 6] };

describeWithDb("annotation actions", { email: "annotation-actions@example.test" }, (suite) => {
  before(async () => {
    mockPublishing(mocks);
    const blobModule: { del: unknown } = requireHere("@vercel/blob");
    originalDel = blobModule.del;
    blobModule.del = del;
    mock.module("@/lib/players-copy", { namedExports: { renderPlayersCopyLater } });
    mock.module("@/lib/annotation-render", {
      namedExports: { fetchUploadedPicture, measurePicture },
    });
    ({ db, tables } = suite);
    actions = await import("./actions");
    fx = await makeSceneFixture(suite, "Annotation actions fixture");
    ({ mine, zed } = fx);
    [{ id: map }, { id: tower }, { id: typed }, { id: unfinished }, { id: theirPicture }] = await db
      .insert(tables.attachments)
      .values([
        { idStory: mine, status: "READY", url: MAP_URL, isUploaded: true },
        { idStory: mine, status: "READY", url: TOWER_URL, isUploaded: true },
        { idStory: mine, status: "READY", url: "https://x.test/typed.png", isUploaded: false },
        { idStory: mine, status: "UPLOADING", isUploaded: true },
        { idStory: fx.theirs, status: "READY", url: `${STORE}/uploads/v/x.png`, isUploaded: true },
      ])
      .returning({ id: tables.attachments.idAttachment });
    await db
      .insert(tables.attachmentUses)
      .values({ idAttachment: map, kind: "ELEMENT", idExternal: zed, tags: ["cover"] });
  });

  // Each case starts from no drawing on any picture.
  beforeEach(async () => {
    await db
      .delete(tables.attachmentAnnotations)
      .where(inArray(tables.attachmentAnnotations.idAttachment, [map, tower]));
    renderPlayersCopyLater.mock.resetCalls();
    measurePicture.mock.resetCalls();
    fetchUploadedPicture.mock.resetCalls();
    fetchUploadedPicture.mock.restore();
    mocks.published.publishPictureChanged.mock.resetCalls();
    del.mock.resetCalls();
  });

  after(async () => {
    const blobModule: { del: unknown } = requireHere("@vercel/blob");
    blobModule.del = originalDel;
    if (!db) return;
    if (map) {
      await db
        .delete(tables.attachments)
        .where(
          inArray(tables.attachments.idAttachment, [map, tower, typed, unfinished, theirPicture]),
        );
    }
    await fx.remove();
  });

  async function annotate() {
    const result = await actions.sa_setAnnotated(map, true);
    if (!result.ok || !result.annotation) throw new Error("not annotated");
    return result.annotation;
  }

  async function stored() {
    const [row] = await db
      .select()
      .from(tables.attachmentAnnotations)
      .where(eq(tables.attachmentAnnotations.idAttachment, map));
    return row;
  }

  it("annotates an uploaded picture, fogged whole, and tells the players", async () => {
    const annotation = await annotate();

    expect(annotation).toEqual({
      idAttachment: map,
      imageUrl: MAP_URL,
      isActive: true,
      width: 400,
      height: 200,
      ops: [],
      revision: 0,
      fogOpacityPlayers: 100,
      fogColor: "#1b1d23",
    });
    expect(fetchUploadedPicture.mock.calls.map((call) => call.arguments[0])).toEqual([MAP_URL]);
    expect(await stored()).toMatchObject({ isActive: true, playerUrl: null });
    // The players drop the raw picture at once, and are shown the copy once it is rendered.
    expect(mocks.published.publishPictureChanged.mock.calls.map((c) => c.arguments)).toEqual([
      [mine, map],
    ]);
    expect(renderPlayersCopyLater.mock.calls.map((c) => c.arguments)).toEqual([[mine, map]]);
  });

  it("keeps the drawing when the annotation is turned off, and has it back when turned on", async () => {
    const annotation = await annotate();
    await actions.sa_saveAnnotation(map, {
      baseRevision: annotation.revision,
      keep: 0,
      append: [brush],
    });

    const off = await actions.sa_setAnnotated(map, false);
    expect(off).toMatchObject({ ok: true, annotation: { isActive: false, ops: [brush] } });
    expect(mocks.published.publishPictureChanged.mock.callCount()).toBe(2);

    measurePicture.mock.resetCalls();
    const on = await actions.sa_setAnnotated(map, true);
    expect(on).toMatchObject({ ok: true, annotation: { isActive: true, ops: [brush] } });
    expect(measurePicture.mock.callCount()).toBe(0);
  });

  it("refuses a typed link, an unfinished upload, and another story's picture", async () => {
    for (const id of [typed, unfinished]) {
      expect(await actions.sa_setAnnotated(id, true)).toEqual({
        ok: false,
        error: NO_PICTURE_TO_ANNOTATE,
      });
    }
    expect(await actions.sa_setAnnotated(theirPicture, true)).toEqual({
      ok: false,
      error: NOT_THIS_STORYS_ATTACHMENT,
    });
    const drawings = await db
      .select({ id: tables.attachmentAnnotations.idAttachment })
      .from(tables.attachmentAnnotations)
      .where(inArray(tables.attachmentAnnotations.idAttachment, [typed, unfinished, theirPicture]));
    expect(drawings).toEqual([]);
  });

  it("says so when the picture cannot be read, and makes no drawing", async () => {
    fetchUploadedPicture.mock.mockImplementation(async () => {
      throw new Error("gone");
    });
    expect(await actions.sa_setAnnotated(map, true)).toEqual({
      ok: false,
      error: PICTURE_UNREADABLE,
    });
    expect(await stored()).toBeUndefined();
  });

  it("saves steps drawn, undone and drawn again, each save a revision, and asks for a render", async () => {
    const { revision } = await annotate();
    renderPlayersCopyLater.mock.resetCalls();

    const drawn = await actions.sa_saveAnnotation(map, {
      baseRevision: revision,
      keep: 0,
      append: [brush, pen],
    });
    expect(drawn).toEqual({ ok: true, revision: 1 });
    // The last step undone and another drawn, in one save.
    const redrawn = await actions.sa_saveAnnotation(map, {
      baseRevision: 1,
      keep: 1,
      append: [{ t: "fogAll", mode: "reveal" }],
      fogOpacityPlayers: 60,
    });
    expect(redrawn).toEqual({ ok: true, revision: 2 });
    expect(await stored()).toMatchObject({
      ops: [brush, { t: "fogAll", mode: "reveal" }],
      revision: 2,
      fogOpacityPlayers: 60,
    });
    expect(renderPlayersCopyLater.mock.callCount()).toBe(2);

    // Nothing to save is no save.
    expect(await actions.sa_saveAnnotation(map, { baseRevision: 2, keep: 2, append: [] })).toEqual({
      ok: true,
      revision: 2,
    });
    expect(renderPlayersCopyLater.mock.callCount()).toBe(2);
  });

  it("saves the fog's color, a new revision the players' copy is rendered from", async () => {
    await annotate();
    renderPlayersCopyLater.mock.resetCalls();
    expect(
      await actions.sa_saveAnnotation(map, {
        baseRevision: 0,
        keep: 0,
        append: [],
        fogColor: "#e9dcbf",
      }),
    ).toEqual({ ok: true, revision: 1 });
    expect(await stored()).toMatchObject({ fogColor: "#e9dcbf", revision: 1 });
    expect(renderPlayersCopyLater.mock.callCount()).toBe(1);
    expect(await actions.sa_getAnnotation(map)).toMatchObject({ fogColor: "#e9dcbf" });
  });

  it("takes away marks with the eraser, and refuses one that names anything else", async () => {
    await annotate();
    const shape: AnnotationOp = {
      t: "shape",
      shape: "triangle",
      color: "#e53935",
      width: 3,
      cx: 50,
      cy: 50,
      r: 20,
    };
    expect(
      await actions.sa_saveAnnotation(map, {
        baseRevision: 0,
        keep: 0,
        append: [brush, pen, shape],
      }),
    ).toEqual({ ok: true, revision: 1 });
    expect(
      await actions.sa_saveAnnotation(map, {
        baseRevision: 1,
        keep: 3,
        append: [{ t: "erase", targets: [1, 2] }],
      }),
    ).toEqual({ ok: true, revision: 2 });

    // The brush stroke is fog, not an annotation: no eraser takes it away.
    const refused = await actions.sa_saveAnnotation(map, {
      baseRevision: 2,
      keep: 4,
      append: [{ t: "erase", targets: [0] }],
    });
    expect(refused).toEqual({
      ok: false,
      error: "An eraser can only take away a mark drawn before it.",
    });
    expect((await stored()).revision).toBe(2);
  });

  it("refuses a save made from a drawing that has moved on since, so the page loads it again", async () => {
    await annotate();
    await actions.sa_saveAnnotation(map, { baseRevision: 0, keep: 0, append: [pen] });

    const stale = { ok: false, error: DRAWING_CHANGED_ELSEWHERE, stale: true };
    expect(
      await actions.sa_saveAnnotation(map, { baseRevision: 0, keep: 0, append: [brush] }),
    ).toEqual(stale);
    expect(await actions.sa_saveAnnotation(map, { baseRevision: 1, keep: 2, append: [] })).toEqual(
      stale,
    );
    expect((await stored()).ops).toEqual([pen]);
  });

  it("refuses a step it does not know, and another story's picture", async () => {
    await annotate();
    const bad = await actions.sa_saveAnnotation(map, {
      baseRevision: 0,
      keep: 0,
      append: [{ t: "pen", color: "red", width: 2, points: [1, 2] } as unknown as AnnotationOp],
    });
    expect(bad.ok).toBe(false);
    expect(
      await actions.sa_saveAnnotation(theirPicture, { baseRevision: 0, keep: 0, append: [] }),
    ).toEqual({ ok: false, error: NOT_THIS_STORYS_ATTACHMENT });
    expect((await stored()).revision).toBe(0);
  });

  it("gives the storyteller the drawing and the raw picture, and nobody else", async () => {
    await annotate();
    expect(await actions.sa_getAnnotation(map)).toMatchObject({ imageUrl: MAP_URL, ops: [] });
    expect(await actions.sa_getAnnotation(theirPicture)).toBeNull();
    expect(await actions.sa_getAnnotation(tower)).toBeNull();
  });

  it("asks for a render on a refresh only while the players' copy is behind", async () => {
    await annotate();
    renderPlayersCopyLater.mock.resetCalls();
    // Behind, so the annotator asks again a little later.
    expect(await actions.sa_refreshPlayersCopy(map)).toEqual({ ok: true, behind: true });
    expect(renderPlayersCopyLater.mock.callCount()).toBe(1);

    await db
      .update(tables.attachmentAnnotations)
      .set({ playerRevision: 0, playerUrl: `${STORE}/annotations/copy.webp` })
      .where(eq(tables.attachmentAnnotations.idAttachment, map));
    expect(await actions.sa_refreshPlayersCopy(map)).toEqual({ ok: true, behind: false });
    expect(renderPlayersCopyLater.mock.callCount()).toBe(1);
  });

  it("finds the picture a pill shows, the link's own in front of the element's", async () => {
    const link = await fx.linkOf(fx.scene, zed);
    expect(await actions.sa_getScenePicture(mine, link)).toEqual({
      idAttachment: map,
      shownUrl: MAP_URL,
      canAnnotate: true,
      hasDrawing: false,
      isAnnotated: false,
    });

    await db
      .insert(tables.attachmentUses)
      .values({ idAttachment: tower, kind: "SCENE_ELEMENT", idExternal: link, tags: ["cover"] });
    try {
      await db
        .insert(tables.attachmentAnnotations)
        .values({ idAttachment: tower, width: 10, height: 10, isActive: false });
      expect(await actions.sa_getScenePicture(mine, link)).toEqual({
        idAttachment: tower,
        shownUrl: TOWER_URL,
        canAnnotate: true,
        hasDrawing: true,
        isAnnotated: false,
      });
      expect(await actions.sa_getScenePicture(fx.theirs, link)).toBeNull();
    } finally {
      await db.delete(tables.attachmentUses).where(eq(tables.attachmentUses.idAttachment, tower));
    }
  });

  it("opens the annotator on a picture with no drawing, fogged whole, without showing it the players", async () => {
    const opened = await actions.sa_openAnnotation(map);
    expect(opened).toMatchObject({
      ok: true,
      annotation: { idAttachment: map, isActive: false, ops: [], width: 400, height: 200 },
    });
    expect(await stored()).toMatchObject({ isActive: false });
    expect(mocks.published.publishPictureChanged.mock.callCount()).toBe(0);
    expect(renderPlayersCopyLater.mock.callCount()).toBe(0);
    // Opened again, the same drawing.
    measurePicture.mock.resetCalls();
    expect(await actions.sa_openAnnotation(map)).toMatchObject({ ok: true });
    expect(measurePicture.mock.callCount()).toBe(0);
    expect(await actions.sa_openAnnotation(typed)).toEqual({
      ok: false,
      error: NO_PICTURE_TO_ANNOTATE,
    });
  });

  // Annotating a picture in the annotator is annotating it for the players.
  it("turns the annotation on with the first change saved in the annotator", async () => {
    await actions.sa_openAnnotation(map);
    expect(
      await actions.sa_saveAnnotation(map, { baseRevision: 0, keep: 0, append: [brush] }),
    ).toEqual({ ok: true, revision: 1 });
    expect(await stored()).toMatchObject({ isActive: true, revision: 1 });
    expect(mocks.published.publishPictureChanged.mock.calls.map((c) => c.arguments)).toEqual([
      [mine, map],
    ]);
    expect(renderPlayersCopyLater.mock.calls.map((c) => c.arguments)).toEqual([[mine, map]]);
  });

  // A copy rendered before the drawing was turned off shows less of what was
  // covered since: the players are shown nothing until one is rendered afresh.
  it("drops a players' copy that is behind the drawing as the picture is turned on again", async () => {
    await db.insert(tables.attachmentAnnotations).values({
      idAttachment: map,
      width: 10,
      height: 10,
      isActive: false,
      revision: 3,
      playerRevision: 2,
      playerUrl: COPY_URL,
    });
    expect(await actions.sa_setAnnotated(map, true)).toMatchObject({ ok: true });
    expect(await stored()).toMatchObject({ isActive: true, playerUrl: null, playerRevision: null });
    expect(del.mock.calls.map((call) => call.arguments[0])).toEqual([COPY_URL]);

    // Turned on by a save, the same.
    await db
      .update(tables.attachmentAnnotations)
      .set({ isActive: false, playerUrl: COPY_URL, playerRevision: 3 })
      .where(eq(tables.attachmentAnnotations.idAttachment, map));
    del.mock.resetCalls();
    await actions.sa_saveAnnotation(map, { baseRevision: 3, keep: 0, append: [pen] });
    expect(await stored()).toMatchObject({ isActive: true, playerUrl: null });
    expect(del.mock.calls.map((call) => call.arguments[0])).toEqual([COPY_URL]);
  });

  it("keeps a players' copy that is current when the picture is turned on again", async () => {
    await db.insert(tables.attachmentAnnotations).values({
      idAttachment: map,
      width: 10,
      height: 10,
      isActive: false,
      revision: 3,
      playerRevision: 3,
      playerUrl: COPY_URL,
    });
    await actions.sa_setAnnotated(map, true);
    expect(await stored()).toMatchObject({ isActive: true, playerUrl: COPY_URL });
    expect(del.mock.callCount()).toBe(0);
  });

  // What the storyteller is shown of a picture: its players' copy while it
  // is annotated and one is rendered, else the picture itself.
  it("gives a picture's state as its controls follow it, the copy shown once there is one", async () => {
    expect(await actions.sa_getPictureState(map)).toEqual({
      idAttachment: map,
      shownUrl: MAP_URL,
      canAnnotate: true,
      hasDrawing: false,
      isAnnotated: false,
      behind: false,
    });
    await annotate();
    expect(await actions.sa_getPictureState(map)).toMatchObject({
      shownUrl: MAP_URL,
      isAnnotated: true,
      behind: true,
    });
    await db
      .update(tables.attachmentAnnotations)
      .set({ playerUrl: COPY_URL, playerRevision: 0 })
      .where(eq(tables.attachmentAnnotations.idAttachment, map));
    expect(await actions.sa_getPictureState(map)).toMatchObject({
      shownUrl: COPY_URL,
      behind: false,
    });
    expect(await actions.sa_getPictureState(theirPicture)).toBeNull();
  });
});
