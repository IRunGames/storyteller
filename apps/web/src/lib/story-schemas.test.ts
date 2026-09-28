import { describe, it } from "node:test";
import { expect } from "expect";

import { storySchema } from "./story-schemas";

function messagesFor(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  if (result.success || !result.error) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

const good = {
  title: "Something Wicked",
  idSystem: -25,
  summary: "A magical gothic horror campaign.",
  attachmentIds: [],
  isLookingForPlayers: false,
  isActive: true,
  isArchived: false,
};

describe("storySchema", () => {
  it("accepts a complete story and trims the title", () => {
    const result = storySchema.safeParse({ ...good, title: "  Something Wicked  " });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(good);
  });

  it("turns off active and looking for players on an archived story", () => {
    const result = storySchema.safeParse({
      ...good,
      isLookingForPlayers: true,
      isActive: true,
      isArchived: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      ...good,
      isLookingForPlayers: false,
      isActive: false,
      isArchived: true,
    });
  });

  it("refuses a blank title", () => {
    expect(messagesFor(storySchema.safeParse({ ...good, title: "  " }))).toEqual({
      title: "Please give the story a title.",
    });
  });

  it("refuses a title over 200 characters", () => {
    expect(messagesFor(storySchema.safeParse({ ...good, title: "x".repeat(201) }))).toEqual({
      title: "Keep the title under 200 characters.",
    });
  });

  it("treats an empty system as none", () => {
    const result = storySchema.safeParse({ ...good, idSystem: "" });

    expect(result.success).toBe(true);
    expect(result.data?.idSystem).toBeNull();
  });

  it("coerces a numeric string system id from a select", () => {
    const result = storySchema.safeParse({ ...good, idSystem: "-25" });

    expect(result.success).toBe(true);
    expect(result.data?.idSystem).toBe(-25);
  });

  it("takes the attachment ids a create form collected, and defaults to none", () => {
    expect(storySchema.safeParse({ ...good, attachmentIds: [-3, -4] }).data?.attachmentIds).toEqual(
      [-3, -4],
    );
    // The edit form posts no ids at all: its field attaches its rows itself.
    const { attachmentIds: _omitted, ...withoutIds } = good;
    expect(storySchema.safeParse(withoutIds).data?.attachmentIds).toEqual([]);
  });

  it("refuses attachment ids Postgres could not compare, or too many of them", () => {
    expect(storySchema.safeParse({ ...good, attachmentIds: [3e9] }).success).toBe(false);
    expect(
      storySchema.safeParse({ ...good, attachmentIds: Array.from({ length: 51 }, (_, i) => i) })
        .success,
    ).toBe(false);
  });

  it("refuses a summary over 4000 characters", () => {
    expect(messagesFor(storySchema.safeParse({ ...good, summary: "x".repeat(4001) }))).toEqual({
      summary: "Keep the summary under 4000 characters.",
    });
  });
});
