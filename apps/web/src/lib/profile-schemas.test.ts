import { describe, it } from "node:test";
import { expect } from "expect";

import {
  avatarUrlSchema,
  profileColorSchema,
  profileDetailsSchema,
  profileStatusSchema,
  systemIdSchema,
} from "./profile-schemas";

function messagesFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  if (result.success || !result.error) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

const good = { name: "Paul Stafford", nickName: "Gandalf", bio: "Runs the table on Thursdays." };

describe("profileDetailsSchema", () => {
  it("accepts a name, nickname and bio and trims them", () => {
    const result = profileDetailsSchema.safeParse({
      name: "  Paul Stafford ",
      nickName: " Gandalf ",
      bio: " Runs the table on Thursdays. ",
    });
    expect(result.data).toEqual(good);
  });

  it("accepts an empty nickname and bio", () => {
    expect(profileDetailsSchema.safeParse({ ...good, nickName: "", bio: "" }).success).toBe(true);
  });

  it("refuses an empty name", () => {
    expect(messagesFor(profileDetailsSchema.safeParse({ ...good, name: "   " }))).toEqual({
      name: "Your name cannot be empty.",
    });
  });

  it("refuses an overlong nickname and bio", () => {
    expect(
      messagesFor(
        profileDetailsSchema.safeParse({
          ...good,
          nickName: "n".repeat(51),
          bio: "b".repeat(1001),
        }),
      ),
    ).toEqual({
      nickName: "Keep your nickname under 50 characters.",
      bio: "Keep your bio under 1000 characters.",
    });
  });
});

describe("profileStatusSchema", () => {
  it("trims a thought and refuses one over 140 characters", () => {
    expect(profileStatusSchema.parse("  rolling dice  ")).toBe("rolling dice");
    expect(profileStatusSchema.safeParse("x".repeat(141)).success).toBe(false);
  });
});

describe("avatarUrlSchema", () => {
  it("accepts an https link", () => {
    expect(avatarUrlSchema.parse(" https://example.com/me.png ")).toBe(
      "https://example.com/me.png",
    );
  });

  it("refuses http, other schemes and things that are not links", () => {
    for (const value of ["http://example.com/me.png", "javascript:alert(1)", "me.png", ""]) {
      expect(avatarUrlSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("profileColorSchema", () => {
  it("accepts a palette colour and refuses any other", () => {
    expect(profileColorSchema.safeParse("#46A758").success).toBe(true);
    expect(profileColorSchema.safeParse("#000000").success).toBe(false);
  });
});

describe("systemIdSchema", () => {
  it("refuses ids Postgres would not take as int4", () => {
    expect(systemIdSchema.safeParse(-5).success).toBe(true);
    expect(systemIdSchema.safeParse(2 ** 31).success).toBe(false);
    expect(systemIdSchema.safeParse(1.5).success).toBe(false);
  });
});
