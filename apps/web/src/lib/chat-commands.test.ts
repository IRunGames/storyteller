import { describe, it } from "node:test";
import { expect } from "expect";

import { parseChatCommand } from "./chat-commands";

const roll = (notation: string, label: string | null) => ({
  ok: true,
  command: "roll",
  notation,
  label,
});

describe("parseChatCommand", () => {
  it("leaves a line that does not start with a slash alone", () => {
    expect(parseChatCommand("Nobody touches the box.")).toBeNull();
    expect(parseChatCommand("roll 2d6")).toBeNull();
  });

  it("takes whatever follows the dice as the roll's text", () => {
    expect(parseChatCommand("/roll 2d4+2 for initiative")).toEqual(roll("2d4+2", "for initiative"));
    expect(parseChatCommand("/roll 1d20 to sneak past the guard")).toEqual(
      roll("1d20", "to sneak past the guard"),
    );
    expect(parseChatCommand("/ROLL d20  initiative ")).toEqual(roll("d20", "initiative"));
  });

  it("reads a roll with nothing after it", () => {
    expect(parseChatCommand("/roll 2d4+2")).toEqual(roll("2d4+2", null));
  });

  it("allows spaces inside the dice", () => {
    expect(parseChatCommand("/roll 2d4 + 2 initiative")).toEqual(roll("2d4 + 2", "initiative"));
    expect(parseChatCommand("/roll (1d6 + 2) * 2 damage")).toEqual(roll("(1d6 + 2) * 2", "damage"));
  });

  it("keeps the notation's own modifiers with its dice", () => {
    expect(parseChatCommand("/roll 4d6kh3 strength")).toEqual(roll("4d6kh3", "strength"));
    expect(parseChatCommand("/roll 3d6! d%")).toEqual(roll("3d6!", "d%"));
    expect(parseChatCommand("/roll 4dF+1 fate")).toEqual(roll("4dF+1", "fate"));
  });

  it("starts the text at a number with no operator before it", () => {
    expect(parseChatCommand("/roll 1d20 3 goblins")).toEqual(roll("1d20", "3 goblins"));
    expect(parseChatCommand("/roll 2d6 - a risky one")).toEqual(roll("2d6", "- a risky one"));
  });

  it("asks for the dice when the roll does not start with them", () => {
    const error = { ok: false, error: "Start with the dice: /roll 2d6+1 for initiative." };
    expect(parseChatCommand("/roll")).toEqual(error);
    expect(parseChatCommand("/roll for initiative")).toEqual(error);
    expect(parseChatCommand("/roll banana")).toEqual(error);
  });

  it("refuses a command there is not", () => {
    expect(parseChatCommand("/shout hello")).toEqual({
      ok: false,
      error: "There is no /shout. Try /roll 2d6+1 for initiative.",
    });
    expect(parseChatCommand("/")).toEqual({
      ok: false,
      error: "There is no /. Try /roll 2d6+1 for initiative.",
    });
  });

  it("refuses text over 200 characters", () => {
    expect(parseChatCommand(`/roll 1d6 ${"x".repeat(201)}`)).toEqual({
      ok: false,
      error: "Keep what the roll is for under 200 characters.",
    });
  });
});
