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
A thin wrapper over `_append_activity_log`, which does the actual append. It
exists for one reason: `_append_activity_log` addresses a row by primary key
value, and every metatable routine holds a table *name*. Without this, each
call site would be a seven-argument call wrapped around an `_id_table`
lookup, thirty times over.

Everything else comes from the shared pair, so these entries read exactly like
the ones `validate_status_transition` writes on every other table. Only
`activityCategory` differs: `metatable_log`.

Silently does nothing when the table has no `_tables` row. A routine logging
against a table the metatable does not know about is not worth failing a
migration over, and `_p_update_tables()` will create the row on its next run.
`_append_activity_log` likewise records its own failures in `_err` and returns
NULL rather than raising, so logging can never be what breaks the statement
being logged.
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
    v_id_table INT;
BEGIN
    SELECT _id_table INTO v_id_table
    FROM _tables
    WHERE table_name = p_table_name;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    PERFORM _append_activity_log(
        table_name        := '_tables',
        field_name        := 'activity_log',
        record_id         := v_id_table::TEXT,
        activity_category := 'metatable_log',
        activity_details  := p_action,
        activity_status   := p_status,
        activity_data     := COALESCE(p_data, '{}'::jsonb)
                             || jsonb_build_object('action', p_action,
                                                   'dbUser', current_user)
    );
END;
$$;
