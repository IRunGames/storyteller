import { describe, it } from "node:test";
import { expect } from "expect";

import { defaultUserListQuery, userListQuerySchema } from "./user-list-schemas";

describe("userListQuerySchema", () => {
  it("accepts the query the page opens with", () => {
    expect(userListQuerySchema.safeParse(defaultUserListQuery([-1, 2147483647])).success).toBe(
      true,
    );
  });

  it("refuses a user type id outside the int4 range, which the column could not hold", () => {
    for (const idUserType of [2147483648, -2147483649]) {
      expect(userListQuerySchema.safeParse(defaultUserListQuery([idUserType])).success).toBe(false);
    }
  });

  it("refuses a user type id that is not a whole number", () => {
    expect(userListQuerySchema.safeParse(defaultUserListQuery([1.5])).success).toBe(false);
  });
});
