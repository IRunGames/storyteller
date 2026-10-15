import { describe, it } from "node:test";
import { expect } from "expect";

import { elementSchema } from "./element-schemas";

const blank = { initialName: "", title: "", description: "", notes: "", url: "", urlText: "" };

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

  it("takes a web address as the link, or nothing, and refuses anything else", () => {
    const parse = (url: string) =>
      elementSchema.safeParse({ ...blank, kind: "THING", name: "The blade", url });
    expect(parse(" https://example.com/blade ").data?.url).toBe("https://example.com/blade");
    expect(parse("").success).toBe(true);
    for (const bad of ["example.com/blade", "javascript:alert(1)", "not a url"]) {
      expect(parse(bad).error?.issues[0].message).toBe(
        "Please enter a full web address, starting with http:// or https://.",
      );
    }
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
