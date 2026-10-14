import { describe, it } from "node:test";
import { expect } from "expect";

import { canSeeDiagnostics } from "./diagnostics";

describe("canSeeDiagnostics", () => {
  it("lets storytellers and administrators in", () => {
    expect(canSeeDiagnostics(-2)).toBe(true);
    expect(canSeeDiagnostics(-3)).toBe(true);
    expect(canSeeDiagnostics(-100)).toBe(true);
  });

  it("keeps a player out", () => {
    expect(canSeeDiagnostics(-1)).toBe(false);
    expect(canSeeDiagnostics(0)).toBe(false);
  });
});
