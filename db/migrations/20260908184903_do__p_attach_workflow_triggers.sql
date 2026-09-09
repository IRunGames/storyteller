-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_attach_workflow_triggers;

    -- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE _p_attach_workflow_triggers()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Attaches workflow-specific triggers to tables based on the 
`workflow_trigger` column in the `s_status_workflows` table. For each 
linked workflow, the trigger is attached to fire on changes to the 
workflow’s designated status column (e.g. "status" or "processor_status").
If a valid trigger function exists, it is ensured that the trigger is 
attached to the table for handling workflow-specific logic.

- Steps Performed -
1. Iterate through all unique table and workflow combinations from 
   `_tables` and `s_status_workflows` (using the ANY operator on the workflow IDs array).
2. Retrieve the workflow’s trigger function and status column name 
   (defaulting to 'status').
3. Check if the specified trigger function exists in the database.
4. Verify if a trigger with the name <status_column>_workflow_<workflow_function> is already attached to the table.
5. If the trigger does not exist, create it to fire on `BEFORE UPDATE` events 
   when the designated status column changes.
====================================================================
*/
DECLARE
    tbl RECORD;
    workflow_function_exists BOOLEAN;
    trigger_exists BOOLEAN;
    workflow_function TEXT;
    trigger_name TEXT;
    status_column TEXT;
BEGIN
    RAISE NOTICE 'Starting workflow trigger validation and creation process...';

    FOR tbl IN
        SELECT 
        t.table_name, 
        w.workflow_trigger,
        COALESCE(w.status_column_name, 'status') AS status_column
        FROM _tables t
        JOIN s_status_workflows w 
        ON w.s_status_workflow_id = ANY(t.s_status_workflow_ids)
        WHERE w.workflow_trigger IS NOT NULL
    LOOP
        RAISE NOTICE '--------------------------------------';
        RAISE NOTICE 'Processing Table: %', tbl.table_name;

        workflow_function := tbl.workflow_trigger;
        status_column := tbl.status_column;

        -- Build the trigger name using the workflow trigger and full status column name.
        trigger_name := format('%s_workflow_%s', status_column, workflow_function);

        RAISE NOTICE 'Workflow Trigger Function: %', workflow_function;
        RAISE NOTICE 'Status Column: %', status_column;
        RAISE NOTICE 'Trigger Name: %', trigger_name;

        -- Check if the workflow function exists.
        SELECT EXISTS (
            SELECT 1
            FROM pg_proc
            WHERE LOWER(proname) = LOWER(workflow_function)
        ) INTO workflow_function_exists;

        IF NOT workflow_function_exists THEN
            RAISE NOTICE 'Function "%s" does NOT exist.', workflow_function;
            RAISE NOTICE 'Skipping trigger creation for table: %', tbl.table_name;
            RAISE NOTICE '--------------------------------------';
            CONTINUE;
        END IF;

        RAISE NOTICE 'Function "%s" exists.', workflow_function;
        RAISE NOTICE 'Checking for trigger "%s" on table "%s"...', trigger_name, tbl.table_name;

        -- Check if the trigger already exists.
        SELECT EXISTS (
            SELECT 1
            FROM pg_trigger
            WHERE tgname = trigger_name
              AND tgrelid = (SELECT oid FROM pg_class WHERE relname = tbl.table_name)
        ) INTO trigger_exists;

        IF trigger_exists THEN
            RAISE NOTICE 'Trigger "%s" already exists on table "%s".', trigger_name, tbl.table_name;
            RAISE NOTICE 'No action needed.';
        ELSE
            RAISE NOTICE 'Trigger "%s" does NOT exist on table "%s".', trigger_name, tbl.table_name;
            RAISE NOTICE 'Creating trigger...';

            EXECUTE format(
                'CREATE TRIGGER %I
                 BEFORE UPDATE ON %I
                 FOR EACH ROW
                 WHEN (OLD.%I IS DISTINCT FROM NEW.%I)
                 EXECUTE FUNCTION %I()',
                trigger_name,
                tbl.table_name,
                status_column,
                status_column,
                workflow_function
            );

            RAISE NOTICE 'Successfully created trigger "%s" on table "%s".', trigger_name, tbl.table_name;
        END IF;

        RAISE NOTICE '--------------------------------------';
    END LOOP;

    RAISE NOTICE '--------------------------------------';
    RAISE NOTICE 'Workflow trigger validation and creation process completed successfully.';
END $$;    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

-- NOPE / Optional! ------------------------------------------------------------

