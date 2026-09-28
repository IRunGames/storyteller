-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_update_workflow_constraints;

    -- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE _p_update_workflow_constraints()
    LANGUAGE plpgsql
AS
$$
/*
====================================================================
- Description -
Ensures that every table with a linked status workflow has a `CHECK`
constraint on its `status` column. This constraint validates that
the status can only take on values defined in the `s_statuses` table
for the associated workflow.

- Steps Performed -
1. Iterate through all tables listed in `_tables` with a linked workflow
   in `s_status_workflows`.
2. Retrieve valid statuses for each table's workflow from `s_statuses`.
3. Drop any existing `CHECK` constraints on the `status` column.
4. Add a new `CHECK` constraint that ensures the `status` column only
   accepts valid statuses for the associated workflow.
====================================================================
*/
DECLARE
    tbl RECORD;
    valid_statuses TEXT[];
    def_before TEXT;
    def_after TEXT;
    status_column TEXT;
    status_column_constraint TEXT;
BEGIN
    RAISE NOTICE 'Starting procedure "_update_workflow_constraints".';

    FOR tbl IN
        SELECT t.table_name, w.status_column_name, w.s_status_workflow_id
        FROM _tables t
        JOIN s_status_workflows w ON w.s_status_workflow_id = ANY(t.s_status_workflow_ids)
        WHERE w.status_column_name IS NOT NULL
    LOOP
        RAISE NOTICE 'Processing table: %', tbl.table_name;

      BEGIN
        -- Retrieve valid statuses for the table's workflow
        SELECT ARRAY_AGG(s.status_key)
        INTO valid_statuses
        FROM s_statuses s
        WHERE s.s_status_workflow_id = tbl.s_status_workflow_id;

        IF valid_statuses IS NULL OR array_length(valid_statuses, 1) IS NULL THEN
            RAISE NOTICE 'No valid statuses found for workflow ID: %', tbl.s_status_workflow_id;
            CONTINUE;
        END IF;

        RAISE NOTICE 'Valid statuses for table %: %', tbl.table_name, array_to_string(valid_statuses, ', ');

        -- Define the status column and the name of the CHECK constraint
        status_column := COALESCE(tbl.status_column_name, 'status');
        status_column_constraint := format('%I_%I_check', tbl.table_name, status_column);

        RAISE NOTICE 'Ensuring constraint "%s" on table "%s".', status_column_constraint, tbl.table_name;

        -- The constraint is dropped and re-added on every run, so its
        -- definition is captured first and compared afterwards. Re-adding an
        -- identical CHECK is not a change and must not be logged.
        SELECT pg_get_constraintdef(c.oid)
        INTO def_before
        FROM pg_constraint c
        WHERE c.conname = status_column_constraint
          AND c.conrelid = tbl.table_name::regclass;

        -- Drop existing constraint if it exists
        RAISE NOTICE 'Dropping existing constraint "%s" (if it exists).', status_column_constraint;
        EXECUTE format(
            'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
            tbl.table_name, status_column_constraint
        );

        -- Add the new constraint
        RAISE NOTICE 'Adding new constraint "%s" to table "%s".', status_column_constraint, tbl.table_name;
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I IN (%s))',
            tbl.table_name,
            status_column_constraint,
            status_column,
            array_to_string(ARRAY(SELECT quote_literal(unnest(valid_statuses))), ', ')
        );

        SELECT pg_get_constraintdef(c.oid)
        INTO def_after
        FROM pg_constraint c
        WHERE c.conname = status_column_constraint
          AND c.conrelid = tbl.table_name::regclass;

        IF def_before IS NULL THEN
            PERFORM _log_table_activity(tbl.table_name, 'success', 'create_constraint',
                jsonb_build_object('procedure', '_p_update_workflow_constraints',
                                   'feature', 'status_workflow',
                                   'target', status_column_constraint, 'detail', def_after));
        ELSIF def_after IS DISTINCT FROM def_before THEN
            PERFORM _log_table_activity(tbl.table_name, 'success', 'update_constraint',
                jsonb_build_object('procedure', '_p_update_workflow_constraints',
                                   'feature', 'status_workflow',
                                   'target', status_column_constraint, 'detail', def_after));
        END IF;

        RAISE NOTICE 'Constraint "%s" successfully added to table "%s".', status_column_constraint, tbl.table_name;

      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to configure status constraint for table: %. Error: %', tbl.table_name, SQLERRM;
        PERFORM _log_table_activity(tbl.table_name, 'error', 'configure_status_constraint',
            jsonb_build_object('procedure', '_p_update_workflow_constraints',
                               'feature', 'status_workflow', 'detail', SQLERRM));
      END;
    END LOOP;

    RAISE NOTICE 'Procedure "_update_workflow_constraints" completed successfully.';
END $$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

