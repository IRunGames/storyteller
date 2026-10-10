import { describe, it } from "node:test";
import { expect } from "expect";
import { formatDateTime, formatDateTimeUtc, formatDayUtc } from "./dates";

describe("dates", () => {
  const moment = new Date("2026-10-09T15:42:00Z");

  it("writes a day in UTC", () => {
    expect(formatDayUtc(moment)).toBe("Oct 9, 2026");
  });

  it("writes a day and a time in UTC, saying so", () => {
    expect(formatDateTimeUtc(moment)).toBe("Oct 9, 2026, 3:42 PM UTC");
  });

  it("writes a day and a time in the zone it runs in", () => {
    // The zone is the machine's, so only the shape is fixed.
    expect(formatDateTime(moment)).toMatch(/^[A-Z][a-z]{2} \d{1,2}, 2026, \d{1,2}:\d{2}\s[AP]M$/);
  });
});
