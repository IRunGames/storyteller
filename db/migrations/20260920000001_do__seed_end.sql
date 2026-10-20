-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS _seed_end;

    -- ------------------------------------------------------------
/**
  _seed_end

  Undo _seed_begin for a table: its user triggers back as they were, and
  every foreign key _seed_begin took off re-created from its stored
  definition. Re-creating a key checks every row it covers, so this is where
  a seed with a dangling reference fails. The error names the key; the
  transaction rolls back with it.

  Must run in the same transaction as the matching _seed_begin, and raises if
  it cannot find one.

  Parameters:
    _table_name — the table that was seeded (required).
 */
CREATE OR REPLACE FUNCTION _seed_end(_table_name VARCHAR)
    RETURNS VOID
    LANGUAGE plpgsql
AS
$function$
DECLARE
    seededTable REGCLASS := to_regclass(_table_name);
    fk          RECORD;
    trg         RECORD;
    restored    INT     := 0;
BEGIN
    IF seededTable IS NULL THEN
        RAISE EXCEPTION '_seed_end: no table % on the search_path', _table_name;
    END IF;
    IF to_regclass('pg_temp._seed_dropped_foreign_keys') IS NULL THEN
        RAISE EXCEPTION '_seed_end(%): no _seed_begin ran in this transaction', _table_name;
    END IF;

    FOR trg IN EXECUTE
        'SELECT trigger_name, was_enabled FROM pg_temp._seed_disabled_triggers WHERE seeded_table = $1'
        USING seededTable::text
        LOOP
            EXECUTE format('ALTER TABLE %s %s TRIGGER %I', seededTable,
                           CASE trg.was_enabled
                               WHEN 'O' THEN 'ENABLE'
                               WHEN 'A' THEN 'ENABLE ALWAYS'
                               WHEN 'R' THEN 'ENABLE REPLICA'
                               ELSE 'DISABLE'
                           END,
                           trg.trigger_name);
        END LOOP;
    EXECUTE 'DELETE FROM pg_temp._seed_disabled_triggers WHERE seeded_table = $1'
        USING seededTable::text;

    FOR fk IN EXECUTE
        'SELECT child_table, constraint_name, definition FROM pg_temp._seed_dropped_foreign_keys
         WHERE seeded_table = $1 ORDER BY child_table, constraint_name'
        USING seededTable::text
        LOOP
            EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',
                           fk.child_table, fk.constraint_name, fk.definition);
            restored := restored + 1;
        END LOOP;
    EXECUTE 'DELETE FROM pg_temp._seed_dropped_foreign_keys WHERE seeded_table = $1'
        USING seededTable::text;

    RAISE NOTICE '_seed_end(%): % foreign key(s) back and checked', _table_name, restored;
END;
$function$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

