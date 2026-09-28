-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS _log_table_activity;

    -- ------------------------------------------------------------
/*
====================================================================
- Description -
Appends one entry to a table's row in `_tables.activity_log`: the metatable's
record of what was actually built, changed, or refused for that table.

Every `_p_update_tables_*` routine calls this, and only when something really
happened. A routine that ran and found everything already in place writes
nothing — a log of no-ops is a log nobody reads. `_action_logs` already
records every step of every run; this records only the changes.

- Parameters -
  p_table_name  the table the change applies to, as `_tables.table_name`
  p_status      'success' or 'error'
  p_action      what happened, e.g. 'create_column', 'add_enum_values'
  p_data        the specifics: procedure, feature, target and any detail

- Notes -
The entry keeps the shape `validate_status_transition` writes, so anything
reading an activity_log anywhere in the database can read these too. Only
`activityCategory` differs: `metatable_log` rather than `status_change_log`.

Silently does nothing when the table has no `_tables` row. A routine logging
against a table the metatable does not know about is not worth failing a
migration over, and `_p_update_tables()` will create the row on its next run.
====================================================================
*/

CREATE OR REPLACE FUNCTION _log_table_activity(
    p_table_name TEXT,
    p_status     TEXT,
    p_action     TEXT,
    p_data       JSONB DEFAULT '{}'::jsonb
)
    RETURNS VOID
    LANGUAGE plpgsql
AS
$$
DECLARE
    entry JSONB;
BEGIN
    entry := jsonb_build_object(
        'fileId', NULL,
        'userId', NULL,
        'activityAt', now(),
        'activityId', gen_random_uuid(),
        'activityData', jsonb_build_object(
            'id_user', current_user,
            'timestamp', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSZ'),
            'action', p_action
        ) || COALESCE(p_data, '{}'::jsonb),
        'activityTags', '[]'::jsonb,
        'activitySource', NULL,
        'activityStatus', p_status,
        'activityDetails', '',
        'activityCategory', 'metatable_log',
        'relatedActivityId', NULL,
        'templateVersionId', NULL
    );

    UPDATE _tables
    SET activity_log = COALESCE(activity_log, '[]'::jsonb) || entry
    WHERE table_name = p_table_name;
END;
$$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

