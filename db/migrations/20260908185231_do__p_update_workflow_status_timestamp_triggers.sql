-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_update_workflow_status_timestamp_triggers;

    -- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE _p_update_workflow_status_timestamp_triggers()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Attaches a BEFORE INSERT OR UPDATE trigger to all tables associated 
with a status workflow. The trigger automatically updates the 
appropriate timestamp column (e.g., pending_at or processor_pending_at) 
whenever the workflow’s designated status column changes or is initially set.

- Steps Performed -
1. Iterate through all tables in _tables with a linked workflow in 
   s_status_workflows (using the ANY operator on the workflow IDs array).
2. Retrieve valid statuses for each table's workflow from s_statuses.
3. Dynamically generate a CASE statement to update each status-specific 
   timestamp column.
4. Drop existing trigger functions and triggers if they exist.
5. Create a new trigger function that checks the designated status 
   column for changes and applies the CASE logic.
6. Attach a BEFORE INSERT OR UPDATE trigger to the table.
====================================================================
*/
DECLARE
    tbl RECORD;
    valid_statuses TEXT[];
    dynamic_case_statements TEXT;
    status TEXT;
    status_column TEXT;
    ts_prefix TEXT;
    ts_column_name TEXT;
    function_name TEXT;
    trigger_name TEXT;
BEGIN
    RAISE NOTICE 'Procedure "_p_update_workflow_status_timestamp_triggers" started.';

    FOR tbl IN
        SELECT 
            t.table_name, 
            w.s_status_workflow_id, 
            COALESCE(w.status_column_name, 'status') AS status_column
        FROM _tables t
        JOIN s_status_workflows w 
          ON w.s_status_workflow_id = ANY(t.s_status_workflow_ids)
    LOOP
        RAISE NOTICE 'Processing table: %', tbl.table_name;

        -- Retrieve valid statuses for the workflow.
        SELECT ARRAY_AGG(s.status_key)
        INTO valid_statuses
        FROM s_statuses s
        WHERE s.s_status_workflow_id = tbl.s_status_workflow_id;

        RAISE NOTICE 'Valid statuses for table %: %', tbl.table_name, array_to_string(valid_statuses, ', ');

        -- Use the workflow's status column for checking changes.
        status_column := tbl.status_column;
        
        -- Build unique function and trigger names using the full status column name.
        function_name := format('tr_update_%I_%I_timestamps', tbl.table_name, lower(status_column));
        trigger_name  := format('tr_biu_update_%I_%I_timestamps', tbl.table_name, lower(status_column));

        -- Compute prefix for timestamp columns:
        -- If the status column is 'status', use no prefix; otherwise, remove the trailing '_status'.
        IF lower(status_column) = 'status' THEN
            ts_prefix := '';
        ELSE
            ts_prefix := regexp_replace(lower(status_column), '_status$', '') || '_';
        END IF;

        -- Generate dynamic CASE statements for each valid status.
        dynamic_case_statements := '';
        FOREACH status IN ARRAY valid_statuses LOOP
            IF ts_prefix = '' THEN
                ts_column_name := lower(status) || '_at';
            ELSE
                ts_column_name := ts_prefix || lower(status) || '_at';
            END IF;
            dynamic_case_statements := dynamic_case_statements || format(
                'WHEN %L THEN NEW.%I := NOW(); ',
                status, ts_column_name
            );
        END LOOP;
        RAISE NOTICE 'Generated CASE statements for table %: %', tbl.table_name, dynamic_case_statements;

        -- Drop existing trigger function if it exists.
        RAISE NOTICE 'Dropping existing trigger function % if it exists.', function_name;
        EXECUTE format(
            'DROP FUNCTION IF EXISTS %I() CASCADE',
            function_name
        );

        -- Create the trigger function dynamically, using the designated status column.
        RAISE NOTICE 'Creating trigger function % for table %.', function_name, tbl.table_name;
        EXECUTE format($f$
            CREATE OR REPLACE FUNCTION %I()
            RETURNS TRIGGER AS $BODY$
            BEGIN
                IF OLD.%I IS DISTINCT FROM NEW.%I OR OLD.%I IS NULL THEN
                    CASE NEW.%I
                        %s
                        ELSE NULL;
                    END CASE;
                END IF;
                RETURN NEW;
            END;
            $BODY$ LANGUAGE plpgsql;
        $f$,
            function_name,
            status_column, status_column, status_column,
            status_column,
            dynamic_case_statements
        );
        RAISE NOTICE 'Trigger function % created for table %.', function_name, tbl.table_name;

        -- Drop existing trigger if it exists.
        RAISE NOTICE 'Dropping existing trigger % on table % if it exists.', trigger_name, tbl.table_name;
        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON %I',
            trigger_name,
            tbl.table_name
        );

        -- Attach the trigger to the table.
        RAISE NOTICE 'Attaching trigger % to table %.', trigger_name, tbl.table_name;
        EXECUTE format(
            'CREATE TRIGGER %I
             BEFORE INSERT OR UPDATE ON %I
             FOR EACH ROW
             EXECUTE FUNCTION %I()',
            trigger_name,
            tbl.table_name,
            function_name
        );
        RAISE NOTICE 'Trigger % attached to table %.', trigger_name, tbl.table_name;
    END LOOP;

    RAISE NOTICE 'Procedure "_p_update_workflow_status_timestamp_triggers" completed successfully.';
END $$;    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

-- NOPE / Optional! ------------------------------------------------------------

