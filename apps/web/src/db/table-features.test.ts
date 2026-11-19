// Integration test against the real database, skipped when DATABASE_URL is
// unset so `just test` stays green offline. The system-fields feature of the
// _tables metatable is three columns, system_by, system_at and system_id:
// _p_set_and_update_table_features's p_system_fields switch declares it,
// _p_update_tables_system_fields adds the columns, and _p_update_tables
// recognises them on every later run. Each test builds a throwaway table and
// runs the procedures inside a transaction it then rolls back, so neither the
// table nor the _tables rows and action logs the procedures write outlive it.
import { it } from "node:test";
import { expect } from "expect";
import { sql } from "drizzle-orm";
import { describeWithDb, type Db } from "@/test/db-suite";

const PROBE = "system_fields_probe";

// Thrown once a test has made its assertions, to roll back what it built.
const ROLLBACK = new Error("rollback");

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type SystemColumn = { name: string; type: string; notNull: boolean; hasDefault: boolean };

describeWithDb("the system-fields table feature", {}, (suite) => {
  async function rolledBack(work: (tx: Tx) => Promise<void>) {
    try {
      await suite.db.transaction(async (tx) => {
        await work(tx);
        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }
  }

  async function systemColumns(tx: Tx) {
    const { rows } = await tx.execute<SystemColumn>(sql`
      select a.attname as name,
             format_type(a.atttypid, a.atttypmod) as type,
             a.attnotnull as "notNull",
             a.atthasdef as "hasDefault"
      from pg_attribute a
      where a.attrelid = to_regclass(${PROBE})
        and a.attname in ('system_by', 'system_at', 'system_id')
        and not a.attisdropped
      order by a.attname`);
    return rows;
  }

  async function flags(tx: Tx) {
    const { rows } = await tx.execute<{ needs: boolean; has: boolean }>(sql`
      select needs_system_fields as needs, has_system_fields as has
      from _tables
      where table_name = ${PROBE}`);
    return rows[0];
  }

  // system_at follows the same setting as created_at and updated_at.
  async function timestampType(tx: Tx) {
    const { rows } = await tx.execute<{ withZone: boolean | null }>(sql`
      select value::boolean as "withZone"
      from _global_settings
      where key = 'timestamp_with_timezone'`);
    return rows[0]?.withZone ? "timestamp with time zone" : "timestamp without time zone";
  }

  it("adds the three columns, nullable with no default, when a table declares p_system_fields", async () => {
    await rolledBack(async (tx) => {
      await tx.execute(sql.raw(`create table ${PROBE} (id serial primary key, name text)`));
      await tx.execute(
        sql.raw(`call _p_set_and_update_table_features('${PROBE}', p_system_fields := true)`),
      );

      expect(await systemColumns(tx)).toEqual([
        { name: "system_at", type: await timestampType(tx), notNull: false, hasDefault: false },
        { name: "system_by", type: "text", notNull: false, hasDefault: false },
        { name: "system_id", type: "integer", notNull: false, hasDefault: false },
      ]);
      expect(await flags(tx)).toEqual({ needs: true, has: true });

      // Every later migration runs _p_update_tables, which must still see them.
      await tx.execute(sql`call _p_update_tables()`);
      expect(await flags(tx)).toEqual({ needs: true, has: true });
    });
  });

  it("recognises a table that already has the columns, with system_id an integer", async () => {
    await rolledBack(async (tx) => {
      await tx.execute(
        sql.raw(`create table ${PROBE} (
          id serial primary key,
          system_by text,
          system_at ${await timestampType(tx)},
          system_id integer)`),
      );
      await tx.execute(sql`call _p_update_tables()`);
      expect(await flags(tx)).toEqual({ needs: true, has: true });
    });
  });

  it("leaves a system column of another type and its values alone, and does not mark the table", async () => {
    await rolledBack(async (tx) => {
      await tx.execute(sql.raw(`create table ${PROBE} (id serial primary key, system_id bigint)`));
      await tx.execute(sql.raw(`insert into ${PROBE} (system_id) values (7)`));
      await tx.execute(
        sql.raw(`call _p_set_and_update_table_features('${PROBE}', p_system_fields := true)`),
      );

      expect(await systemColumns(tx)).toEqual([
        { name: "system_id", type: "bigint", notNull: false, hasDefault: false },
      ]);
      const { rows } = await tx.execute<{ systemId: string }>(
        sql.raw(`select system_id as "systemId" from ${PROBE}`),
      );
      expect(rows).toEqual([{ systemId: "7" }]);
      expect(await flags(tx)).toEqual({ needs: true, has: false });
    });
  });
});
