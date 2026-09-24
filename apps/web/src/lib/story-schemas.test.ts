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
  imageUrl: "https://rpg.irun.games/images/x.jpg",
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

  it("allows an empty image URL but refuses a malformed one", () => {
    expect(storySchema.safeParse({ ...good, imageUrl: "" }).success).toBe(true);
    expect(messagesFor(storySchema.safeParse({ ...good, imageUrl: "not a url" }))).toEqual({
      imageUrl: "Please enter a valid URL.",
    });
  });

  it("refuses an image URL that is not http(s)", () => {
    // The value lands inside a CSS url("…") on the story card, so a
    // javascript: or data: URL must never reach the database.
    expect(messagesFor(storySchema.safeParse({ ...good, imageUrl: "javascript:alert(1)" }))).toEqual({
      imageUrl: "Please enter a valid URL.",
    });
    expect(messagesFor(storySchema.safeParse({ ...good, imageUrl: "data:text/plain,x" }))).toEqual({
      imageUrl: "Please enter a valid URL.",
    });
    expect(storySchema.safeParse({ ...good, imageUrl: "http://example.com/x.png" }).success).toBe(
      true,
    );
  });

  it("refuses a summary over 4000 characters", () => {
    expect(messagesFor(storySchema.safeParse({ ...good, summary: "x".repeat(4001) }))).toEqual({
      summary: "Keep the summary under 4000 characters.",
    });
  });
});
