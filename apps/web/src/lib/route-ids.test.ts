import { describe, it } from "node:test";
import { expect } from "expect";
import { parseRouteId } from "./route-ids";

describe("parseRouteId", () => {
  it("returns the number for plain decimal ids, signed or not, inside the int4 range", () => {
    expect(parseRouteId("42")).toBe(42);
    expect(parseRouteId("-5")).toBe(-5);
    expect(parseRouteId("0")).toBe(0);
    expect(parseRouteId("2147483647")).toBe(2147483647);
    expect(parseRouteId("-2147483648")).toBe(-2147483648);
  });

  it("returns null outside the int4 range, where a query would fail instead of finding no row", () => {
    expect(parseRouteId("2147483648")).toBeNull();
    expect(parseRouteId("-2147483649")).toBeNull();
  });

  it("returns null for anything Number() would read as a number but is not plain decimal digits", () => {
    for (const raw of ["0x2a", "1e3", " 4 ", "4 ", "+4", "04", "-0", "4.0", "Infinity"]) {
      expect(parseRouteId(raw)).toBeNull();
    }
  });

  it("returns null for what is not a number at all", () => {
    for (const raw of ["", "-", "abc"]) {
      expect(parseRouteId(raw)).toBeNull();
    }
  });
});
