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
// inserted below is collected in `created` and only those ids are deleted.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { and, eq, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { createRequire } from "node:module";

import { MAX_ATTACHMENTS } from "@/lib/attachments";

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
// Existing seeded story_scene rows. tr_biu_attachments_external_exists
// raises on a non-null external_id with no parent row, so claim tests need
// real ids rather than made-up ones.
const SCENE_ID = -21;
const OTHER_SCENE_ID = -20;
// A story seeded as OTHER_USER's own, for the ownership-of-the-parent tests.
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

/** Inserts a fixture row and records its id for the cleanup in `after`. */
async function insertAttachment(
  values: DbModule["schema"]["attachments"]["$inferInsert"],
): Promise<{ id: number }> {
  const [row] = await db
    .insert(tables.attachments)
    .values(values)
    .returning({ id: tables.attachments.idAttachment });
  created.push(row.id);
  return row;
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
      await db
        .delete(tables.attachments)
        .where(inArray(tables.attachments.idAttachment, created));
    }
    // Otherwise the process lingers until the pool's idle timeout.
    await db.$client.end();
  });

  it("inserts a typed link as READY with is_uploaded false", async () => {
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
      })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, result.idAttachment));
    expect(row).toEqual({ status: "READY", isUploaded: false, url: "https://example.com/a.jpg" });
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
      })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, result.idAttachment));
    expect(row).toEqual({ status: "UPLOADING", isUploaded: true, url: null });
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
    const created = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: null,
      status: "UPLOADING",
      idCreatedByUser: SEED_USER,
    });

    await actions.sa_markAttachmentReady(created.id, "https://example.com/ready.jpg");

    const [row] = await db
      .select({ status: tables.attachments.status, url: tables.attachments.url })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, created.id));
    expect(row).toEqual({ status: "READY", url: "https://example.com/ready.jpg" });
  });

  it("moves an upload to ERROR, and a retry moves it back to UPLOADING", async () => {
    const created = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: null,
      status: "UPLOADING",
      idCreatedByUser: SEED_USER,
    });

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
      kind: "STORY_SCENE",
      idExternal: null,
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

  it("deletes an owned upload and removes it from Blob", async () => {
    del.mock.resetCalls();
    const url = `https://abc123.public.blob.vercel-storage.com/uploads/${SEED_USER}/photo.png`;
    const created = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: null,
      status: "READY",
      url,
      isUploaded: true,
      idCreatedByUser: SEED_USER,
    });

    await actions.sa_deleteAttachment(created.id);

    expect(del.mock.calls).toHaveLength(1);
    expect(del.mock.calls[0].arguments).toEqual([url]);
    const rows = await db
      .select({ id: tables.attachments.idAttachment })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, created.id));
    expect(rows).toHaveLength(0);
  });

  it("deletes an owned typed link without calling Blob", async () => {
    del.mock.resetCalls();
    const created = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: null,
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
      kind: "STORY_SCENE",
      idExternal: null,
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
    const created = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: null,
      status: "UPLOADING",
      idCreatedByUser: SEED_USER,
    });
    const theirUrl =
      `https://abc123.public.blob.vercel-storage.com/uploads/${OTHER_USER}/theirs.png`;

    await expect(actions.sa_markAttachmentReady(created.id, theirUrl)).rejects.toThrow();

    const [after] = await db
      .select({ status: tables.attachments.status, url: tables.attachments.url })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, created.id));
    expect(after).toEqual({ status: "UPLOADING", url: null });
  });

  // Review Focus 5: several attachments must order deterministically.
  it("lists an object's attachments newest updated first, then by id", async () => {
    // a was touched most recently, though b is the later row and sorts first
    // by sort_order; updated_at is what decides.
    const a = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: SCENE_ID,
      status: "READY",
      url: "https://x/a.jpg",
      sortOrder: 2,
      updatedAt: new Date("2026-09-30T12:00:00Z"),
      idCreatedByUser: SEED_USER,
    });
    const b = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: SCENE_ID,
      status: "READY",
      url: "https://x/b.jpg",
      sortOrder: 1,
      updatedAt: new Date("2026-09-29T12:00:00Z"),
      idCreatedByUser: SEED_USER,
    });

    const rows = await actions.sa_listAttachments("STORY_SCENE", SCENE_ID);

    // Narrowed to this case's own two rows rather than asserting the whole
    // list, because this scene is shared: earlier cases here attach to it,
    // blob-sweep/route.test.ts uses it for its "claimed" fixture, and both
    // may be running concurrently. Filtering keeps their relative order, so
    // it still proves what it set out to -- the newer row first -- without
    // depending on nobody else touching the scene.
    const ours = rows.map((r) => r.idAttachment).filter((id) => id === a.id || id === b.id);
    expect(ours).toEqual([a.id, b.id]);
  });

  // Review Focus 1: a double-submitted form must attach once and not throw.
  it("claims the same ids twice without erroring, attaching once", async () => {
    const row = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: null,
      status: "UPLOADING",
      idCreatedByUser: SEED_USER,
    });

    await actions.sa_claimAttachments("STORY_SCENE", SCENE_ID, [row.id]);
    await actions.sa_claimAttachments("STORY_SCENE", OTHER_SCENE_ID, [row.id]);

    const [after] = await db
      .select({ idExternal: tables.attachments.idExternal })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, row.id));
    // The second claim matched nothing, because external_id was no longer null.
    expect(after.idExternal).toBe(SCENE_ID);
  });

  it("refuses to claim a row created by another user", async () => {
    const row = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: null,
      status: "UPLOADING",
      idCreatedByUser: OTHER_USER,
    });

    await actions.sa_claimAttachments("STORY_SCENE", SCENE_ID, [row.id]);

    const [after] = await db
      .select({ idExternal: tables.attachments.idExternal })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, row.id));
    expect(after.idExternal).toBeNull();
  });

  it("ignores a claim whose kind does not match the row's own kind", async () => {
    const row = await insertAttachment({
      kind: "STORY",
      idExternal: null,
      status: "UPLOADING",
      idCreatedByUser: SEED_USER,
    });

    // A story picture (kind STORY) must not be claimable as a scene's.
    await actions.sa_claimAttachments("STORY_SCENE", SCENE_ID, [row.id]);

    const [after] = await db
      .select({ idExternal: tables.attachments.idExternal })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, row.id));
    expect(after.idExternal).toBeNull();
  });

  it("returns nothing for an id outside int4 rather than erroring", async () => {
    const rows = await actions.sa_listAttachments("STORY", 3e9);
    expect(rows).toEqual([]);
  });

  // The exists-trigger only proves OTHER_STORY_ID is a real story; it says
  // nothing about whose story it is. The reads prove that themselves.
  it("returns nothing for an object on a story the caller does not own", async () => {
    const row = await insertAttachment({
      kind: "STORY",
      idExternal: OTHER_STORY_ID,
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
      .where(
        and(
          eq(tables.attachments.kind, "STORY"),
          eq(tables.attachments.idExternal, OTHER_STORY_ID),
        ),
      );
    // Nothing was inserted: the refusal happened before the write.
    expect(rows.filter((r) => r.id > 0)).toHaveLength(0);
  });

  describe("the story's own attachments, moved onto a scene", () => {
    // A story, a scene on it, and a scene on OTHER_USER's story, all the
    // test's own, so nothing seeded is ever moved.
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
      // The scene's and the story's attachments go with them: the parents'
      // delete triggers, and id_story's ON DELETE CASCADE besides.
      await db.delete(tables.storyScenes).where(eq(tables.storyScenes.idStoryScene, theirScene));
      await db.delete(tables.stories).where(eq(tables.stories.idStory, idStory));
    });

    const onStory = (url: string, values: { status?: string; tags?: string[] } = {}) =>
      insertAttachment({
        kind: "STORY",
        idExternal: idStory,
        status: "READY",
        url,
        idCreatedByUser: SEED_USER,
        ...values,
      });
    const rowOf = async (id: number) => {
      const [row] = await db
        .select({
          kind: tables.attachments.kind,
          idExternal: tables.attachments.idExternal,
          idStory: tables.attachments.idStory,
        })
        .from(tables.attachments)
        .where(eq(tables.attachments.idAttachment, id));
      return row;
    };

    it("fills id_story from whatever part of the story an attachment is on", async () => {
      const { id: onTheStory } = await onStory("https://example.com/picker-story.jpg");
      const { id: onTheScene } = await insertAttachment({
        kind: "STORY_SCENE",
        idExternal: idScene,
        status: "READY",
        url: "https://example.com/picker-scene.jpg",
        idCreatedByUser: SEED_USER,
      });
      expect((await rowOf(onTheStory)).idStory).toBe(idStory);
      expect((await rowOf(onTheScene)).idStory).toBe(idStory);

      // And through the action an upload goes through, as well as a raw insert.
      const { idAttachment } = await actions.sa_createAttachment({
        kind: "STORY_SCENE",
        idExternal: idScene,
        url: "https://example.com/picker-created.jpg",
      });
      created.push(idAttachment);
      expect((await rowOf(idAttachment)).idStory).toBe(idStory);
    });

    it("moves only the story's own finished attachments that are not its cover", async () => {
      const { id: plain } = await onStory("https://example.com/picker-plain.jpg");
      const { id: cover } = await onStory("https://example.com/picker-cover.jpg", {
        tags: ["cover"],
      });
      const { id: uploading } = await insertAttachment({
        kind: "STORY",
        idExternal: idStory,
        idCreatedByUser: SEED_USER,
        isUploaded: true,
      });

      const result = await actions.sa_moveStoryAttachmentsToScene(idScene, [
        plain,
        cover,
        uploading,
      ]);
      expect(result).toEqual({ ok: true, moved: [plain] });

      expect(await rowOf(plain)).toEqual({ kind: "STORY_SCENE", idExternal: idScene, idStory });
      expect(await rowOf(cover)).toEqual({ kind: "STORY", idExternal: idStory, idStory });
      expect(await rowOf(uploading)).toEqual({ kind: "STORY", idExternal: idStory, idStory });

      // It is no longer the story's to offer.
      const left = await actions.sa_listAttachments("STORY", idStory);
      expect(left.map((row) => row.idAttachment)).not.toContain(plain);
    });

    it("holds the scene to the most attachments one object may have", async () => {
      const already = await db
        .select({ count: tables.attachments.idAttachment })
        .from(tables.attachments)
        .where(
          and(
            eq(tables.attachments.kind, "STORY_SCENE"),
            eq(tables.attachments.idExternal, idScene),
          ),
        );
      // Fill the scene to one short of the limit.
      for (let n = already.length; n < MAX_ATTACHMENTS - 1; n += 1) {
        await insertAttachment({
          kind: "STORY_SCENE",
          idExternal: idScene,
          status: "READY",
          url: `https://example.com/picker-fill-${n}.jpg`,
          idCreatedByUser: SEED_USER,
        });
      }
      const { id: first } = await onStory("https://example.com/picker-first.jpg");
      const { id: second } = await onStory("https://example.com/picker-second.jpg");

      expect(await actions.sa_moveStoryAttachmentsToScene(idScene, [first, second])).toEqual({
        ok: false,
        error: "This scene has room for 1 more. Choose fewer.",
      });
      expect((await rowOf(first)).kind).toBe("STORY");
      expect(await actions.sa_moveStoryAttachmentsToScene(idScene, [first])).toEqual({
        ok: true,
        moved: [first],
      });
    });

    it("refuses a scene on a story the caller does not own", async () => {
      const { id } = await onStory("https://example.com/picker-refused.jpg");
      await expect(actions.sa_moveStoryAttachmentsToScene(theirScene, [id])).rejects.toThrow(
        "You do not have access to that story.",
      );
      expect((await rowOf(id)).kind).toBe("STORY");
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
      await db
        .delete(tables.attachments)
        .where(
          and(eq(tables.attachments.kind, "STORY"), eq(tables.attachments.idExternal, idStory)),
        );
      await db.delete(tables.stories).where(eq(tables.stories.idStory, idStory));
    });

    const link = (url: string, values: { status?: string; tags?: string[] } = {}) =>
      insertAttachment({
        kind: "STORY",
        idExternal: idStory,
        status: "READY",
        url,
        idCreatedByUser: SEED_USER,
        ...values,
      });
    const tagsOf = async (id: number) =>
      (
        await db
          .select({ tags: tables.attachments.tags })
          .from(tables.attachments)
          .where(eq(tables.attachments.idAttachment, id))
      )[0].tags;

    it("moves the cover from one attachment to another, keeping every other tag", async () => {
      const old = await link("https://x/old-cover.jpg", { tags: ["map", "cover"] });
      const next = await link("https://x/new-cover.jpg", { tags: ["handout"] });

      await actions.sa_setAttachmentCover(next.id, true);

      expect(await tagsOf(old.id)).toEqual(["map"]);
      expect(await tagsOf(next.id)).toEqual(["handout", "cover"]);
      const listed = await actions.sa_listAttachments("STORY", idStory);
      expect(listed.filter((row) => row.isCover).map((row) => row.idAttachment)).toEqual([next.id]);

      // Again is a no-op, not a second 'cover' in the array.
      await actions.sa_setAttachmentCover(next.id, true);
      expect(await tagsOf(next.id)).toEqual(["handout", "cover"]);

      // And off leaves the story with no cover at all.
      await actions.sa_setAttachmentCover(next.id, false);
      expect(await tagsOf(next.id)).toEqual(["handout"]);
    });

    it("refuses to make an unfinished upload the cover", async () => {
      const row = await link("https://x/failed.jpg", { status: "ERROR" });

      await expect(actions.sa_setAttachmentCover(row.id, true)).rejects.toThrow();
      expect(await tagsOf(row.id)).toEqual([]);
    });

    it("replaces an attachment's tags, lower-cased and once each, keeping its cover", async () => {
      const row = await link("https://x/tagged.jpg", { tags: ["old", "cover"] });

      await actions.sa_setAttachmentTags(row.id, ["Map", " handout ", "map"]);

      expect(await tagsOf(row.id)).toEqual(["map", "handout", "cover"]);
      const listed = (await actions.sa_listAttachments("STORY", idStory)).find(
        (r) => r.idAttachment === row.id,
      );
      // Cover travels as isCover, never among the plain tags.
      expect(listed).toMatchObject({ isCover: true, tags: ["map", "handout"] });

      await actions.sa_setAttachmentTags(row.id, []);
      expect(await tagsOf(row.id)).toEqual(["cover"]);
      // Off again, so the one-cover case below starts from none.
      await actions.sa_setAttachmentCover(row.id, false);
    });

    it("refuses cover as a plain tag", async () => {
      const row = await link("https://x/sneaky.jpg");

      await expect(actions.sa_setAttachmentTags(row.id, ["cover"])).rejects.toThrow();
      expect(await tagsOf(row.id)).toEqual([]);
    });

    it("finds attachments by a tag, the address or the file name, cover included", async () => {
      // Words no other case on this story uses, so each search has one answer.
      const map = await link("https://x/region.jpg", { tags: ["atlas", "parchment"] });
      const named = await insertAttachment({
        kind: "STORY",
        idExternal: idStory,
        status: "READY",
        url: "https://x/blob-key.png",
        fileName: "Dragon Lair.png",
        isUploaded: true,
        idCreatedByUser: SEED_USER,
      });
      // An address without the word, so only the tag can be what "cover" finds;
      // the earlier cases' addresses carry it, so they are expected as well.
      const cover = await link("https://x/frontispiece.jpg", { tags: ["cover"] });

      expect(await actions.sa_searchAttachments("STORY", idStory, "PARCHMENT")).toEqual([map.id]);
      expect(await actions.sa_searchAttachments("STORY", idStory, "region")).toEqual([map.id]);
      expect(await actions.sa_searchAttachments("STORY", idStory, "dragon lair")).toEqual([
        named.id,
      ]);
      expect(await actions.sa_searchAttachments("STORY", idStory, "cover")).toContain(cover.id);
      expect(await actions.sa_searchAttachments("STORY", idStory, "frontispiece")).toEqual([
        cover.id,
      ]);
      // An empty box matches everything on the object.
      const all = await actions.sa_searchAttachments("STORY", idStory, " ");
      for (const id of [map.id, named.id, cover.id]) expect(all).toContain(id);

      // The one-cover case below starts from none.
      await actions.sa_setAttachmentCover(cover.id, false);
    });

    it("lets the database hold only one cover per object", async () => {
      await link("https://x/one.jpg", { tags: ["cover"] }).catch(() => null);
      await expect(link("https://x/two.jpg", { tags: ["cover"] })).rejects.toThrow();
    });
  });

  it("finds nothing on a story the caller does not own", async () => {
    const row = await insertAttachment({
      kind: "STORY",
      idExternal: OTHER_STORY_ID,
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
      kind: "STORY",
      idExternal: OTHER_STORY_ID,
      status: "READY",
      url: "https://x/their-cover.jpg",
      idCreatedByUser: OTHER_USER,
    });

    try {
      await expect(actions.sa_setAttachmentCover(row.id, true)).rejects.toThrow(
        "Attachment not found",
      );
      await expect(actions.sa_setAttachmentTags(row.id, ["mine"])).rejects.toThrow(
        "Attachment not found",
      );
    } finally {
      // As in the listing case above: the next cases count this story's rows.
      await db.delete(tables.attachments).where(eq(tables.attachments.idAttachment, row.id));
    }
  });

  // Owning the uploaded rows is not the same as owning the destination: the
  // caller may only claim onto a parent that is their own.
  it("refuses to claim onto a story the caller does not own, leaving the rows detached", async () => {
    const row = await insertAttachment({
      kind: "STORY",
      idExternal: null,
      status: "UPLOADING",
      idCreatedByUser: SEED_USER,
    });

    await expect(actions.sa_claimAttachments("STORY", OTHER_STORY_ID, [row.id])).rejects.toThrow();

    const [after] = await db
      .select({ idExternal: tables.attachments.idExternal })
      .from(tables.attachments)
      .where(eq(tables.attachments.idAttachment, row.id));
    // Not merely that the call threw: the row must still be unclaimed. A
    // check placed after the UPDATE would also throw while having already
    // done the damage.
    expect(after.idExternal).toBeNull();
  });
});
