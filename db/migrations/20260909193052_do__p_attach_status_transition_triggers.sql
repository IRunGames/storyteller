-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_attach_status_transition_triggers;

    -- ------------------------------------------------------------
/*
====================================================================
- Description -
Attaches status transition triggers to tables that have associated
status workflows. For each table, the workflow's status column name is
retrieved from the s_status_workflows table. The trigger calls the generic
function validate_status_transition(), which uses the provided column name
(to dynamically check the transition from OLD to NEW status based on
allowed transitions defined in s_statuses).

- Steps Performed -
1. Iterates over every table in the _tables metatable with non-null s_status_workflow_ids.
2. Joins with s_status_workflows to retrieve specific status column names.
3. Constructs a standard trigger name using the 'tr_bu_status_transition_' prefix, the
   table name, and the status column.
4. Drops any existing trigger with that name and attaches a new trigger that passes the
   status column name to the validate_status_transition() function.
5. Logs each trigger attachment action using the _action_log_* functions.

- Requires -
validate_status_transition() must exist before the triggers this attaches
will fire; see functions/_tables_metatable/validate_status_transition.sql.
====================================================================
*/

CREATE OR REPLACE PROCEDURE _p_attach_status_transition_triggers()
LANGUAGE plpgsql
AS $$
DECLARE
    actionName VARCHAR DEFAULT '_p_attach_status_transition_triggers';
    actionVersion VARCHAR DEFAULT '2025-03-18';
    log_id BIGINT := _action_log_start(
        actionName,
        actionVersion,
        '_tables',
        (SELECT COUNT(*) FROM _tables WHERE s_status_workflow_ids IS NOT NULL)
    );
    tbl RECORD;
    trigger_name TEXT;
    processed_count BIGINT DEFAULT 0;
BEGIN
    FOR tbl IN
    SELECT
        t.table_name,
        COALESCE(w.status_column_name, 'status') AS status_column
    FROM _tables t
    JOIN s_status_workflows w ON w.s_status_workflow_id = ANY(t.s_status_workflow_ids)
    LOOP
        trigger_name := format('tr_bu_status_transition_%s_%s', tbl.table_name, tbl.status_column);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, tbl.table_name);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION validate_status_transition(%L)',
            trigger_name,
            tbl.table_name,
            tbl.status_column
        );
        RAISE NOTICE 'Trigger % attached to table %.', trigger_name, tbl.table_name;
        PERFORM _action_log_step(
            log_id,
            format('Trigger %s attached to table %s.', trigger_name, tbl.table_name),
            tbl.table_name,
            1
        );
        processed_count := processed_count + 1;
    END LOOP;
    PERFORM _action_log_end(log_id, processed_count, 0);
END;
$$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

