import { describe, it } from "node:test";
import { expect } from "expect";
import * as messages from "./messages";

// The module compiles to CJS, so the namespace carries a synthetic `default`
// key beside the constants; it is not a message.
const entries = Object.entries(messages).filter(([name]) => name !== "default");

describe("refusal messages", () => {
  it("are whole sentences", () => {
    for (const [name, text] of entries) {
      expect([name, typeof text]).toEqual([name, "string"]);
      expect([name, /^[A-Z].*\.$/.test(text as string)]).toEqual([name, true]);
    }
  });

  it("say each thing once, under one name", () => {
    const texts = entries.map(([, text]) => text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});
