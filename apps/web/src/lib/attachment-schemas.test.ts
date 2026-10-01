import { describe, it } from "node:test";
import { expect } from "expect";

import {
  attachmentIdsSchema,
  attachmentTagsSchema,
  attachmentKindSchema,
  attachmentUrlSchema,
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

describe("attachmentUrlSchema", () => {
  it("accepts an http or https url and trims it", () => {
    expect(attachmentUrlSchema.parse("  https://rpg.irun.games/images/x.jpg  ")).toBe(
      "https://rpg.irun.games/images/x.jpg",
    );
    expect(attachmentUrlSchema.safeParse("http://example.com/x.png").success).toBe(true);
  });

  it("refuses anything that is not a url", () => {
    expect(attachmentUrlSchema.safeParse("not a url").success).toBe(false);
    // No empty case, unlike the story field this rule came from: a story with
    // no picture now has no attachment row at all.
    expect(attachmentUrlSchema.safeParse("").success).toBe(false);
  });

  it("refuses a url that is not http(s)", () => {
    // The value lands inside a CSS url("…") on the story card, so a
    // javascript: or data: url must never reach the database.
    expect(attachmentUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(attachmentUrlSchema.safeParse("data:text/plain,x").success).toBe(false);
  });
});

describe("attachmentTagsSchema", () => {
  it("trims, lower-cases and drops repeats", () => {
    expect(attachmentTagsSchema.parse([" Map", "map", "Handout "])).toEqual(["map", "handout"]);
  });

  it("refuses cover, an empty tag, a long one, and too many", () => {
    expect(attachmentTagsSchema.safeParse(["Cover"]).success).toBe(false);
    expect(attachmentTagsSchema.safeParse(["  "]).success).toBe(false);
    expect(attachmentTagsSchema.safeParse(["x".repeat(41)]).success).toBe(false);
    expect(
      attachmentTagsSchema.safeParse(Array.from({ length: 21 }, (_, i) => `t${i}`)).success,
    ).toBe(false);
  });
});
