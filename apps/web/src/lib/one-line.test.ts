import { describe, it } from "node:test";
import { expect } from "expect";
import { oneLine } from "./one-line";

describe("oneLine", () => {
  it("turns every kind of line break into one space", () => {
    const breaks = ["\n", "\r\n", "\r", "\v", "\f", "\u0085", " ", " "];
    expect(breaks.map((br) => oneLine(`Ada${br}Lovelace`))).toEqual(breaks.map(() => "Ada Lovelace"));
  });

  it("turns other control characters into a space", () => {
    const controls = ["\u0000", "\u001b", "\u007f", "\u009b"];
    expect(controls.map((c) => oneLine(`Ada${c}Lovelace`))).toEqual(controls.map(() => "Ada Lovelace"));
  });

  it("drops bidi embeddings, overrides and isolates, so a name cannot reorder the text after it", () => {
    const bidi = ["‪", "‫", "‬", "‭", "‮", "⁦", "⁧", "⁨", "⁩"];
    expect(bidi.map((c) => oneLine(`Ada${c} Lovelace`))).toEqual(bidi.map(() => "Ada Lovelace"));
  });

  it("keeps the joiners an emoji or a script needs", () => {
    expect(oneLine("👩‍💻 Ada")).toBe("👩‍💻 Ada");
    expect(oneLine("می‌خواهم")).toBe("می‌خواهم");
  });
});
