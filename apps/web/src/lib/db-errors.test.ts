import { describe, it } from "node:test";
import { expect } from "expect";

import { isTransitionRefusal, isUniqueViolation, pgErrorCode } from "./db-errors";

describe("pgErrorCode", () => {
  it("reads the SQLSTATE off the error itself", () => {
    expect(pgErrorCode({ code: "23505" })).toBe("23505");
  });

  it("reads it off the cause the driver wraps a query failure in", () => {
    expect(pgErrorCode(new Error("Failed query", { cause: { code: "P0001" } }))).toBe("P0001");
  });

  it("has none for a plain error, a non-string code, or nothing at all", () => {
    expect(pgErrorCode(new Error("boom"))).toBeUndefined();
    expect(pgErrorCode({ code: 42 })).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
    expect(pgErrorCode(undefined)).toBeUndefined();
  });
});

describe("isUniqueViolation and isTransitionRefusal", () => {
  it("tell a unique violation from a raised refusal, on the error or its cause", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(new Error("x", { cause: { code: "23505" } }))).toBe(true);
    expect(isUniqueViolation({ code: "P0001" })).toBe(false);
    expect(isTransitionRefusal({ code: "P0001" })).toBe(true);
    expect(isTransitionRefusal(new Error("x", { cause: { code: "P0001" } }))).toBe(true);
    expect(isTransitionRefusal({ code: "23505" })).toBe(false);
  });

  it("call a connection failure neither", () => {
    expect(isUniqueViolation(new Error("ECONNREFUSED"))).toBe(false);
    expect(isTransitionRefusal(new Error("ECONNREFUSED"))).toBe(false);
  });
});
