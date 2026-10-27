import { describe, it } from "node:test";
import { expect } from "expect";

import {
  DEFAULT_PROFILE_COLOR,
  PROFILE_COLORS,
  avatarSrc,
  chosenProfileColor,
  profileColor,
} from "./profile";

describe("profile colours", () => {
  it("offers twelve distinct colours, the default among them", () => {
    const values = PROFILE_COLORS.map((color) => color.value);
    expect(new Set(values).size).toBe(12);
    expect(values).toContain(DEFAULT_PROFILE_COLOR);
  });

  it("reads a stored palette colour", () => {
    expect(profileColor("#46A758")).toBe("#46A758");
  });

  it("falls back to the default when nothing or something off the palette is stored", () => {
    expect(profileColor(undefined)).toBe(DEFAULT_PROFILE_COLOR);
    expect(profileColor("#000000")).toBe(DEFAULT_PROFILE_COLOR);
    expect(profileColor(7)).toBe(DEFAULT_PROFILE_COLOR);
  });

  it("says when no palette colour was chosen, for a caller with its own fallback", () => {
    expect(chosenProfileColor("#46A758")).toBe("#46A758");
    expect(chosenProfileColor(undefined)).toBeNull();
    expect(chosenProfileColor("#000000")).toBeNull();
  });
});

describe("avatarSrc", () => {
  const google = "https://lh3.googleusercontent.com/a/me";

  it("prefers the picture set on the profile", () => {
    expect(avatarSrc("https://example.com/me.png", google)).toBe("https://example.com/me.png");
  });

  it("falls back to the sign-in picture, then to none", () => {
    expect(avatarSrc(undefined, google)).toBe(google);
    expect(avatarSrc(null, google)).toBe(google);
    expect(avatarSrc("", "")).toBeNull();
    expect(avatarSrc(undefined, null)).toBeNull();
  });
});
