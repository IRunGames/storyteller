import { describe, it } from "node:test";
import { expect } from "expect";

import { isUserTypeShown, USER_TYPES } from "./user-types";

const { unpaidPlayer, unpaidStoryteller, paidStoryteller, administrator } = USER_TYPES;
const ALL = [unpaidPlayer, unpaidStoryteller, paidStoryteller, administrator];

describe("isUserTypeShown", () => {
  it("names the seed's user types", () => {
    expect(USER_TYPES).toEqual({
      unpaidPlayer: -1,
      unpaidStoryteller: -2,
      paidStoryteller: -3,
      administrator: -100,
    });
  });

  it("shows above a type only to the strictly more powerful, which have smaller ids", () => {
    expect(ALL.filter((type) => isUserTypeShown(type, { showAbove: unpaidPlayer }))).toEqual([
      unpaidStoryteller,
      paidStoryteller,
      administrator,
    ]);
  });

  it("shows below a type only to the strictly less powerful", () => {
    expect(ALL.filter((type) => isUserTypeShown(type, { showBelow: administrator }))).toEqual([
      unpaidPlayer,
      unpaidStoryteller,
      paidStoryteller,
    ]);
  });

  it("shows between the two when given both", () => {
    const rule = { showAbove: unpaidPlayer, showBelow: administrator };
    expect(ALL.filter((type) => isUserTypeShown(type, rule))).toEqual([
      unpaidStoryteller,
      paidStoryteller,
    ]);
  });

  it("hides with no rule", () => {
    expect(isUserTypeShown(administrator, {})).toBe(false);
  });
});
