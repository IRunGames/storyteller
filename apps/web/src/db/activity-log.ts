import { sql } from "drizzle-orm";
import { db } from "./index";

/** Anything that can run raw SQL: the pool, or the transaction a caller is already inside. */
type Executor = Pick<typeof db, "execute">;

/** One entry for a row's activity_log, as _append_activity_log takes it. */
export type ActivityEntry = {
  /** The table whose row is logged, bare, as the database names it: "story_sessions". */
  table: string;
  recordId: number;
  /** What kind of entry: "inactivity_log", "untap_log", "notes_change_log". */
  category: string;
  details: string;
  /** Where it came from, for a reader of the log: "run table", "play pill". */
  source: string;
  userId: string;
  /** Anything more the entry carries, stored as jsonb. */
  data?: Record<string, unknown>;
};

/**
 * Appends an entry to a row's activity_log through the database's own
 * _append_activity_log, which reads and rewrites the column by the row's
 * primary key and looks the user's name up itself. The status triggers log
 * a move on their own but say nothing of who or why, so an action that
 * wants that said appends its own entry, in the same transaction as the
 * change it describes. Three actions used to write this call out by hand.
 */
export async function appendActivityLog(
  entry: ActivityEntry,
  executor: Executor = db,
): Promise<void> {
  await executor.execute(sql`
    select _append_activity_log(
      table_name := ${entry.table},
      field_name := 'activity_log',
      record_id := ${String(entry.recordId)},
      activity_category := ${entry.category},
      activity_details := ${entry.details},
      activity_source := ${entry.source},
      user_id := ${entry.userId},
      activity_data := ${JSON.stringify(entry.data ?? {})}::jsonb
    )
  `);
}
