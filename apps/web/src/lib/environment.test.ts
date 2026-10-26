import { describe, it } from "node:test";
import { expect } from "expect";

import { ENVIRONMENTS, isShownIn, parseEnvironment } from "./environment";

describe("isShownIn", () => {
  it("shows below a level only in the environments strictly before it", () => {
    const rule = { showBelow: "PRODUCTION" } as const;
    expect(isShownIn("DEV", rule)).toBe(true);
    expect(isShownIn("TEST", rule)).toBe(true);
    expect(isShownIn("STAGING", rule)).toBe(true);
    expect(isShownIn("PRODUCTION", rule)).toBe(false);
  });

  it("shows above a level only in the environments strictly after it", () => {
    const rule = { showAbove: "TEST" } as const;
    expect(isShownIn("DEV", rule)).toBe(false);
    expect(isShownIn("TEST", rule)).toBe(false);
    expect(isShownIn("STAGING", rule)).toBe(true);
    expect(isShownIn("PRODUCTION", rule)).toBe(true);
  });

  it("shows between the two when given both", () => {
    const rule = { showAbove: "DEV", showBelow: "PRODUCTION" } as const;
    expect(ENVIRONMENTS.filter((environment) => isShownIn(environment, rule))).toEqual([
      "TEST",
      "STAGING",
    ]);
  });

  it("hides with no rule, and with no environment", () => {
    expect(isShownIn("DEV", {})).toBe(false);
    expect(isShownIn(null, { showBelow: "PRODUCTION" })).toBe(false);
    expect(isShownIn(null, { showAbove: "DEV" })).toBe(false);
  });
});

describe("parseEnvironment", () => {
  it("accepts each of the four environments", () => {
    for (const environment of ENVIRONMENTS) {
      expect(parseEnvironment(environment)).toBe(environment);
    }
    expect(ENVIRONMENTS).toEqual(["DEV", "TEST", "STAGING", "PRODUCTION"]);
  });

  it("refuses anything else, naming what it may be", () => {
    expect(() => parseEnvironment("production")).toThrow(/DEV, TEST, STAGING, PRODUCTION/);
    expect(() => parseEnvironment("")).toThrow(/NEXT_PUBLIC_ENVIRONMENT/);
  });

  it("refuses a missing value", () => {
    expect(() => parseEnvironment(undefined)).toThrow(/NEXT_PUBLIC_ENVIRONMENT is not set/);
  });
});
