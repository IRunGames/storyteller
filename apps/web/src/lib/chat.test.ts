import { describe, it } from "node:test";
import { expect } from "expect";
import { senderInitials, senderPalette } from "./chat";

describe("senderPalette", () => {
  it("gives a sender the same palette every time", () => {
    expect(senderPalette("Harry")).toBe(senderPalette("Harry"));
  });

  it("spreads senders over more than one palette", () => {
    const palettes = new Set(["Harry", "Tom", "David", "Storyteller", "Ana"].map(senderPalette));
    expect(palettes.size).toBeGreaterThan(1);
  });
});

describe("senderInitials", () => {
  it("takes two letters whatever the name", () => {
    expect(senderInitials("David Williams")).toBe("DW");
    expect(senderInitials("Harry")).toBe("HA");
    expect(senderInitials("  tom  ")).toBe("TO");
    expect(senderInitials("Ana Lucia Reyes")).toBe("AL");
  });
});
