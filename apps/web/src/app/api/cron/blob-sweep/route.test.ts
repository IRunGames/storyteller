// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. Creates its own fixtures with
// positive ids and cleans them up in both before and after; the seeded
// negative-id attachments are only ever read (their url can land in the
// referenced set), never written to.
//
// The fixtures belong to FIXTURE_USER, a seeded user nothing else writes as,
// and `after` deletes by the ids this file collected. Both matter, because
// `node --test` runs the suite's files in parallel against this one
// database: the sweep under test is global by nature, so the rows it must
// not disturb have to be someone else's, and a cleanup phrased as "every
// positive-id row this user owns" would reach into the fixtures
// stories/actions.test.ts is asserting against at the same moment.
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

// A seeded fixture user (Seamus Finnigan, db/seeds/seed_users.sql) no other
// test writes attachments as. The route itself never looks at who owns a
// row, so which user this is does not matter to what is under test -- what
// matters is that "every positive-id row this user owns" names this file's
// own leftovers and nothing else, which is what makes the sweep in `before`
// safe to run while other files are mid-assertion.
const FIXTURE_USER = "00000000-0000-7000-8000-000000000017";
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

// Every attachment id this file created, so `after` takes away exactly these.
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

    // A run that died before `after` leaves rows behind, and a stale one
    // past the grace period would be swept by the case below and land in
    // its del() assertion. Scoped to FIXTURE_USER's positive-id rows, which
    // can only ever be this file's own leftovers: every seeded row has a
    // negative id, and nothing else in the suite writes as this user.
    await db
      .delete(tables.attachments)
      .where(
        and(
          eq(tables.attachments.idCreatedByUser, FIXTURE_USER),
          gt(tables.attachments.idAttachment, 0),
        ),
      );
  });

  after(async () => {
    const blobModule: { list: unknown; del: unknown } = requireHere("@vercel/blob");
    blobModule.list = originalList;
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
    const claimed = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: SCENE_ID,
      status: "READY",
      url: referencedUrl,
      isUploaded: true,
      idCreatedByUser: FIXTURE_USER,
    });

    // Unclaimed, past the grace period, still holding an uploaded blob: the
    // row and its blob are both deleted.
    const oldUnclaimed = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: null,
      status: "UPLOADING",
      url: oldUnclaimedUrl,
      isUploaded: true,
      idCreatedByUser: FIXTURE_USER,
    });
    await db
      .update(tables.attachments)
      .set({ createdAt: old })
      .where(eq(tables.attachments.idAttachment, oldUnclaimed.id));

    // Unclaimed, past the grace period, no blob ever attached: the row is
    // deleted, but del() is never asked to remove a url that does not exist.
    const oldUnclaimedNoBlob = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: null,
      status: "UPLOADING",
      idCreatedByUser: FIXTURE_USER,
    });
    await db
      .update(tables.attachments)
      .set({ createdAt: old })
      .where(eq(tables.attachments.idAttachment, oldUnclaimedNoBlob.id));

    // Unclaimed, but uploaded minutes ago: the grace period keeps it.
    const recentUnclaimed = await insertAttachment({
      kind: "STORY_SCENE",
      idExternal: null,
      status: "UPLOADING",
      idCreatedByUser: FIXTURE_USER,
    });

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
