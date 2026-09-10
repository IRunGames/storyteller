-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_update_workflow_columns;

    -- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE _p_update_workflow_columns()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Ensures that all tables with a linked status workflow have the appropriate 
status-related timestamp columns for tracking workflow transitions. 
These columns are created dynamically based on the valid statuses defined 
in the s_statuses table.

For workflow with a status column named 'status', the timestamp columns 
will be created as <status>_at (e.g. pending_at). For a custom status 
column like 'processor_status', the '_status' suffix is removed and the 
columns are created as processor_<status>_at (e.g. processor_pending_at).

- Steps Performed -
1. Retrieve the global setting `timestamp_with_timezone` to determine
   the type of timestamp columns.
2. Iterate through all tables listed in _tables with a linked workflow
   in s_status_workflows (using the ANY operator on the workflow IDs array).
3. Retrieve valid statuses for each table's workflow from s_statuses.
4. For each status, determine the appropriate timestamp column name based
   on the workflow’s status column name.
5. Create each missing timestamp column, and convert any existing one whose
   type no longer matches the setting.

- Note -
The setting is honoured on every run, not only when a column is first
created: flipping `timestamp_with_timezone` and re-running converts the
existing status timestamps to match. The conversion is done in place with
ALTER COLUMN ... TYPE, so the recorded times survive it -- unlike the
drop-and-recreate the sibling procedures still use.
====================================================================
*/
DECLARE
    tbl RECORD;
    valid_statuses TEXT[];
    status TEXT;
    existing_type TEXT;
    use_timestamp_with_timezone BOOLEAN;
    column_definition TEXT;
    status_prefix TEXT;
    timestamp_column_name TEXT;
BEGIN
    -- Retrieve the `use_timestamp_with_timezone` setting.
    SELECT value::BOOLEAN
    INTO use_timestamp_with_timezone
    FROM _global_settings
    WHERE key = 'timestamp_with_timezone';

    -- Determine the column definition based on the setting.
    -- The bare type, spelled the way Postgres reports it: it is now compared
    -- against a column's actual type, not just interpolated into ADD COLUMN,
    -- and the short form 'timestamp' never equals the reported 'timestamp
    -- without time zone'. DEFAULT NULL is applied at the ADD COLUMN below.
    IF use_timestamp_with_timezone THEN
        column_definition := 'timestamp with time zone';
    ELSE
        column_definition := 'timestamp without time zone';
    END IF;

    -- Loop through all tables with a linked status workflow.
    FOR tbl IN
        SELECT t.table_name, w.s_status_workflow_id, w.status_column_name
        FROM _tables t
        JOIN s_status_workflows w 
          ON w.s_status_workflow_id = ANY(t.s_status_workflow_ids)
    LOOP
        RAISE NOTICE 'Processing columns for table: %', tbl.table_name;

        -- Retrieve valid statuses for the workflow linked to the table.
        SELECT ARRAY_AGG(s.status_key)
        INTO valid_statuses
        FROM s_statuses s
        WHERE s.s_status_workflow_id = tbl.s_status_workflow_id;

        IF valid_statuses IS NULL OR array_length(valid_statuses, 1) IS NULL THEN
            RAISE NOTICE 'No valid statuses found for workflow ID: %', tbl.s_status_workflow_id;
            CONTINUE;
        END IF;

        -- Determine the prefix for timestamp columns based on the workflow's status column.
        IF lower(COALESCE(tbl.status_column_name, 'status')) = 'status' THEN
            status_prefix := '';
        ELSE
            -- Remove trailing '_status' and add an underscore.
            status_prefix := regexp_replace(lower(tbl.status_column_name), '_status$', '') || '_';
        END IF;

        -- Loop through each status to check or create the associated timestamp column.
        FOR status IN SELECT UNNEST(valid_statuses)
        LOOP
            IF status_prefix = '' THEN
                timestamp_column_name := LOWER(status) || '_at';
            ELSE
                timestamp_column_name := status_prefix || LOWER(status) || '_at';
            END IF;
            RAISE NOTICE 'Checking for column: % in table %', timestamp_column_name, tbl.table_name;

            -- One lookup answers both questions: NULL means the column is
            -- absent, anything else is its current type. Resolves through
            -- search_path, unlike the bare information_schema query this
            -- replaced, which matched on table_name across every schema.
            existing_type := _column_data_type(tbl.table_name, timestamp_column_name);

            IF existing_type IS NULL THEN
                RAISE NOTICE 'Adding column: % to table %', timestamp_column_name, tbl.table_name;
                EXECUTE format(
                    'ALTER TABLE %I ADD COLUMN %I %s DEFAULT NULL',
                    tbl.table_name, timestamp_column_name, column_definition
                );
                RAISE NOTICE 'Column % added to table %', timestamp_column_name, tbl.table_name;

            ELSIF existing_type <> column_definition THEN
                -- The setting has changed since the column was built. Convert
                -- in place rather than dropping and re-adding: these columns
                -- record when a row entered a status, and that history is not
                -- reconstructable once discarded.
                --
                -- `AT TIME ZONE 'UTC'` converts in whichever direction is
                -- needed -- it reads a naive timestamp as UTC, and renders an
                -- aware one as UTC -- so one expression serves both flips.
                RAISE NOTICE 'Column % in table % is %; converting to %.',
                    timestamp_column_name, tbl.table_name, existing_type, column_definition;
                EXECUTE format(
                    'ALTER TABLE %I ALTER COLUMN %I TYPE %s USING %I AT TIME ZONE ''UTC''',
                    tbl.table_name, timestamp_column_name, column_definition, timestamp_column_name
                );
                RAISE NOTICE 'Column % converted in table %', timestamp_column_name, tbl.table_name;

            ELSE
                RAISE NOTICE 'Column % already exists with the correct type in table %',
                    timestamp_column_name, tbl.table_name;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Workflow columns updated successfully.';
END $$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

