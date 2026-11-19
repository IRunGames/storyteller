// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. v_story_scenes and
// v_story_sessions hand callers every column of their table, written out by
// name in db/views. A column added to the table later reaches the view only
// once someone adds it to the view's list and rebuilds it with `just view`,
// and nothing else would notice the gap: Drizzle declares only the columns
// the app reads, so a missing one surfaces as a failed query the day some
// code first asks for it. This compares the catalogs instead, so the gap is
// caught the day the column is added. It reads the catalog only and makes no
// rows.
import { it } from "node:test";
import { expect } from "expect";
import { sql } from "drizzle-orm";
import { describeWithDb } from "@/test/db-suite";

const VIEWS_OF_TABLES = [
  { table: "story_scenes", view: "v_story_scenes" },
  { table: "story_sessions", view: "v_story_sessions" },
];

describeWithDb("views that repeat a table's columns", {}, (suite) => {
  // The columns of a table or view in the schema the connection resolves
  // names in (search_path), in their declared order.
  async function columnsOf(relation: string) {
    const { rows } = await suite.db.execute<{ name: string }>(sql`
      select a.attname as name
      from pg_attribute a
      where a.attrelid = to_regclass(${relation})
        and a.attnum > 0
        and not a.attisdropped
      order by a.attnum`);
    return rows.map((row) => row.name);
  }

  for (const { table, view } of VIEWS_OF_TABLES) {
    it(`${view} carries every column of ${table}`, async () => {
      const tableColumns = await columnsOf(table);
      const viewColumns = await columnsOf(view);
      // A missing table or view would make both lists empty and pass.
      expect(tableColumns.length).toBeGreaterThan(0);
      expect(viewColumns.length).toBeGreaterThan(0);
      const missing = tableColumns.filter((column) => !viewColumns.includes(column));
      expect({ view, missing }).toEqual({ view, missing: [] });
    });
  }
});
