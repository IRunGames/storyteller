import { describe, it } from "node:test";
import { expect } from "expect";
import { plural } from "./plural";

describe("plural", () => {
  it("adds an s for every count but one", () => {
    expect(plural(1, "player")).toBe("1 player");
    expect(plural(0, "player")).toBe("0 players");
    expect(plural(3, "player")).toBe("3 players");
  });

  it("takes an irregular plural", () => {
    expect(plural(1, "person", "people")).toBe("1 person");
    expect(plural(2, "person", "people")).toBe("2 people");
  });
});
