import { describe, it } from "node:test";
import { expect } from "expect";

import { canSeeDiagnostics } from "./diagnostics";
import { USER_TYPES } from "./user-types";

describe("canSeeDiagnostics", () => {
  it("lets storytellers and administrators in", () => {
    expect(canSeeDiagnostics(USER_TYPES.unpaidStoryteller)).toBe(true);
    expect(canSeeDiagnostics(USER_TYPES.paidStoryteller)).toBe(true);
    expect(canSeeDiagnostics(USER_TYPES.administrator)).toBe(true);
  });

  it("keeps a player out, paid or not", () => {
    expect(canSeeDiagnostics(USER_TYPES.unpaidPlayer)).toBe(false);
    expect(canSeeDiagnostics(USER_TYPES.paidPlayer)).toBe(false);
    expect(canSeeDiagnostics(0)).toBe(false);
  });
});
