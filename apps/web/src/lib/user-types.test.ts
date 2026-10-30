import { describe, it } from "node:test";
import { expect } from "expect";

import { isUserTypeShown, USER_TYPES } from "./user-types";

const { unpaidPlayer, paidPlayer, unpaidStoryteller, paidStoryteller, administrator } = USER_TYPES;
const ALL = [unpaidPlayer, paidPlayer, unpaidStoryteller, paidStoryteller, administrator];

describe("isUserTypeShown", () => {
  it("names the seed's user types", () => {
    expect(USER_TYPES).toEqual({
      unpaidPlayer: -10,
      paidPlayer: -15,
      unpaidStoryteller: -20,
      paidStoryteller: -25,
      administrator: -100,
    });
  });

  it("shows above a type only to the strictly more powerful, which have smaller ids", () => {
    expect(ALL.filter((type) => isUserTypeShown(type, { showAbove: unpaidPlayer }))).toEqual([
      paidPlayer,
      unpaidStoryteller,
      paidStoryteller,
      administrator,
    ]);
  });

  it("shows below a type only to the strictly less powerful", () => {
    expect(ALL.filter((type) => isUserTypeShown(type, { showBelow: administrator }))).toEqual([
      unpaidPlayer,
      paidPlayer,
      unpaidStoryteller,
      paidStoryteller,
    ]);
  });

  it("shows between the two when given both", () => {
    const rule = { showAbove: unpaidPlayer, showBelow: administrator };
    expect(ALL.filter((type) => isUserTypeShown(type, rule))).toEqual([
      paidPlayer,
      unpaidStoryteller,
      paidStoryteller,
    ]);
  });

  it("hides with no rule", () => {
    expect(isUserTypeShown(administrator, {})).toBe(false);
  });
});
