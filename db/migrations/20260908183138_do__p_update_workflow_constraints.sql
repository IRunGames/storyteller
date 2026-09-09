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

        RAISE NOTICE 'Constraint "%s" successfully added to table "%s".', status_column_constraint, tbl.table_name;
    END LOOP;

    RAISE NOTICE 'Procedure "_update_workflow_constraints" completed successfully.';
END $$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

-- NOPE / Optional! ------------------------------------------------------------

