import { describe, it } from "node:test";
import { expect } from "expect";

import { JOIN_CAP_PAID, JOIN_CAP_UNPAID, joinCap } from "./join";
import { nicknameSchema } from "./join-schemas";
import { USER_TYPES } from "./user-types";

describe("joinCap", () => {
  it("lets an unpaid storyteller seat 3 from the link and a paid one 10", () => {
    expect(JOIN_CAP_UNPAID).toBe(3);
    expect(JOIN_CAP_PAID).toBe(10);
    expect(joinCap(USER_TYPES.unpaidPlayer)).toBe(3);
    expect(joinCap(USER_TYPES.unpaidStoryteller)).toBe(3);
    expect(joinCap(USER_TYPES.paidStoryteller)).toBe(10);
    expect(joinCap(USER_TYPES.administrator)).toBe(10);
  });
});

describe("nicknameSchema", () => {
  it("trims, and refuses an empty or overlong name", () => {
    expect(nicknameSchema.parse("  Sleepy Otter ")).toBe("Sleepy Otter");
    expect(nicknameSchema.safeParse("   ").success).toBe(false);
    expect(nicknameSchema.safeParse("x".repeat(41)).success).toBe(false);
  });
});
