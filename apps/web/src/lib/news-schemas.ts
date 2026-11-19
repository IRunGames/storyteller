import { z } from "zod";
import { longTextSchema, titleSchema } from "@/lib/schemas";

// A news item's days are UTC days: the home page's card prints its day with
// formatDayUtc, so the form, the table and the card all name the same day
// whichever zone the administrator is in. A day stands for its first
// moment, so an item starting today is live at once and one expiring on a
// day is gone for all of that day.

/** The yyyy-mm-dd a date input holds, for the UTC day this moment falls on. */
export function utcDayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The first moment of a yyyy-mm-dd UTC day. */
export function startOfUtcDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/**
 * The News page's New news item dialog. The expiry day may be left empty for
 * an item that never lapses; when given it must come after the start day,
 * which is the table's own CHECK said where the form can show it.
 */
export const newsSchema = z
  .object({
    title: titleSchema("news item"),
    body: longTextSchema("news").min(1, "Please write the news."),
    startsOn: z.iso.date("Pick a day."),
    expiresOn: z.union([z.literal(""), z.iso.date("Pick a day, or leave it empty.")]),
  })
  .refine((news) => news.expiresOn === "" || news.expiresOn > news.startsOn, {
    path: ["expiresOn"],
    message: "Pick a day after it starts.",
  });

/**
 * The Edit dialog: the same fields and the same check on the days, and the
 * switch that archives the item or restores it. A new item has no switch,
 * since nothing is posted archived.
 */
export const newsEditSchema = newsSchema.extend({ archived: z.boolean() });
export type NewsEditInput = z.input<typeof newsEditSchema>;
export type NewsEditValues = z.infer<typeof newsEditSchema>;
