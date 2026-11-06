import { describe, it } from "node:test";
import { expect } from "expect";
import { systemFieldsSchema } from "./system-schemas";

describe("systemFieldsSchema", () => {
  it("trims every field, and makes an empty version or variant null", () => {
    expect(
      systemFieldsSchema.parse({
        systemName: " Cypher System ",
        systemVersion: "  ",
        variant: " ",
      }),
    ).toEqual({ systemName: "Cypher System", systemVersion: null, variant: null });
    expect(
      systemFieldsSchema.parse({
        systemName: "Cypher System",
        systemVersion: "Revised",
        variant: "Numenera",
      }),
    ).toEqual({ systemName: "Cypher System", systemVersion: "Revised", variant: "Numenera" });
  });

  it("takes null for a version or variant, which is what the dialog posts for a blank", () => {
    expect(
      systemFieldsSchema.parse({ systemName: "Cypher System", systemVersion: null, variant: null }),
    ).toEqual({ systemName: "Cypher System", systemVersion: null, variant: null });
  });

  it("asks for a name, and keeps each field under 120 characters", () => {
    const blank = systemFieldsSchema.safeParse({
      systemName: "  ",
      systemVersion: "",
      variant: "",
    });
    expect(blank.success).toBe(false);
    expect(blank.error?.issues[0].path).toEqual(["systemName"]);
    expect(blank.error?.issues[0].message).toBe("Please enter a name.");

    const long = systemFieldsSchema.safeParse({
      systemName: "x".repeat(121),
      systemVersion: "",
      variant: "",
    });
    expect(long.error?.issues[0].message).toBe("Keep the name under 120 characters.");
    const longVariant = systemFieldsSchema.safeParse({
      systemName: "x",
      systemVersion: "",
      variant: "x".repeat(121),
    });
    expect(longVariant.error?.issues[0].message).toBe("Keep the variant under 120 characters.");
  });
});
