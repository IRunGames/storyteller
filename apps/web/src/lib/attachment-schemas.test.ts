import { describe, it } from "node:test";
import { expect } from "expect";

import {
  attachmentIdsSchema,
  attachmentKindSchema,
  idAttachmentSchema,
  idExternalSchema,
} from "./attachment-schemas";

describe("idAttachmentSchema and idExternalSchema", () => {
  it("accepts an id within int4 range, including negative seed ids", () => {
    expect(idAttachmentSchema.safeParse(42).success).toBe(true);
    expect(idExternalSchema.safeParse(-21).success).toBe(true);
  });

  it("refuses an id outside int4 range", () => {
    expect(idAttachmentSchema.safeParse(3e9).success).toBe(false);
    expect(idExternalSchema.safeParse(-3e9).success).toBe(false);
  });

  it("refuses a non-integer", () => {
    expect(idAttachmentSchema.safeParse(1.5).success).toBe(false);
  });
});

describe("attachmentKindSchema", () => {
  it("accepts the three known kinds", () => {
    expect(attachmentKindSchema.safeParse("STORY").success).toBe(true);
    expect(attachmentKindSchema.safeParse("STORY_SESSION").success).toBe(true);
    expect(attachmentKindSchema.safeParse("STORY_SCENE").success).toBe(true);
  });

  it("refuses anything else", () => {
    expect(attachmentKindSchema.safeParse("SCENE").success).toBe(false);
    expect(attachmentKindSchema.safeParse("").success).toBe(false);
  });
});

describe("attachmentIdsSchema", () => {
  it("accepts an empty array and a handful of ids", () => {
    expect(attachmentIdsSchema.safeParse([]).success).toBe(true);
    expect(attachmentIdsSchema.safeParse([1, 2, 3]).success).toBe(true);
  });

  it("refuses more than 50 ids", () => {
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    expect(attachmentIdsSchema.safeParse(ids).success).toBe(false);
  });

  it("refuses a non-integer element", () => {
    expect(attachmentIdsSchema.safeParse([1, 2.5]).success).toBe(false);
  });
});
