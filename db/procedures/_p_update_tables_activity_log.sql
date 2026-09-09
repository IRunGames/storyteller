CREATE OR REPLACE PROCEDURE _p_update_tables_activity_log()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Ensures that all tables flagged with `needs_activity_log = TRUE` in the
`_tables` metadata table have an `activity_log` JSONB column that is
NOT NULL with a default of '[]'::jsonb.

- Steps Performed -
1. Iterate through all tables where `needs_activity_log = TRUE`.
2. For each table:
   a. If column does not exist, add it as JSONB NOT NULL DEFAULT '[]'::jsonb.
   b. If column exists, backfill NULLs, then enforce NOT NULL and set default.
3. Update `has_activity_log = TRUE` in `_tables` on success,
   or `FALSE` on failure.
====================================================================
*/
DECLARE
    tbl RECORD;
    column_type TEXT;
BEGIN
    RAISE NOTICE 'Starting procedure "_p_update_tables_activity_log".';

    FOR tbl IN
        SELECT table_name
        FROM _tables
        WHERE needs_activity_log = TRUE
    LOOP
        RAISE NOTICE 'Processing table: %', tbl.table_name;

        BEGIN
            -- Check if activity_log column exists
            SELECT data_type
            INTO column_type
            FROM information_schema.columns
            WHERE table_name = tbl.table_name
              AND column_name = 'activity_log';

            IF column_type IS NULL THEN
                -- Column doesn't exist — add it
                RAISE NOTICE 'Adding activity_log column to table: %', tbl.table_name;
                EXECUTE format(
                    'ALTER TABLE %I ADD COLUMN activity_log JSONB NOT NULL DEFAULT ''[]''::jsonb',
                    tbl.table_name
                );
                RAISE NOTICE 'activity_log column added to table: %', tbl.table_name;
            ELSE
                -- Column exists — backfill NULLs, then ensure NOT NULL + default
                RAISE NOTICE 'activity_log column exists in table: %. Ensuring NOT NULL with default.', tbl.table_name;
                EXECUTE format(
                    'UPDATE %I SET activity_log = ''[]''::jsonb WHERE activity_log IS NULL',
                    tbl.table_name
                );
                EXECUTE format(
                    'ALTER TABLE %I ALTER COLUMN activity_log SET DEFAULT ''[]''::jsonb',
                    tbl.table_name
                );
                EXECUTE format(
                    'ALTER TABLE %I ALTER COLUMN activity_log SET NOT NULL',
                    tbl.table_name
                );
                RAISE NOTICE 'activity_log column updated in table: %', tbl.table_name;
            END IF;

            -- Mark success
            UPDATE _tables
            SET has_activity_log = TRUE,
                updated_at = NOW()
            WHERE table_name = tbl.table_name;
            RAISE NOTICE 'activity_log configured for table: %', tbl.table_name;

        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to configure activity_log for table: %. Error: %', tbl.table_name, SQLERRM;
            UPDATE _tables
            SET has_activity_log = FALSE,
                updated_at = NOW()
            WHERE table_name = tbl.table_name;
        END;
    END LOOP;

    RAISE NOTICE 'Procedure "_p_update_tables_activity_log" completed.';
END $$;
