// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. Makes a story, an uploaded
// picture and its drawing for a test user of its own, and takes the story
// away again in `after` (the picture by its id, the drawing with it). Blob and the picture's fetch are stood in for: put()
// and del() really would reach Vercel Blob, and the cover's address is not a
// real blob.
import { after, afterEach, before, beforeEach, it, mock, type Mock } from "node:test";
import { expect } from "expect";
import { eq } from "drizzle-orm";
import { createRequire } from "node:module";
import sharp from "sharp";

import { describeWithDb, type Db, type Tables } from "@/test/db-suite";

// @vercel/blob is a dual CJS/ESM package; put() and del() are swapped on the
// require-cached module object, as components/uploads/actions.test.ts does.
const requireHere = createRequire(__filename);

const COVER_URL = "https://abc.public.blob.vercel-storage.com/uploads/u/map.png";

let copies = 0;
const put = mock.fn(async (_pathname: string, _body: Buffer, _options: unknown) => ({
  url: `https://abc.public.blob.vercel-storage.com/annotations/copy-${++copies}.webp`,
}));
const del = mock.fn(async (_url: string | string[]) => {});
const publishPictureChanged = mock.fn(async (_idStory: number, _idAttachment: number) => {});
let originalPut: unknown;
let originalDel: unknown;

let renderPlayersCopy: typeof import("./players-copy").renderPlayersCopy;
let db: Db;
let tables: Tables;
let storyId = 0;
let attachmentId = 0;
let picture: Buffer;
let fetched: Mock<typeof fetch>;

