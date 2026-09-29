import { describe, it } from "node:test";
import { expect } from "expect";

import { GRACE_MS, staleBlobs, unclaimedAttachmentIds } from "./blob-sweep";

const STORE = "https://abc123.public.blob.vercel-storage.com";
const OLD = new Date("2026-09-20T00:00:00Z");
const RECENT = new Date("2026-09-27T23:50:00Z");
const NOW = new Date("2026-09-28T00:00:00Z");

describe("staleBlobs", () => {
  it("waits a day before considering anything an orphan", () => {
    expect(GRACE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("deletes a blob no row references once it is past the grace period", () => {
    const blobs = [{ url: `${STORE}/uploads/u1/a.jpg`, uploadedAt: OLD }];

    expect(staleBlobs(blobs, new Set(), NOW)).toEqual([`${STORE}/uploads/u1/a.jpg`]);
  });

  // The case the grace period exists for: an image uploaded into a form the
  // user has not submitted yet is referenced by nothing, and deleting it
  // would take the picture out from under them mid-edit.
  it("keeps an unreferenced blob that was uploaded minutes ago", () => {
    const blobs = [{ url: `${STORE}/uploads/u1/a.jpg`, uploadedAt: RECENT }];

    expect(staleBlobs(blobs, new Set(), NOW)).toEqual([]);
  });

  it("keeps an old blob that a row still references", () => {
    const url = `${STORE}/uploads/u1/a.jpg`;
    const blobs = [{ url, uploadedAt: OLD }];

    expect(staleBlobs(blobs, new Set([url]), NOW)).toEqual([]);
  });

  it("sorts the wheat from the chaff in one pass", () => {
    const kept = `${STORE}/uploads/u1/kept.jpg`;
    const fresh = `${STORE}/uploads/u1/fresh.jpg`;
    const orphan = `${STORE}/uploads/u1/orphan.jpg`;
    const blobs = [
      { url: kept, uploadedAt: OLD },
      { url: fresh, uploadedAt: RECENT },
      { url: orphan, uploadedAt: OLD },
    ];

    expect(staleBlobs(blobs, new Set([kept]), NOW)).toEqual([orphan]);
  });

  it("treats a blob exactly on the boundary as still within its grace", () => {
    const blobs = [
      { url: `${STORE}/uploads/u1/a.jpg`, uploadedAt: new Date(NOW.getTime() - GRACE_MS) },
    ];

    expect(staleBlobs(blobs, new Set(), NOW)).toEqual([]);
  });
});

describe("unclaimedAttachmentIds", () => {
  it("returns a detached row past the grace period", () => {
    const rows = [{ idAttachment: 1, idExternal: null, createdAt: OLD }];

    expect(unclaimedAttachmentIds(rows, NOW)).toEqual([1]);
  });

  // Review Focus 4: an upload sitting in a form the user has not submitted is
  // detached and unreferenced, and sweeping it would take the picture out from
  // under them mid-edit. This is the case the grace period exists for.
  it("keeps a detached row uploaded minutes ago", () => {
    const rows = [{ idAttachment: 1, idExternal: null, createdAt: RECENT }];

    expect(unclaimedAttachmentIds(rows, NOW)).toEqual([]);
  });

  it("keeps an attached row however old", () => {
    const rows = [{ idAttachment: 1, idExternal: 42, createdAt: OLD }];

    expect(unclaimedAttachmentIds(rows, NOW)).toEqual([]);
  });

  it("treats a row exactly on the boundary as still within its grace", () => {
    const rows = [
      { idAttachment: 1, idExternal: null, createdAt: new Date(NOW.getTime() - GRACE_MS) },
    ];

    expect(unclaimedAttachmentIds(rows, NOW)).toEqual([]);
  });
});
