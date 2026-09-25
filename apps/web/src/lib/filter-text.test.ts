import { describe, it } from "node:test";
import { expect } from "expect";

import { matchesFilter } from "./filter-text";

describe("matchesFilter", () => {
  it("matches everything on an empty or blank query", () => {
    expect(matchesFilter("The vault", "")).toBe(true);
    expect(matchesFilter("The vault", "   ")).toBe(true);
  });

  it("matches a substring regardless of case and surrounding space", () => {
    expect(matchesFilter("The vault", "VAULT")).toBe(true);
    expect(matchesFilter("The vault", " the ")).toBe(true);
    expect(matchesFilter("The vault", "feast")).toBe(false);
  });
});
