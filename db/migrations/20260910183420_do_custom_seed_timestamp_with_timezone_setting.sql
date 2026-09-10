-- migrate:up
-- Turn on timestamp-with-time-zone for the metatable machinery, and bring the
-- columns it manages into line with that choice.
--
-- _p_update_tables, _p_update_tables_timestamps, _p_update_tables_archives and
-- _p_update_workflow_columns all read _global_settings.timestamp_with_timezone
-- to decide whether to build `timestamp with time zone` or bare `timestamp`
-- columns. The table was empty, so the setting read NULL and every one of them
-- took the ELSE branch: naive timestamps, contradicting both
-- db/custom/create_auth_tables.sql and apps/web/src/db/schema.ts, which
-- declare `withTimezone: true`.
--
-- The setting alone changes nothing that already exists, so the columns are
-- converted here too. Otherwise they stay naive until someone next runs the
-- procedures, which reconcile a type mismatch by dropping the column and
-- re-adding it.

-- 1. The setting itself.
--
-- Read as value::BOOLEAN, so the string has to be one Postgres accepts.
INSERT INTO _global_settings (key, value)
VALUES ('timestamp_with_timezone', 'true')
ON CONFLICT (key) DO UPDATE
    SET value      = EXCLUDED.value,
        updated_at = NOW();


-- 2. Convert every naive timestamp column in the schema.
--
-- Not just the created_at / updated_at / archived_at columns the metatable
-- builds: business columns written before this convention existed
-- (games.last_played, game_players.joined_at, _global_settings.value_at) are
-- converted too, so "this schema stores timestamps with a time zone" holds
-- without exception rather than only where a procedure happened to reach.
--
-- Matching on type rather than on a list of column names means anything naive
-- added later is caught by a re-run instead of quietly staying behind.
--
-- These tables are empty, so the conversion is a formality; the point is to
-- leave the schema agreeing with the setting rather than waiting for a
-- procedure run to reconcile it.
DO
$$
    DECLARE
        r         RECORD;
        converted INT := 0;
    BEGIN
        FOR r IN
            SELECT c.relname::TEXT AS tbl,
                   a.attname::TEXT AS col
            FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
                     JOIN pg_attribute a ON a.attrelid = c.oid
                         AND a.attnum > 0
                         AND NOT a.attisdropped
            WHERE n.nspname = current_schema()
              AND c.relkind = 'r'
              AND format_type(a.atttypid, NULL) = 'timestamp without time zone'
            ORDER BY 1, 2
            LOOP
                EXECUTE format(
                        'ALTER TABLE %I ALTER COLUMN %I TYPE timestamp with time zone',
                        r.tbl, r.col);
                converted := converted + 1;
            END LOOP;

        RAISE NOTICE 'timestamp_with_timezone: converted % column(s) to timestamptz', converted;
    END
$$;

-- migrate:down

