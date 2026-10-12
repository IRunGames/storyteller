import { describe, it } from "node:test";
import { expect } from "expect";
import { sessionTitleSchema } from "./session-schemas";

describe("sessionTitleSchema", () => {
  it("trims a title, and makes an empty one null", () => {
    expect(sessionTitleSchema.parse("  Kildealg ")).toBe("Kildealg");
    expect(sessionTitleSchema.parse("   ")).toBeNull();
  });

  it("refuses a title over 200 characters", () => {
    const result = sessionTitleSchema.safeParse("x".repeat(201));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Keep the title under 200 characters.");
  });
});
