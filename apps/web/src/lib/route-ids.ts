import { z } from "zod";

const idSchema = z.int32();

// The id a page reads from its URL, or null for the not-found page. A page
// calls it as `const idStory = parseRouteId(id); if (idStory === null) notFound();`.
//
// Number() alone would also accept "0x2a", "1e3", " 4 " and "Infinity", each of
// which is a different URL for the same row, so only 0 or an optional minus
// sign followed by digits with no leading zero gets as far as Number(). The
// range check is there because an id outside int4 is a query error rather than
// a missing row: the page would throw instead of showing the not-found page.
// z.int32() is exactly int4, the range of every id column, so the range lives
// in Zod and not in a pattern of our own.
export function parseRouteId(raw: string): number | null {
  if (!/^(0|-?[1-9]\d*)$/.test(raw)) return null;
  const parsed = idSchema.safeParse(Number(raw));
  return parsed.success ? parsed.data : null;
}
