// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. Writes rows for the seed user
// (and one other seeded user, to exercise the ownership checks) and removes
// them again in `after`; the negative-id seed rows are never touched.
//
// Cleanup is by id, never by owner. `node --test` runs the suite's files in
// parallel against this one database, and stories/actions.test.ts creates
// positive-id attachments for the same seed user, asserts across several
// awaits, and tidies up after itself. A "DELETE every positive-id row this
// user owns" here would land inside that window and take its fixtures with
// it -- an intermittent failure in a file this one never touches. Everything
// inserted below is collected in `created` and only those ids are deleted;
// the uses go with their attachments (the foreign key cascades).
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { and, eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { createRequire } from "node:module";

import { MAX_ATTACHMENTS, type AttachmentKind } from "@/lib/attachments";

loadEnvConfig(process.cwd());

// @vercel/blob is a dual CJS/ESM package. `mock.module` only intercepts the
// ESM entry a dynamic import() would resolve to, not the CJS entry
// actions.ts's own require resolves to, so del() is swapped out by
// monkey-patching the same require-cached module object instead.
const requireHere = createRequire(__filename);

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
// A different seeded user, owning none of the seeded attachments, so it is
// safe to use as "someone else" in the ownership tests.
const OTHER_USER = "00000000-0000-7000-8000-000000000002";
// An existing seeded story_scene row of the seed user's.
// tr_biu_attachment_uses_external_exists raises on a holder with no row, so
// uses need real ids rather than made-up ones.
const SCENE_ID = -21;
// A story seeded as OTHER_USER's own, for the ownership-of-the-holder tests.
const OTHER_STORY_ID = -16;

const hasDb = Boolean(process.env.DATABASE_URL);

const getSession = mock.fn(async () => ({ user: { id: SEED_USER } }));
// del() really would reach Vercel Blob, so it is mocked rather than left to
// run against a url that is not a real blob.
const del = mock.fn(async () => {});
let originalDel: unknown;

let actions: typeof import("./actions");

// `@/db` opens its pool at import time, so it has to be pulled in from
// inside `before` -- a static import is evaluated before loadEnvConfig()
// above runs, and the pool would be built without a connection string.
type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

// Every attachment id this file brought into being, both the ones it inserted
// directly and the ones sa_createAttachment made for it, so `after` can take
// away exactly these.
const created: number[] = [];

/** A holder's use of a fixture attachment, as insertAttachment adds it. */
type Use = { kind: AttachmentKind; idExternal: number; tags?: string[]; sortOrder?: number };

/**
 * Inserts a fixture row, with its uses, and records its id for the cleanup
 * in `after`. A use's story is the holder's, which the use trigger copies
 * onto an attachment inserted without one.
 */
async function insertAttachment(
  values: DbModule["schema"]["attachments"]["$inferInsert"],
  uses: Use[] = [],
): Promise<{ id: number }> {
  const [row] = await db
    .insert(tables.attachments)
    .values(values)
    .returning({ id: tables.attachments.idAttachment });
  created.push(row.id);
  for (const use of uses) {
    await db.insert(tables.attachmentUses).values({
      idAttachment: row.id,
      kind: use.kind,
      idExternal: use.idExternal,
      tags: use.tags ?? [],
      ...(use.sortOrder === undefined ? {} : { sortOrder: use.sortOrder }),
      idCreatedByUser: values.idCreatedByUser ?? SEED_USER,
    });
  }
  return row;
}

/** The uses an attachment has, kind and holder, with the cover flag. */
async function usesOf(id: number) {
  return db
    .select({
      kind: tables.attachmentUses.kind,
      idExternal: tables.attachmentUses.idExternal,
      idStory: tables.attachmentUses.idStory,
      tags: tables.attachmentUses.tags,
      sortOrder: tables.attachmentUses.sortOrder,
    })
    .from(tables.attachmentUses)
    .where(eq(tables.attachmentUses.idAttachment, id))
    .orderBy(tables.attachmentUses.idAttachmentUse);
}

describe("attachment actions", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    mock.module("@/lib/require-session", { namedExports: { getSession } });
    const blobModule: { del: unknown } = requireHere("@vercel/blob");
    originalDel = blobModule.del;
    blobModule.del = del;
    ({ db, schema: tables } = await import("@/db"));
    actions = await import("./actions");
  });

  after(async () => {
    const blobModule: { del: unknown } = requireHere("@vercel/blob");
    blobModule.del = originalDel;
    if (!db) return;
    if (created.length > 0) {
      await db.delete(tables.attachments).where(inArray(tables.attachments.idAttachment, created));
    }
    // Otherwise the process lingers until the pool's idle timeout.
    await db.$client.end();
  });

  it("inserts a typed link as READY with is_uploaded false, used by its holder", async () => {
    const result = await actions.sa_createAttachment({
      kind: "STORY_SCENE",
      idExternal: SCENE_ID,
      url: "https://example.com/a.jpg",
    });
    created.push(result.idAttachment);
    expect(result.status).toBe("READY");

    const [row] = await db
      .select({
        status: tables.attachments.status,
        isUploaded: tables.attachments.isUploaded,
        url: tables.attachments.url,
        idStory: tables.attachments.idStory,
      })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, result.idAttachment));
    expect(row).toMatchObject({
      status: "READY",
      isUploaded: false,
      url: "https://example.com/a.jpg",
    });
    // The scene's story owns it, and the scene uses it, in no particular
    // place: the trigger gave the use 1000 plus its id.
    const uses = await usesOf(result.idAttachment);
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({ kind: "STORY_SCENE", idExternal: SCENE_ID, tags: [] });
    expect(uses[0].idStory).toBe(row.idStory);
    expect(uses[0].sortOrder).toBeGreaterThan(1000);
  });

  it("inserts a pending upload as UPLOADING with is_uploaded true and no url", async () => {
    const result = await actions.sa_createAttachment({
      kind: "STORY_SCENE",
      idExternal: null,
      fileName: "photo.png",
    });
    created.push(result.idAttachment);
    expect(result.status).toBe("UPLOADING");

    const [row] = await db
      .select({
        status: tables.attachments.status,
        isUploaded: tables.attachments.isUploaded,
        url: tables.attachments.url,
        idStory: tables.attachments.idStory,
      })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, result.idAttachment));
    // No holder named, so no story and no use yet.
    expect(row).toEqual({ status: "UPLOADING", isUploaded: true, url: null, idStory: null });
    expect(await usesOf(result.idAttachment)).toEqual([]);
  });

  it("stamps id_created_by_user from the session, never the client", async () => {
    const result = await actions.sa_createAttachment({ kind: "STORY_SCENE", idExternal: null });
    created.push(result.idAttachment);

    const [row] = await db
      .select({ idCreatedByUser: tables.attachments.idCreatedByUser })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, result.idAttachment));
    expect(row.idCreatedByUser).toBe(SEED_USER);
  });

  it("moves an upload from UPLOADING to READY and sets the url", async () => {
    const created = await insertAttachment({ status: "UPLOADING", idCreatedByUser: SEED_USER });

    await actions.sa_markAttachmentReady(created.id, "https://example.com/ready.jpg");

    const [row] = await db
      .select({ status: tables.attachments.status, url: tables.attachments.url })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, created.id));
    expect(row).toEqual({ status: "READY", url: "https://example.com/ready.jpg" });
  });

  it("moves an upload to ERROR, and a retry moves it back to UPLOADING", async () => {
    const created = await insertAttachment({ status: "UPLOADING", idCreatedByUser: SEED_USER });

    await actions.sa_markAttachmentError(created.id);
    const [afterError] = await db
      .select({ status: tables.attachments.status })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, created.id));
    expect(afterError.status).toBe("ERROR");

    await actions.sa_retryAttachment(created.id);
    const [afterRetry] = await db
      .select({ status: tables.attachments.status })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, created.id));
    expect(afterRetry.status).toBe("UPLOADING");
  });

  it("refuses to delete a row created by another user", async () => {
    const created = await insertAttachment({
      status: "READY",
      url: "https://example.com/theirs.jpg",
      idCreatedByUser: OTHER_USER,
    });

    await expect(actions.sa_deleteAttachment(created.id)).rejects.toThrow();

    const rows = await db
      .select({ id: tables.attachments.idAttachment })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, created.id));
    expect(rows).toHaveLength(1);
  });

  it("deletes an owned upload, its uses with it, and removes it from Blob", async () => {
    del.mock.resetCalls();
    const url = `https://abc123.public.blob.vercel-storage.com/uploads/${SEED_USER}/photo.png`;
    const created = await insertAttachment(
      { status: "READY", url, isUploaded: true, idCreatedByUser: SEED_USER },
      [{ kind: "STORY_SCENE", idExternal: SCENE_ID }],
    );

    await actions.sa_deleteAttachment(created.id);

    expect(del.mock.calls).toHaveLength(1);
    expect(del.mock.calls[0].arguments).toEqual([url]);
    const rows = await db
      .select({ id: tables.attachments.idAttachment })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, created.id));
    expect(rows).toHaveLength(0);
    expect(await usesOf(created.id)).toEqual([]);
  });

  it("deletes an owned typed link without calling Blob", async () => {
    del.mock.resetCalls();
    const created = await insertAttachment({
      status: "READY",
      url: "https://example.com/a.jpg",
      isUploaded: false,
      idCreatedByUser: SEED_USER,
    });

    await actions.sa_deleteAttachment(created.id);

    expect(del.mock.calls).toHaveLength(0);
    const rows = await db
      .select({ id: tables.attachments.idAttachment })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, created.id));
    expect(rows).toHaveLength(0);
  });

  // isUploadedBlobUrl alone only proves the host is Blob's; a row that is
  // genuinely the caller's own can still point at someone else's key if
  // sa_markAttachmentReady's own guard were ever bypassed (a row inserted
  // directly, as this fixture does, or a future caller of this action).
  // isOwnUploadedBlobUrl is what must gate the delete.
  it("does not call Blob when the row's url is another user's key", async () => {
    del.mock.resetCalls();
    const url = `https://abc123.public.blob.vercel-storage.com/uploads/${OTHER_USER}/theirs.png`;
    const created = await insertAttachment({
      status: "READY",
      url,
      isUploaded: true,
      idCreatedByUser: SEED_USER,
    });

    await actions.sa_deleteAttachment(created.id);

    expect(del.mock.calls).toHaveLength(0);
    const rows = await db
      .select({ id: tables.attachments.idAttachment })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, created.id));
    // The row itself is still the caller's to remove; only the Blob call is
    // withheld, since the key was never the caller's to delete.
    expect(rows).toHaveLength(0);
  });

  it("refuses to mark ready with another user's blob url", async () => {
    const created = await insertAttachment({ status: "UPLOADING", idCreatedByUser: SEED_USER });
    const theirUrl = `https://abc123.public.blob.vercel-storage.com/uploads/${OTHER_USER}/theirs.png`;

    await expect(actions.sa_markAttachmentReady(created.id, theirUrl)).rejects.toThrow();

    const [after] = await db
      .select({ status: tables.attachments.status, url: tables.attachments.url })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, created.id));
    expect(after).toEqual({ status: "UPLOADING", url: null });
  });

  it("lists a holder's pictures in its order, then newest updated first", async () => {
    // a was touched most recently, though b comes first by sort_order; c has
    // no sort_order of its own and so goes last, and d ties b by sort_order
    // and loses on updated_at.
    const a = await insertAttachment({ status: "READY", url: "https://x/a.jpg" }, [
      { kind: "STORY_SCENE", idExternal: SCENE_ID, sortOrder: 2 },
    ]);
    const b = await insertAttachment({ status: "READY", url: "https://x/b.jpg" }, [
      { kind: "STORY_SCENE", idExternal: SCENE_ID, sortOrder: 1 },
    ]);
    const c = await insertAttachment({ status: "READY", url: "https://x/c.jpg" }, [
      { kind: "STORY_SCENE", idExternal: SCENE_ID },
    ]);
    const d = await insertAttachment({ status: "READY", url: "https://x/d.jpg" }, [
      { kind: "STORY_SCENE", idExternal: SCENE_ID, sortOrder: 1 },
    ]);
    await db
      .update(tables.attachmentUses)
      .set({ updatedAt: new Date("2026-09-29T12:00:00Z") })
      .where(eq(tables.attachmentUses.idAttachment, d.id));

    const rows = await actions.sa_listAttachments("STORY_SCENE", SCENE_ID);

    // Narrowed to this case's own rows rather than asserting the whole list,
    // because this scene is shared: earlier cases here attach to it,
    // blob-sweep/route.test.ts uses it for its "claimed" fixture, and both
    // may be running concurrently. Filtering keeps their relative order.
    const mine = new Set([a.id, b.id, c.id, d.id]);
    const ours = rows.map((r) => r.idAttachment).filter((id) => mine.has(id));
    expect(ours).toEqual([b.id, d.id, a.id, c.id]);
    expect(rows.find((r) => r.idAttachment === c.id)).toMatchObject({
      kind: "STORY_SCENE",
      idExternal: SCENE_ID,
      isCover: false,
      tags: [],
    });
  });

  it("claims an unclaimed upload for the story of its first use, and no other", async () => {
    const row = await insertAttachment({ status: "UPLOADING", idCreatedByUser: SEED_USER });
    const [before] = await db
      .select({ idStory: tables.attachments.idStory })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, row.id));
    expect(before.idStory).toBeNull();

    await db.insert(tables.attachmentUses).values({
      idAttachment: row.id,
      kind: "STORY_SCENE",
      idExternal: SCENE_ID,
      idCreatedByUser: SEED_USER,
    });

    const [after] = await db
      .select({ idStory: tables.attachments.idStory })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, row.id));
    expect(after.idStory).not.toBeNull();
    expect((await usesOf(row.id))[0].idStory).toBe(after.idStory);

    // Another story's holder may not use it now. Drizzle wraps the database's
    // refusal, so the trigger's message is on the cause.
    await expect(
      db.insert(tables.attachmentUses).values({
        idAttachment: row.id,
        kind: "STORY",
        idExternal: OTHER_STORY_ID,
        idCreatedByUser: SEED_USER,
      }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/belongs to story/) }),
    });
  });

  it("returns nothing for an id outside int4 rather than erroring", async () => {
    const rows = await actions.sa_listAttachments("STORY", 3e9);
    expect(rows).toEqual([]);
  });

  // The exists-trigger only proves OTHER_STORY_ID is a real story; it says
  // nothing about whose story it is. The reads prove that themselves.
  it("returns nothing for a holder on a story the caller does not own", async () => {
    const row = await insertAttachment({
      idStory: OTHER_STORY_ID,
      status: "READY",
      url: "https://x/theirs.jpg",
      idCreatedByUser: OTHER_USER,
    });

    try {
      const rows = await actions.sa_listAttachments("STORY", OTHER_STORY_ID);
      expect(rows).toEqual([]);
    } finally {
      // Taken away here rather than in `after`, because the next case counts
      // the positive-id rows on this same story and expects none. In a
      // `finally` so a failed assertion above does not leave one behind and
      // turn one red case into two.
      await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, row.id));
    }
  });

  it("refuses to create an attachment on a story the caller does not own", async () => {
    await expect(
      actions.sa_createAttachment({
        kind: "STORY",
        idExternal: OTHER_STORY_ID,
        url: "https://x/mine.jpg",
      }),
    ).rejects.toThrow();

    const rows = await db
      .select({ id: tables.attachments.idAttachment })
      .from(tables.attachments)
      .where(eq(tables.attachments.idStory, OTHER_STORY_ID));
    // Nothing was inserted: the refusal happened before the write.
    expect(rows.filter((r) => r.id > 0)).toHaveLength(0);
  });

  describe("the story's pictures, attached to a scene", () => {
    // A story, a scene on it, and a scene on OTHER_USER's story, all the
    // test's own, so nothing seeded is ever touched.
    const title = "Fixture — attachment picker";
    let idStory = 0;
    let idScene = 0;
    let theirScene = 0;

    before(async () => {
      await db.delete(tables.stories).where(eq(tables.stories.title, title));
      [{ idStory }] = await db
        .insert(tables.stories)
        .values({ title, idCreatedByUser: SEED_USER, idUpdatedByUser: SEED_USER })
        .returning({ idStory: tables.stories.idStory });
      [{ id: idScene }] = await db
        .insert(tables.storyScenes)
        .values({ idStory, sceneTitle: "Fixture picker scene", idCreatedByUser: SEED_USER })
        .returning({ id: tables.storyScenes.idStoryScene });
      [{ id: theirScene }] = await db
        .insert(tables.storyScenes)
        .values({
          idStory: OTHER_STORY_ID,
          sceneTitle: "Fixture picker scene of theirs",
          idCreatedByUser: OTHER_USER,
        })
        .returning({ id: tables.storyScenes.idStoryScene });
    });

    after(async () => {
      // The story's attachments go with it (id_story's ON DELETE CASCADE),
      // and their uses with them.
      await db.delete(tables.storyScenes).where(eq(tables.storyScenes.idStoryScene, theirScene));
      await db.delete(tables.stories).where(eq(tables.stories.idStory, idStory));
    });

    const onStory = (url: string, values: { status?: string; tags?: string[] } = {}) =>
      insertAttachment({ idStory, status: "READY", url, idCreatedByUser: SEED_USER, ...values });
    const sceneUse = async (id: number) =>
      (await usesOf(id)).find((use) => use.kind === "STORY_SCENE" && use.idExternal === idScene);

    it("gives the story the file, and the holder a use, as an upload goes through", async () => {
      const { idAttachment: fromScene } = await actions.sa_createAttachment({
        kind: "STORY_SCENE",
        idExternal: idScene,
        url: "https://example.com/picker-created.jpg",
      });
      created.push(fromScene);
      const { idAttachment: fromStory } = await actions.sa_createAttachment({
        kind: "STORY",
        idExternal: idStory,
        url: "https://example.com/picker-story-created.jpg",
      });
      created.push(fromStory);

      const storyOf = async (id: number) =>
        (
          await db
            .select({ idStory: tables.attachments.idStory })
            .from(tables.attachments)
            .where(eq(tables.attachments.idAttachment, id))
        )[0].idStory;
      expect(await storyOf(fromScene)).toBe(idStory);
      expect(await storyOf(fromStory)).toBe(idStory);
      expect(await usesOf(fromScene)).toEqual([
        expect.objectContaining({ kind: "STORY_SCENE", idExternal: idScene, idStory, tags: [] }),
      ]);
      // The story's own list is its pool: no use says the story shows it.
      expect(await usesOf(fromStory)).toEqual([]);
      const pool = (await actions.sa_listAttachments("STORY", idStory)).map(
        (row) => row.idAttachment,
      );
      expect(pool).toEqual(expect.arrayContaining([fromScene, fromStory]));
    });

    it("attaches the story's finished pictures, its cover included, and keeps them the story's", async () => {
      const { id: plain } = await onStory("https://example.com/picker-plain.jpg");
      const { id: cover } = await onStory("https://example.com/picker-cover.jpg");
      await actions.sa_setAttachmentCover("STORY", idStory, cover, true);
      const { id: uploading } = await insertAttachment({
        idStory,
        idCreatedByUser: SEED_USER,
        isUploaded: true,
      });

      const result = await actions.sa_attachToScene(idScene, [plain, cover, uploading]);
      expect(result.ok && [...result.attached].sort()).toEqual([plain, cover].sort());

      expect(await sceneUse(plain)).toMatchObject({ tags: [] });
      expect(await sceneUse(cover)).toMatchObject({ tags: [] });
      expect(await sceneUse(uploading)).toBeUndefined();
      // Still the story's cover, and still in the story's list.
      const pool = await actions.sa_listAttachments("STORY", idStory);
      expect(pool.find((row) => row.idAttachment === plain)).toBeDefined();
      expect(pool.find((row) => row.idAttachment === cover)?.isCover).toBe(true);

      // Again changes nothing and attaches nothing.
      expect(await actions.sa_attachToScene(idScene, [plain])).toEqual({ ok: true, attached: [] });
    });

    it("attaches one story picture to the scene as the scene's only cover", async () => {
      const { id: earlier } = await insertAttachment(
        {
          idStory,
          status: "READY",
          url: "https://example.com/picker-old-scene-cover.jpg",
          idCreatedByUser: SEED_USER,
        },
        [{ kind: "STORY_SCENE", idExternal: idScene, tags: ["cover"] }],
      );
      const { id: plain } = await onStory("https://example.com/picker-new-scene-cover.jpg");

      expect(await actions.sa_attachToSceneAsCover(idScene, plain)).toEqual({
        ok: true,
        url: "https://example.com/picker-new-scene-cover.jpg",
      });
      const covers = await actions.sa_listAttachments("STORY_SCENE", idScene);
      expect(covers.filter((row) => row.isCover).map((row) => row.idAttachment)).toEqual([plain]);
      expect(covers.find((row) => row.idAttachment === earlier)?.isCover).toBe(false);
      // The use the scene had already is the one tagged, not a second.
      expect(await actions.sa_attachToSceneAsCover(idScene, earlier)).toMatchObject({ ok: true });
      expect((await usesOf(earlier)).filter((use) => use.kind === "STORY_SCENE")).toHaveLength(1);
    });

    it("leaves an unfinished row and another's scene alone", async () => {
      const { id: uploading } = await insertAttachment({
        idStory,
        idCreatedByUser: SEED_USER,
        isUploaded: true,
      });
      const { id: plain } = await onStory("https://example.com/picker-refused-cover.jpg");

      expect(await actions.sa_attachToSceneAsCover(idScene, uploading)).toEqual({
        ok: false,
        error: "That attachment can no longer be used by the scene.",
      });
      expect(await sceneUse(uploading)).toBeUndefined();
      await expect(actions.sa_attachToSceneAsCover(theirScene, plain)).rejects.toThrow(
        "You do not have access to that story.",
      );
    });

    it("detaches a picture from the scene, its cover with it, leaving the story's own tags", async () => {
      const { id: cover } = await insertAttachment(
        {
          idStory,
          status: "READY",
          url: "https://example.com/picker-back-cover.jpg",
          tags: ["harbour"],
          idCreatedByUser: SEED_USER,
        },
        [{ kind: "STORY_SCENE", idExternal: idScene }],
      );
      // Whatever an earlier test left as the scene's cover gives way first.
      await actions.sa_attachToSceneAsCover(idScene, cover);
      const { id: elsewhere } = await onStory("https://example.com/picker-not-in-scene.jpg");

      expect(await actions.sa_detachFromScene(idScene, [cover, elsewhere])).toEqual({
        ok: true,
        detached: [cover],
      });
      expect(await sceneUse(cover)).toBeUndefined();
      expect(
        (await actions.sa_listAttachments("STORY_SCENE", idScene)).some((r) => r.isCover),
      ).toBe(false);
      const back = (await actions.sa_listAttachments("STORY", idStory)).find(
        (row) => row.idAttachment === cover,
      );
      expect(back).toMatchObject({ isCover: false, tags: ["harbour"] });
      await expect(actions.sa_detachFromScene(theirScene, [cover])).rejects.toThrow(
        "You do not have access to that story.",
      );
    });

    it("holds the scene to the most attachments one holder may have", async () => {
      const already = await db
        .select({ id: tables.attachmentUses.idAttachmentUse })
        .from(tables.attachmentUses)
        .where(
          and(
            eq(tables.attachmentUses.kind, "STORY_SCENE"),
            eq(tables.attachmentUses.idExternal, idScene),
          ),
        );
      // Fill the scene to one short of the limit.
      for (let n = already.length; n < MAX_ATTACHMENTS - 1; n += 1) {
        await insertAttachment(
          {
            idStory,
            status: "READY",
            url: `https://example.com/picker-fill-${n}.jpg`,
            idCreatedByUser: SEED_USER,
          },
          [{ kind: "STORY_SCENE", idExternal: idScene }],
        );
      }
      const { id: first } = await onStory("https://example.com/picker-first.jpg");
      const { id: second } = await onStory("https://example.com/picker-second.jpg");

      expect(await actions.sa_attachToScene(idScene, [first, second])).toEqual({
        ok: false,
        error: "This scene has room for 1 more. Choose fewer.",
      });
      expect(await sceneUse(first)).toBeUndefined();
      expect(await actions.sa_attachToScene(idScene, [first])).toEqual({
        ok: true,
        attached: [first],
      });
      expect(await actions.sa_attachToSceneAsCover(idScene, second)).toEqual({
        ok: false,
        error: `This scene already has ${MAX_ATTACHMENTS} attachments. Remove one first.`,
      });
    });

    it("refuses a scene on a story the caller does not own", async () => {
      const { id } = await onStory("https://example.com/picker-refused.jpg");
      await expect(actions.sa_attachToScene(theirScene, [id])).rejects.toThrow(
        "You do not have access to that story.",
      );
      expect(await usesOf(id)).toEqual([]);
    });
  });

  describe("covers", () => {
    // A story of the test's own, so moving a cover never takes the tag off a
    // seeded row that other files' fixtures (and the seed's own pictures)
    // rely on.
    let idStory: number;
    const title = "Fixture — attachment covers";

    before(async () => {
      await db.delete(tables.stories).where(eq(tables.stories.title, title));
      [{ idStory }] = await db
        .insert(tables.stories)
        .values({ title, idCreatedByUser: SEED_USER, idUpdatedByUser: SEED_USER })
        .returning({ idStory: tables.stories.idStory });
    });

    after(async () => {
      await db.delete(tables.attachments).where(eq(tables.attachments.idStory, idStory));
      await db.delete(tables.stories).where(eq(tables.stories.idStory, idStory));
    });

    const link = (
      url: string,
      values: { status?: string; tags?: string[]; cover?: boolean } = {},
    ) => {
      const { cover, ...rest } = values;
      return insertAttachment(
        { idStory, status: "READY", url, idCreatedByUser: SEED_USER, ...rest },
        cover ? [{ kind: "STORY", idExternal: idStory, tags: ["cover"] }] : [],
      );
    };
    const tagsOf = async (id: number) =>
      (
        await db
          .select({ tags: tables.attachments.tags })
          .from(tables.attachments)
          .where(eq(tables.attachments.idAttachment, id))
      )[0].tags;
    const storyUses = async (id: number) =>
      (await usesOf(id)).filter((use) => use.kind === "STORY");

    it("moves the cover from one attachment to another, keeping every other tag", async () => {
      const old = await link("https://x/old-cover.jpg", { tags: ["map"], cover: true });
      const next = await link("https://x/new-cover.jpg", { tags: ["handout"] });

      await actions.sa_setAttachmentCover("STORY", idStory, next.id, true);

      // The file's tags are untouched; the story's use moved.
      expect(await tagsOf(old.id)).toEqual(["map"]);
      expect(await tagsOf(next.id)).toEqual(["handout"]);
      expect(await storyUses(old.id)).toEqual([]);
      expect(await storyUses(next.id)).toEqual([expect.objectContaining({ tags: ["cover"] })]);
      const listed = await actions.sa_listAttachments("STORY", idStory);
      expect(listed.filter((row) => row.isCover).map((row) => row.idAttachment)).toEqual([next.id]);
      // The cover leads the pool.
      expect(listed[0].idAttachment).toBe(next.id);

      // Again is a no-op, not a second 'cover' in the array.
      await actions.sa_setAttachmentCover("STORY", idStory, next.id, true);
      expect(await storyUses(next.id)).toEqual([expect.objectContaining({ tags: ["cover"] })]);

      // And off leaves the story with no cover, and no use, at all.
      await actions.sa_setAttachmentCover("STORY", idStory, next.id, false);
      expect(await storyUses(next.id)).toEqual([]);
      expect((await actions.sa_listAttachments("STORY", idStory)).some((r) => r.isCover)).toBe(
        false,
      );
    });

    it("refuses to make an unfinished upload the cover", async () => {
      const row = await link("https://x/failed.jpg", { status: "ERROR" });

      await expect(actions.sa_setAttachmentCover("STORY", idStory, row.id, true)).rejects.toThrow();
      expect(await storyUses(row.id)).toEqual([]);
    });

    it("replaces an attachment's tags, lower-cased and once each, keeping its cover", async () => {
      const row = await link("https://x/tagged.jpg", { tags: ["old"], cover: true });

      await actions.sa_setAttachmentTags(row.id, ["Map", " handout ", "map"]);

      expect(await tagsOf(row.id)).toEqual(["map", "handout"]);
      const listed = (await actions.sa_listAttachments("STORY", idStory)).find(
        (r) => r.idAttachment === row.id,
      );
      // Cover travels as isCover, never among the plain tags.
      expect(listed).toMatchObject({ isCover: true, tags: ["map", "handout"] });

      await actions.sa_setAttachmentTags(row.id, []);
      expect(await tagsOf(row.id)).toEqual([]);
      expect(await storyUses(row.id)).toEqual([expect.objectContaining({ tags: ["cover"] })]);
      // Off again, so the one-cover case below starts from none.
      await actions.sa_setAttachmentCover("STORY", idStory, row.id, false);
    });

    it("refuses cover as a plain tag", async () => {
      const row = await link("https://x/sneaky.jpg");

      await expect(actions.sa_setAttachmentTags(row.id, ["cover"])).rejects.toThrow();
      expect(await tagsOf(row.id)).toEqual([]);
    });

    it("finds attachments by a tag, the address or the file name", async () => {
      // Words no other case on this story uses, so each search has one answer.
      const map = await link("https://x/region.jpg", { tags: ["atlas", "parchment"] });
      const named = await insertAttachment({
        idStory,
        status: "READY",
        url: "https://x/blob-key.png",
        fileName: "Dragon Lair.png",
        isUploaded: true,
        idCreatedByUser: SEED_USER,
      });

      expect(await actions.sa_searchAttachments("STORY", idStory, "PARCHMENT")).toEqual([map.id]);
      expect(await actions.sa_searchAttachments("STORY", idStory, "region")).toEqual([map.id]);
      expect(await actions.sa_searchAttachments("STORY", idStory, "dragon lair")).toEqual([
        named.id,
      ]);
      // An empty box matches everything in the pool.
      const all = await actions.sa_searchAttachments("STORY", idStory, " ");
      for (const id of [map.id, named.id]) expect(all).toContain(id);
    });

    it("lets the database hold only one cover per holder", async () => {
      await link("https://x/one.jpg", { cover: true });
      await expect(link("https://x/two.jpg", { cover: true })).rejects.toThrow();
    });
  });

  it("finds nothing on a story the caller does not own", async () => {
    const row = await insertAttachment({
      idStory: OTHER_STORY_ID,
      status: "READY",
      url: "https://x/their-secret-map.jpg",
      idCreatedByUser: OTHER_USER,
    });

    try {
      expect(await actions.sa_searchAttachments("STORY", OTHER_STORY_ID, "secret")).toEqual([]);
    } finally {
      // The next cases count this story's rows.
      await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, row.id));
    }
  });

  it("refuses to change the cover or tags on a story the caller does not own", async () => {
    const row = await insertAttachment({
      idStory: OTHER_STORY_ID,
      status: "READY",
      url: "https://x/their-cover.jpg",
      idCreatedByUser: OTHER_USER,
    });

    try {
      await expect(
        actions.sa_setAttachmentCover("STORY", OTHER_STORY_ID, row.id, true),
      ).rejects.toThrow("Attachment not found");
      await expect(actions.sa_setAttachmentTags(row.id, ["mine"])).rejects.toThrow(
        "Attachment not found",
      );
    } finally {
      // As in the listing case above: the next cases count this story's rows.
      await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, row.id));
    }
  });
});
