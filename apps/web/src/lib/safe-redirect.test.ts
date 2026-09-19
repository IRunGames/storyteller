import { describe, it } from "node:test";
import { expect } from "expect";

import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it("lets a same-origin absolute path through", () => {
    expect(safeRedirect("/play")).toBe("/play");
  });

  it("keeps the query string on an otherwise safe path", () => {
    expect(safeRedirect("/play?chapter=3")).toBe("/play?chapter=3");
  });

  it("falls back when the value is missing", () => {
    expect(safeRedirect(undefined)).toBe("/home");
  });

  it("rejects an absolute URL pointing off-site", () => {
    expect(safeRedirect("https://evil.example")).toBe("/home");
  });

  it("rejects a protocol-relative URL", () => {
    // "//evil.example" inherits the current scheme and leaves the site.
    expect(safeRedirect("//evil.example")).toBe("/home");
  });

  it("rejects the backslash variant browsers normalise to a protocol-relative URL", () => {
    expect(safeRedirect("/\\evil.example")).toBe("/home");
  });

  it("rejects a bare relative path that could resolve anywhere", () => {
    expect(safeRedirect("play")).toBe("/home");
  });

  it("reads the first entry when the query string repeated the parameter", () => {
    expect(safeRedirect(["/play", "/home"])).toBe("/play");
  });

  it("rejects an unsafe first entry even when a safe one follows", () => {
    expect(safeRedirect(["//evil.example", "/play"])).toBe("/home");
  });

  it("uses a caller-supplied fallback instead of the default", () => {
    expect(safeRedirect("//evil.example", "/login")).toBe("/login");
  });
});
