import { describe, it } from "node:test";
import { expect } from "expect";

import { formatLastPlayed, systemLabel } from "./stories";

describe("systemLabel", () => {
  it("returns null when there is no system", () => {
    expect(systemLabel({ systemName: null, systemVersion: null, variant: null })).toBeNull();
  });

  it("shows just the name", () => {
    expect(systemLabel({ systemName: "Daggerheart", systemVersion: null, variant: null })).toBe(
      "Daggerheart",
    );
  });

  it("joins name, variant and version", () => {
    expect(
      systemLabel({ systemName: "Cypher System", systemVersion: "Revised", variant: "Numenera" }),
    ).toBe("Cypher System · Numenera (Revised)");
  });
});

describe("formatLastPlayed", () => {
  it("formats as a short month, day and year", () => {
    expect(formatLastPlayed(new Date("2015-06-25T12:00:00Z"))).toBe("Jun 25, 2015");
  });
});
