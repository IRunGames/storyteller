-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS _seed_begin;

    -- ------------------------------------------------------------
/**
  _seed_begin

  Put a table into the state a seed needs: every foreign key to or from it
  taken off, and its user triggers switched off. _seed_end puts all of it
  back. Putting a foreign key back checks every row it covers, so a seed that
  leaves a dangling reference fails there, inside the same transaction, and
  the database is left as it was.

  This stands in for `SET session_replication_role = 'replica'`, which the
  seeds used before. That setting belongs to the superuser, and Neon, where
  the production database lives, hands out no superuser. Dropping and
  re-creating keys is something the owner of the tables may do anywhere.

  Taking the keys off rather than deferring them matters: a deferred key still
  runs its ON DELETE CASCADE at once, so a seed that clears and re-inserts its
  rows would take every dependent row with it. Without the key nothing
  cascades, and the re-inserted rows, which keep their ids, satisfy the key
  when it returns.

  Both calls must run inside one transaction, which dbmate gives every
  migration. What was dropped is kept in temporary tables that go with the
  transaction, so a seed that fails leaves nothing behind.

  The table is resolved through the session `search_path`, so callers pass a
  bare table name and never a schema specifier.

  Parameters:
    _table_name — table about to be seeded (required).
 */
CREATE OR REPLACE FUNCTION _seed_begin(_table_name VARCHAR)
    RETURNS VOID
    LANGUAGE plpgsql
AS
$function$
DECLARE
    seededTable REGCLASS := to_regclass(_table_name);
    fk          RECORD;
    trg         RECORD;
BEGIN
    IF seededTable IS NULL THEN
        RAISE EXCEPTION '_seed_begin: no table % on the search_path', _table_name;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS _seed_dropped_foreign_keys
    (
        seeded_table    TEXT NOT NULL,
        child_table     TEXT NOT NULL,
        constraint_name TEXT NOT NULL,
        definition      TEXT NOT NULL
    ) ON COMMIT DROP;

    CREATE TEMP TABLE IF NOT EXISTS _seed_disabled_triggers
    (
        seeded_table TEXT NOT NULL,
        trigger_name TEXT NOT NULL,
        was_enabled  CHAR(1) NOT NULL
    ) ON COMMIT DROP;

    -- The temporary tables are addressed through EXECUTE: they are dropped
    -- at commit and made afresh by the next seed, and a plan cached by this
    -- function would otherwise still point at the old one.
    FOR fk IN
        SELECT c.conname,
               c.conrelid::regclass::text AS child_table,
               pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c
        WHERE c.contype = 'f'
          AND (c.conrelid = seededTable OR c.confrelid = seededTable)
        ORDER BY c.conrelid, c.conname
        LOOP
            EXECUTE 'INSERT INTO pg_temp._seed_dropped_foreign_keys VALUES ($1, $2, $3, $4)'
                USING seededTable::text, fk.child_table, fk.conname, fk.definition;
            EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.child_table, fk.conname);
        END LOOP;

    -- Only the triggers that were on come back on; one someone switched off
    -- on purpose stays off.
    FOR trg IN
        SELECT t.tgname, t.tgenabled
        FROM pg_trigger t
        WHERE t.tgrelid = seededTable
          AND NOT t.tgisinternal
        LOOP
            EXECUTE 'INSERT INTO pg_temp._seed_disabled_triggers VALUES ($1, $2, $3)'
                USING seededTable::text, trg.tgname, trg.tgenabled;
        END LOOP;

    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER USER', seededTable);
END;
$function$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

