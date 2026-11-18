import { describe, it } from "node:test";
import { expect } from "expect";
import {
  idSchema,
  longTextSchema,
  offsetSchema,
  searchSchema,
  selectIntSchema,
  titleSchema,
} from "./schemas";

const messagesFor = (parsed: { success: boolean; error?: { issues: { message: string }[] } }) =>
  parsed.success ? [] : parsed.error!.issues.map((issue) => issue.message);

describe("idSchema", () => {
  it("accepts any int4, the seeds' negative ids included", () => {
    expect(idSchema.parse(1)).toBe(1);
    expect(idSchema.parse(-2)).toBe(-2);
    expect(idSchema.parse(0)).toBe(0);
    expect(idSchema.parse(2 ** 31 - 1)).toBe(2 ** 31 - 1);
  });

  it("refuses what no id column holds", () => {
    expect(idSchema.safeParse(2 ** 31).success).toBe(false);
    expect(idSchema.safeParse(1.5).success).toBe(false);
    expect(idSchema.safeParse("7").success).toBe(false);
    expect(idSchema.safeParse(null).success).toBe(false);
  });
});

describe("offsetSchema", () => {
  it("is a whole number from zero up", () => {
    expect(offsetSchema.parse(0)).toBe(0);
    expect(offsetSchema.parse(40)).toBe(40);
    expect(offsetSchema.safeParse(-1).success).toBe(false);
    expect(offsetSchema.safeParse(2.5).success).toBe(false);
  });
});

describe("searchSchema", () => {
  it("trims and allows up to 200 characters", () => {
    expect(searchSchema.parse("  docks ")).toBe("docks");
    expect(searchSchema.parse("")).toBe("");
    expect(searchSchema.parse("x".repeat(200))).toHaveLength(200);
    expect(searchSchema.safeParse("x".repeat(201)).success).toBe(false);
  });
});

describe("titleSchema", () => {
  const schema = titleSchema("scene");

  it("trims and wants at least one character, saying what has no title", () => {
    expect(schema.parse("  The docks ")).toBe("The docks");
    expect(messagesFor(schema.safeParse("   "))).toEqual(["Please give the scene a title."]);
  });

  it("allows up to 200 characters", () => {
    expect(schema.parse("x".repeat(200))).toHaveLength(200);
    expect(messagesFor(schema.safeParse("x".repeat(201)))).toEqual([
      "Keep the title under 200 characters.",
    ]);
  });
});

describe("longTextSchema", () => {
  const schema = longTextSchema("notes");

  it("trims, may be empty and allows up to 8000 characters, naming the field", () => {
    expect(schema.parse(" a note ")).toBe("a note");
    expect(schema.parse("")).toBe("");
    expect(schema.parse("x".repeat(8000))).toHaveLength(8000);
    expect(messagesFor(schema.safeParse("x".repeat(8001)))).toEqual([
      "Keep the notes under 8000 characters.",
    ]);
  });
});

describe("selectIntSchema", () => {
  it("reads a <select>'s posted string as an id, and its empty choice as null", () => {
    expect(selectIntSchema.parse("12")).toBe(12);
    expect(selectIntSchema.parse("-26")).toBe(-26);
    expect(selectIntSchema.parse(7)).toBe(7);
    expect(selectIntSchema.parse("")).toBeNull();
    expect(selectIntSchema.parse(null)).toBeNull();
    expect(selectIntSchema.parse(undefined)).toBeNull();
  });

  it("refuses what is neither", () => {
    expect(selectIntSchema.safeParse("abc").success).toBe(false);
    expect(selectIntSchema.safeParse("1.5").success).toBe(false);
  });
});
