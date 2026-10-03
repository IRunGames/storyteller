import { describe, it } from "node:test";
import { expect } from "expect";

import { formatSceneLength } from "./scenes";

describe("formatSceneLength", () => {
  it("counts a scene shorter than an hour in minutes", () => {
    expect(formatSceneLength(45)).toBe("45 minutes");
    expect(formatSceneLength(1)).toBe("1 minute");
    expect(formatSceneLength(0)).toBe("0 minutes");
  });

  it("counts an hour or more in hours, as a session's length reads", () => {
    expect(formatSceneLength(60)).toBe("1 hour");
    expect(formatSceneLength(80)).toBe("1.3 hours");
  });
});
