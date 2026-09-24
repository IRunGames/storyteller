import { describe, it } from "node:test";
import { expect } from "expect";

import { toCurrentUser } from "./current-user";

describe("toCurrentUser", () => {
  it("keeps only the fields a page may show and drops the rest of the row", () => {
    const row = {
      id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
      name: "Paul Stafford",
      email: "storyteller@irun.games",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      nickName: "Gandalf",
      lastLogin: new Date(),
      hoursPlayed: 12,
      idUserType: -1,
      tags: null,
      isActive: true,
      searchText: "Paul Stafford storyteller@irun.games Gandalf",
    };

    expect(toCurrentUser(row)).toEqual({
      id: "01a0b60c-8938-7a0d-ab2b-34e12ce284c9",
      name: "Paul Stafford",
      email: "storyteller@irun.games",
      image: null,
      nickName: "Gandalf",
    });
  });
});
