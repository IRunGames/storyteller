import { describe, it } from "node:test";
import { expect } from "expect";
import { ERROR_BACKGROUNDS, pickErrorBackground } from "./error-page";

describe("pickErrorBackground", () => {
  it("can land on every picture, and only on them, when there is no digest", () => {
    const n = ERROR_BACKGROUNDS.length;
    const picks = Array.from({ length: n }, (_, i) =>
      pickErrorBackground(undefined, () => (i + 0.5) / n),
    );
    expect(picks).toEqual([...ERROR_BACKGROUNDS]);
    expect(pickErrorBackground(undefined, () => 0.999999)).toBe(ERROR_BACKGROUNDS[n - 1]);
  });

  it("gives one digest the same picture every time, without reaching for chance", () => {
    const never = () => {
      throw new Error("a digest is not random");
    };
    const first = pickErrorBackground("1234567890", never);
    expect(ERROR_BACKGROUNDS).toContain(first);
    expect(pickErrorBackground("1234567890", never)).toBe(first);
  });

  it("spreads digests across the pictures", () => {
    const seen = new Set(Array.from({ length: 30 }, (_, i) => pickErrorBackground(`digest-${i}`)));
    expect(seen).toEqual(new Set(ERROR_BACKGROUNDS));
  });
});
