import { describe, it } from "node:test";
import { expect } from "expect";

import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  isOwnUploadedBlobUrl,
  isUploadedBlobUrl,
  uploadPrefix,
} from "./image-uploads";

const STORE = "https://abc123.public.blob.vercel-storage.com";
const USER = "8f2b1c44-0000-4000-8000-000000000001";

describe("image upload limits", () => {
  it("allows exactly the four image types the route handler allows", () => {
    expect([...ALLOWED_IMAGE_TYPES]).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ]);
  });

  it("caps uploads at 10 MB", () => {
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("isUploadedBlobUrl", () => {
  it("recognises a URL on our store", () => {
    expect(isUploadedBlobUrl(`${STORE}/uploads/${USER}/cat-x1y2.jpg`)).toBe(true);
  });

  it("rejects an external URL", () => {
    expect(isUploadedBlobUrl("https://rpg.irun.games/images/vampire.jpg")).toBe(false);
  });

  // The whole reason this parses rather than calling includes(): the store
  // domain appears in this hostname, but the host is the attacker's.
  it("rejects a lookalike hostname that merely contains the store domain", () => {
    expect(isUploadedBlobUrl("https://public.blob.vercel-storage.com.example.com/x")).toBe(false);
  });

  // Review Focus 4: the same host, spelled two ways the URL parser preserves.
  it("recognises the host whatever its case, and with a trailing dot", () => {
    expect(isUploadedBlobUrl("HTTPS://X.PUBLIC.BLOB.VERCEL-STORAGE.COM./k")).toBe(true);
  });

  it("rejects a value that is not a URL at all, rather than throwing", () => {
    expect(isUploadedBlobUrl("not a url")).toBe(false);
    expect(isUploadedBlobUrl("")).toBe(false);
  });

  it("rejects http, since the store is only ever served over https", () => {
    expect(isUploadedBlobUrl("http://abc123.public.blob.vercel-storage.com/k")).toBe(false);
  });
});

describe("isOwnUploadedBlobUrl", () => {
  it("accepts a key under the caller's own prefix", () => {
    expect(isOwnUploadedBlobUrl(`${STORE}/uploads/${USER}/cat-x1y2.jpg`, USER)).toBe(true);
  });

  it("refuses a key under another user's prefix", () => {
    const other = "8f2b1c44-0000-4000-8000-000000000002";
    expect(isOwnUploadedBlobUrl(`${STORE}/uploads/${other}/cat-x1y2.jpg`, USER)).toBe(false);
  });

  // Review Focus 5: on our store, but not something this feature uploaded.
  it("refuses a blob with no uploads/ prefix at all", () => {
    expect(isOwnUploadedBlobUrl(`${STORE}/legacy/cat.jpg`, USER)).toBe(false);
  });

  it("refuses an external URL even when the path looks right", () => {
    expect(isOwnUploadedBlobUrl(`https://example.com/uploads/${USER}/cat.jpg`, USER)).toBe(false);
  });

  it("builds the prefix the route handler and the component agree on", () => {
    expect(uploadPrefix(USER)).toBe(`uploads/${USER}/`);
  });
});
