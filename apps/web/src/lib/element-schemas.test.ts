import { describe, it } from "node:test";
import { expect } from "expect";

import { elementSchema } from "./element-schemas";

const blank = { initialName: "", title: "", description: "", notes: "" };

describe("elementSchema", () => {
  it("trims what was typed and keeps the kind", () => {
    const result = elementSchema.safeParse({
      ...blank,
      kind: "PLACE",
      name: "  The vault  ",
      title: " Under the dun ",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      ...blank,
      kind: "PLACE",
      name: "The vault",
      title: "Under the dun",
    });
  });

  it("refuses an element with no name", () => {
    const result = elementSchema.safeParse({ ...blank, kind: "PERSON", name: "  " });
    expect(result.error?.issues[0].message).toBe("Please give the element a name.");
  });

  it("refuses a kind the enum does not have", () => {
    const result = elementSchema.safeParse({ ...blank, kind: "MONSTER", name: "Grendel" });
    expect(result.error?.issues[0].message).toBe("Choose what kind of element this is.");
  });
});
