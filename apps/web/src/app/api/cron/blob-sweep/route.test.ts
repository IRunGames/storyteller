// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. Creates its own fixtures with
// positive ids and cleans them up in both before and after; the seeded
// negative-id attachments are only ever read (their url can land in the
// referenced set), never written to.
import { after, before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { and, eq, gt, inArray } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { createRequire } from "node:module";

import { GRACE_MS } from "@/lib/blob-sweep";

loadEnvConfig(process.cwd());

// @vercel/blob is a dual CJS/ESM package. `mock.module` only intercepts the
// ESM entry a dynamic import() would resolve to, not the CJS entry route.ts's
// own require resolves to, so list()/del() are swapped out by monkey-patching
// the same require-cached module object instead. See
// components/uploads/actions.test.ts for the same trap.
const requireHere = createRequire(__filename);

const SEED_USER = "01a0b60c-8938-7a0d-ab2b-34e12ce284c9";
// An existing seeded story_scene row. tr_biu_attachments_external_exists
// raises on a non-null external_id with no parent row, so the "claimed"
// fixture needs a real id rather than a made-up one.
const SCENE_ID = -21;

const hasDb = Boolean(process.env.DATABASE_URL);

type ListedBlob = { url: string; uploadedAt: Date };
const list = mock.fn<(options?: unknown) => Promise<{ blobs: ListedBlob[]; cursor?: string }>>(
  async () => ({ blobs: [], cursor: undefined }),
);
const del = mock.fn<(urls: string | string[]) => Promise<void>>(async () => {});
let originalList: unknown;
let originalDel: unknown;

let GET: typeof import("./route").GET;

type DbModule = typeof import("@/db");
let db: DbModule["db"];
let tables: DbModule["schema"];

function request(authorization?: string): Request {
  return new Request("http://localhost/api/cron/blob-sweep", {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET /api/cron/blob-sweep", { skip: !hasDb && "DATABASE_URL is not set" }, () => {
  before(async () => {
    process.env.CRON_SECRET = "s3cret";
    const blobModule: { list: unknown; del: unknown } = requireHere("@vercel/blob");
    originalList = blobModule.list;
    originalDel = blobModule.del;
    blobModule.list = list;
    blobModule.del = del;

    ({ db, schema: tables } = await import("@/db"));
    ({ GET } = await import("./route"));

    // A run that died before `after` leaves rows behind, and this run would
    // otherwise see them too. Every seeded row has a negative id, so
    // filtering to positive ones can never touch them.
    await db
      .delete(tables.attachments)
      .where(
        and(eq(tables.attachments.idCreatedByUser, SEED_USER), gt(tables.attachments.idAttachment, 0)),
      );
  });

  after(async () => {
    const blobModule: { list: unknown; del: unknown } = requireHere("@vercel/blob");
    blobModule.list = originalList;
    blobModule.del = originalDel;
    if (!db) return;
    await db
      .delete(tables.attachments)
      .where(
        and(eq(tables.attachments.idCreatedByUser, SEED_USER), gt(tables.attachments.idAttachment, 0)),
      );
    // Otherwise the process lingers until the pool's idle timeout.
    await db.$client.end();
  });

  it("refuses a request with no bearer token and lists or deletes nothing", async () => {
    list.mock.resetCalls();
    del.mock.resetCalls();

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(list.mock.callCount()).toBe(0);
    expect(del.mock.callCount()).toBe(0);
  });

  it("refuses a request with the wrong bearer token and lists or deletes nothing", async () => {
    list.mock.resetCalls();
    del.mock.resetCalls();

    const response = await GET(request("Bearer wrong"));

    expect(response.status).toBe(401);
    expect(list.mock.callCount()).toBe(0);
    expect(del.mock.callCount()).toBe(0);
  });

  // Review Focus 4, exercised end to end: an unreferenced but recent blob and
  // a recently uploaded but still-unclaimed attachment both survive one
  // sweep, because both are inside forms nobody has abandoned yet.
  it("sweeps unreferenced blobs and unclaimed attachments past the grace period, keeping the rest", async () => {
    list.mock.resetCalls();
    del.mock.resetCalls();

    const store = "https://abc123.public.blob.vercel-storage.com";
    const referencedUrl = `${store}/uploads/u1/kept.jpg`;
    const orphanUrl = `${store}/uploads/u1/orphan.jpg`;
    const freshOrphanUrl = `${store}/uploads/u1/fresh.jpg`;
    const oldUnclaimedUrl = `${store}/uploads/u1/unclaimed.jpg`;
    const old = new Date(Date.now() - GRACE_MS - 60 * 60 * 1000);

    // Claimed and referenced: must survive both passes.
    const [claimed] = await db
      .insert(tables.attachments)
      .values({
        kind: "STORY_SCENE",
        idExternal: SCENE_ID,
        status: "READY",
        url: referencedUrl,
        isUploaded: true,
        idCreatedByUser: SEED_USER,
      })
      .returning({ id: tables.attachments.idAttachment });

    // Unclaimed, past the grace period, still holding an uploaded blob: the
    // row and its blob are both deleted.
    const [oldUnclaimed] = await db
      .insert(tables.attachments)
      .values({
        kind: "STORY_SCENE",
        idExternal: null,
        status: "UPLOADING",
        url: oldUnclaimedUrl,
        isUploaded: true,
        idCreatedByUser: SEED_USER,
      })
      .returning({ id: tables.attachments.idAttachment });
    await db
      .update(tables.attachments)
      .set({ createdAt: old })
      .where(eq(tables.attachments.idAttachment, oldUnclaimed.id));

    // Unclaimed, past the grace period, no blob ever attached: the row is
    // deleted, but del() is never asked to remove a url that does not exist.
    const [oldUnclaimedNoBlob] = await db
      .insert(tables.attachments)
      .values({
        kind: "STORY_SCENE",
        idExternal: null,
        status: "UPLOADING",
        idCreatedByUser: SEED_USER,
      })
      .returning({ id: tables.attachments.idAttachment });
    await db
      .update(tables.attachments)
      .set({ createdAt: old })
      .where(eq(tables.attachments.idAttachment, oldUnclaimedNoBlob.id));

    // Unclaimed, but uploaded minutes ago: the grace period keeps it.
    const [recentUnclaimed] = await db
      .insert(tables.attachments)
      .values({
        kind: "STORY_SCENE",
        idExternal: null,
        status: "UPLOADING",
        idCreatedByUser: SEED_USER,
      })
      .returning({ id: tables.attachments.idAttachment });

    list.mock.mockImplementation(async () => ({
      blobs: [
        { url: referencedUrl, uploadedAt: old },
        { url: orphanUrl, uploadedAt: old },
        { url: freshOrphanUrl, uploadedAt: new Date() },
      ],
      cursor: undefined,
    }));

    const response = await GET(request("Bearer s3cret"));

    expect(response.status).toBe(200);

    const deletedUrls = del.mock.calls.flatMap((call) => call.arguments[0]);
    expect(deletedUrls.sort()).toEqual([oldUnclaimedUrl, orphanUrl].sort());

    const survivors = await db
      .select({ id: tables.attachments.idAttachment })
      .from(tables.attachments)
      .where(
        inArray(tables.attachments.idAttachment, [
          claimed.id,
          oldUnclaimed.id,
          oldUnclaimedNoBlob.id,
          recentUnclaimed.id,
        ]),
      );
    expect(survivors.map((row) => row.id).sort()).toEqual(
      [claimed.id, recentUnclaimed.id].sort(),
    );
  });
});
