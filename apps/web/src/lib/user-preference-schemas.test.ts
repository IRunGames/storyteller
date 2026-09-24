import { describe, it } from "node:test";
import { expect } from "expect";

import { jsonValueSchema, setUserPreferenceSchema } from "./user-preference-schemas";

function messagesFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  if (result.success || !result.error) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

describe("jsonValueSchema", () => {
  it("accepts every JSON shape, nested", () => {
    const value = { a: 1, b: "two", c: [true, null, { d: [] }] };

    expect(jsonValueSchema.safeParse(value)).toEqual({ success: true, data: value });
    expect(jsonValueSchema.safeParse(null).success).toBe(true);
    expect(jsonValueSchema.safeParse("x").success).toBe(true);
  });

  it("refuses what JSON cannot carry", () => {
    expect(jsonValueSchema.safeParse(undefined).success).toBe(false);
    expect(jsonValueSchema.safeParse(() => 1).success).toBe(false);
    expect(jsonValueSchema.safeParse(new Date()).success).toBe(false);
    expect(jsonValueSchema.safeParse({ nested: undefined }).success).toBe(false);
  });
});

describe("setUserPreferenceSchema", () => {
  it("accepts a key with any JSON value and trims the key", () => {
    const result = setUserPreferenceSchema.safeParse({ key: "  sidebar  ", value: { open: true } });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ key: "sidebar", value: { open: true } });
  });

  it("refuses an empty key", () => {
    expect(messagesFor(setUserPreferenceSchema.safeParse({ key: "   ", value: 1 }))).toEqual({
      key: "A preference needs a key.",
    });
  });

  it("refuses a key over 100 characters", () => {
    expect(
      messagesFor(setUserPreferenceSchema.safeParse({ key: "k".repeat(101), value: 1 })),
    ).toEqual({ key: "Keep the key under 100 characters." });
  });

  it("refuses a value that would not survive JSON", () => {
    const result = setUserPreferenceSchema.safeParse({ key: "sidebar", value: undefined });

    expect(result.success).toBe(false);
    expect(Object.keys(messagesFor(result))).toEqual(["value"]);
  });

  it("refuses a value over 10000 characters once serialised", () => {
    expect(
      messagesFor(setUserPreferenceSchema.safeParse({ key: "big", value: "x".repeat(10_000) })),
    ).toEqual({ value: "Keep a preference under 10000 characters." });
  });
});