describeWithDb("renderPlayersCopy", { email: "lib-players-copy@example.test" }, (suite) => {
  before(async () => {
    mock.module("@/lib/realtime/publish-scene", { namedExports: { publishPictureChanged } });
    const blobModule: { put: unknown; del: unknown } = requireHere("@vercel/blob");
    originalPut = blobModule.put;
    originalDel = blobModule.del;
    blobModule.put = put;
    blobModule.del = del;
    ({ db, tables } = suite);
    ({ renderPlayersCopy } = await import("./players-copy"));

    picture = await sharp({
      create: { width: 40, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    [{ id: storyId }] = await db
      .insert(tables.stories)
      .values({ title: "Players' copy fixture story", idCreatedByUser: suite.testUser })
      .returning({ id: tables.stories.idStory });
    [{ id: attachmentId }] = await db
      .insert(tables.attachments)
      .values({
        idStory: storyId,
        status: "READY",
        url: COVER_URL,
        isUploaded: true,
        idCreatedByUser: suite.testUser,
      })
      .returning({ id: tables.attachments.idAttachment });
  });

  after(async () => {
    const blobModule: { put: unknown; del: unknown } = requireHere("@vercel/blob");
    blobModule.put = originalPut;
    blobModule.del = originalDel;
    if (!db) return;
    if (storyId) await db.delete(tables.stories).where(eq(tables.stories.idStory, storyId));
    if (attachmentId) {
      await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, attachmentId));
    }
  });

  // Each case starts from a drawing one save ahead of a players' copy it
  // has never had, and the picture fetchable.
  beforeEach(async () => {
    put.mock.resetCalls();
    put.mock.restore();
    del.mock.resetCalls();
    publishPictureChanged.mock.resetCalls();
    await db
      .delete(tables.attachmentAnnotations)
      .where(eq(tables.attachmentAnnotations.idAttachment, attachmentId));
    await db.insert(tables.attachmentAnnotations).values({
      idAttachment: attachmentId,
      width: 40,
      height: 20,
      ops: [{ t: "rect", mode: "reveal", x: 0, y: 0, w: 20, h: 20 }],
      revision: 1,
      idCreatedByUser: suite.testUser,
    });
    fetched = mock.method(globalThis, "fetch", async () => new Response(new Uint8Array(picture)));
  });

  // Only the fetch: the module mocks above are the suite's for its whole run.
  afterEach(() => fetched.mock.restore());

  async function drawing() {
    const [row] = await db
      .select()
      .from(tables.attachmentAnnotations)
      .where(eq(tables.attachmentAnnotations.idAttachment, attachmentId));
    return row;
  }

  it("renders the drawing, points the players at it, says so, and lets the claim go", async () => {
    await renderPlayersCopy(storyId, attachmentId);

    expect(put.mock.callCount()).toBe(1);
    const [pathname, body, options] = put.mock.calls[0].arguments;
    expect(pathname).toBe(`annotations/${attachmentId}/players-copy.webp`);
    expect((await sharp(body).metadata()).format).toBe("webp");
    expect(options).toMatchObject({ access: "public", addRandomSuffix: true });
    const row = await drawing();
    expect(row).toMatchObject({
      playerUrl: (await put.mock.calls[0].result)!.url,
      playerRevision: 1,
      renderToken: null,
      renderClaimedAt: null,
    });
    expect(publishPictureChanged.mock.calls.map((call) => call.arguments)).toEqual([
      [storyId, attachmentId],
    ]);
  });

  it("deletes the copy a newer one replaces", async () => {
    await renderPlayersCopy(storyId, attachmentId);
    const first = (await drawing()).playerUrl;
    await db
      .update(tables.attachmentAnnotations)
      .set({ revision: 2 })
      .where(eq(tables.attachmentAnnotations.idAttachment, attachmentId));

    await renderPlayersCopy(storyId, attachmentId);

    expect((await drawing()).playerRevision).toBe(2);
    expect(del.mock.calls.map((call) => call.arguments[0])).toEqual([first]);
  });

  it("renders nothing when the copy is current, or the picture is not annotated", async () => {
    await renderPlayersCopy(storyId, attachmentId);
    put.mock.resetCalls();
    await renderPlayersCopy(storyId, attachmentId);
    expect(put.mock.callCount()).toBe(0);

    await db
      .update(tables.attachmentAnnotations)
      .set({ revision: 2, isActive: false })
      .where(eq(tables.attachmentAnnotations.idAttachment, attachmentId));
    await renderPlayersCopy(storyId, attachmentId);
    expect(put.mock.callCount()).toBe(0);
  });

  it("leaves the render to the one already making it, unless that one has gone quiet", async () => {
    // Another render's token; any uuid will do, written in the seeds' form
    // so real-accounts.test.ts does not take it for someone's id.
    const other = "00000000-0000-7000-8000-0000000000aa";
    await db
      .update(tables.attachmentAnnotations)
      .set({ renderToken: other, renderClaimedAt: new Date() })
      .where(eq(tables.attachmentAnnotations.idAttachment, attachmentId));
    await renderPlayersCopy(storyId, attachmentId);
    expect(put.mock.callCount()).toBe(0);
    expect((await drawing()).renderToken).toBe(other);

    await db
      .update(tables.attachmentAnnotations)
      .set({ renderClaimedAt: new Date(Date.now() - 2 * 60 * 1000) })
      .where(eq(tables.attachmentAnnotations.idAttachment, attachmentId));
    await renderPlayersCopy(storyId, attachmentId);
    expect(put.mock.callCount()).toBe(1);
    expect((await drawing()).playerRevision).toBe(1);
  });

  it("renders again when the drawing moved on while it rendered", async () => {
    put.mock.mockImplementationOnce(async () => {
      await db
        .update(tables.attachmentAnnotations)
        .set({ revision: 2 })
        .where(eq(tables.attachmentAnnotations.idAttachment, attachmentId));
      return {
        url: `https://abc.public.blob.vercel-storage.com/annotations/copy-${++copies}.webp`,
      };
    });

    await renderPlayersCopy(storyId, attachmentId);

    expect(put.mock.callCount()).toBe(2);
    expect((await drawing()).playerRevision).toBe(2);
  });

  it("deletes its own copy when the drawing was deleted while it rendered", async () => {
    put.mock.mockImplementationOnce(async () => {
      await db
        .delete(tables.attachmentAnnotations)
        .where(eq(tables.attachmentAnnotations.idAttachment, attachmentId));
      return { url: "https://abc.public.blob.vercel-storage.com/annotations/orphan.webp" };
    });

    await renderPlayersCopy(storyId, attachmentId);

    expect(del.mock.calls.map((call) => call.arguments[0])).toEqual([
      "https://abc.public.blob.vercel-storage.com/annotations/orphan.webp",
    ]);
    expect(publishPictureChanged.mock.callCount()).toBe(0);
  });

  it("lets the claim go when the picture cannot be fetched, so a later render can try", async () => {
    fetched.mock.mockImplementation(async () => new Response("gone", { status: 404 }));

    await expect(renderPlayersCopy(storyId, attachmentId)).rejects.toThrow();

    const row = await drawing();
    expect(row.renderToken).toBeNull();
    expect(row.playerUrl).toBeNull();
  });
});
