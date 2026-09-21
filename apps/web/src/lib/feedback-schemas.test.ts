import { describe, it } from "node:test";
import { expect } from "expect";

import { feedbackSchema } from "./feedback-schemas";

function messagesFor(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  if (result.success || !result.error) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

const good = {
  isPositive: true,
  feedback: "Loved the new cards.",
  pagePath: "/home",
};

describe("feedbackSchema", () => {
  it("accepts a rating with text and trims the text", () => {
    const result = feedbackSchema.safeParse({ ...good, feedback: "  Loved the new cards.  " });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(good);
  });

  it("accepts a rating with no text", () => {
    const result = feedbackSchema.safeParse({ ...good, feedback: "" });

    expect(result.success).toBe(true);
    expect(result.data?.feedback).toBe("");
  });

  it("refuses a missing rating", () => {
    expect(messagesFor(feedbackSchema.safeParse({ ...good, isPositive: undefined }))).toEqual({
      isPositive: "Pick thumbs up or thumbs down.",
    });
  });

  it("refuses text over 2000 characters", () => {
    expect(messagesFor(feedbackSchema.safeParse({ ...good, feedback: "x".repeat(2001) }))).toEqual({
      feedback: "Keep it under 2000 characters.",
    });
  });

  it("refuses a page path that is not a path", () => {
    expect(feedbackSchema.safeParse({ ...good, pagePath: "" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...good, pagePath: "https://example.com/home" }).success).toBe(
      false,
    );
    expect(feedbackSchema.safeParse({ ...good, pagePath: "/home/42" }).success).toBe(true);
  });
});
