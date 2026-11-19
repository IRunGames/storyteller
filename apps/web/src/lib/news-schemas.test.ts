import { describe, it } from "node:test";
import { expect } from "expect";

import { newsEditSchema, newsSchema, startOfUtcDay, utcDayOf } from "./news-schemas";

const item = {
  title: "  Maps come to the table  ",
  body: "Draw on a picture before the players see it.",
  startsOn: "2026-11-19",
  expiresOn: "",
};

function errorsOf(input: unknown) {
  const parsed = newsSchema.safeParse(input);
  if (parsed.success) return {};
  return Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("newsSchema", () => {
  it("takes an item that never expires, trimmed", () => {
    expect(newsSchema.parse(item)).toEqual({ ...item, title: "Maps come to the table" });
  });

  it("takes an expiry day after the start day", () => {
    expect(newsSchema.safeParse({ ...item, expiresOn: "2026-11-20" }).success).toBe(true);
  });

  it("refuses an expiry day on or before the start day, on the expiry", () => {
    expect(errorsOf({ ...item, expiresOn: "2026-11-19" })).toEqual({
      expiresOn: "Pick a day after it starts.",
    });
    expect(errorsOf({ ...item, expiresOn: "2026-11-01" })).toEqual({
      expiresOn: "Pick a day after it starts.",
    });
  });

  it("asks for a title, the news and a start day", () => {
    expect(errorsOf({ ...item, title: " ", body: "", startsOn: "" })).toEqual({
      title: "Please give the news item a title.",
      body: "Please write the news.",
      startsOn: "Pick a day.",
    });
  });

  it("refuses a day that is not one", () => {
    expect(errorsOf({ ...item, startsOn: "2026-02-31" })).toEqual({ startsOn: "Pick a day." });
  });
});

describe("newsEditSchema", () => {
  it("takes the archive switch with the fields", () => {
    expect(newsEditSchema.parse({ ...item, archived: true })).toEqual({
      ...item,
      title: "Maps come to the table",
      archived: true,
    });
  });

  it("asks for the switch", () => {
    const parsed = newsEditSchema.safeParse(item);
    expect(parsed.error?.issues.map((i) => i.path.join("."))).toEqual(["archived"]);
  });

  it("keeps the check on the days", () => {
    const parsed = newsEditSchema.safeParse({ ...item, archived: false, expiresOn: "2026-11-01" });
    expect(parsed.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["expiresOn", "Pick a day after it starts."],
    ]);
  });
});

describe("news days", () => {
  it("are UTC days, a day standing for its first moment", () => {
    expect(startOfUtcDay("2026-11-19").toISOString()).toBe("2026-11-19T00:00:00.000Z");
    expect(utcDayOf(new Date("2026-11-19T23:30:00-05:00"))).toBe("2026-11-20");
  });
});
