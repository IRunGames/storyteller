import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { statusLabel, type StatusOption } from "@/lib/status";

const { sStatuses, tablesMeta } = schema;

/**
 * The statuses of the workflow mapped to a table, in the order the workflow
 * lists them. Read from the metatables rather than restated in code, so the
 * moves a pill offers are exactly the ones the database's transition trigger
 * will accept, and a workflow edited in a seed is an edit everywhere.
 *
 * Shared by the status pill's action (components/status/actions.ts) and the
 * administrators' Users page, whose rows are not in STATUS_TABLES: this is
 * the query alone, with no gate, so each caller puts its own in front.
 */
export async function listStatusOptions(tableName: string): Promise<StatusOption[]> {
  const rows = await db
    .select({
      key: sStatuses.statusKey,
      description: sStatuses.description,
      from: sStatuses.transitionFromStatusKeys,
    })
    .from(tablesMeta)
    .innerJoin(sStatuses, sql`${sStatuses.idStatusWorkflow} = any(${tablesMeta.idStatusWorkflows})`)
    .where(eq(tablesMeta.tableName, tableName))
    // s_status_id counts down from -1 in the order the seed lists them, so
    // descending is the workflow's own order: the first status first.
    .orderBy(desc(sStatuses.idStatus));

  // status_key is nullable on the metatable but a status without one is not a
  // status; it would only ever be a half-written seed row, so it is left out.
  return rows
    .filter((row): row is typeof row & { key: string } => row.key !== null)
    .map((row) => ({
      key: row.key,
      label: statusLabel(row.key),
      description: row.description,
      from: row.from,
    }));
}
