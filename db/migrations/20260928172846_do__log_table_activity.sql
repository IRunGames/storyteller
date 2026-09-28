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
The entry itself is built by `_build_activity_log`, the shared builder, so
these read exactly like the entries `validate_status_transition` writes on
every other table. Only `activityCategory` differs: `metatable_log`.

This does not use `_append_activity_log`, the other half of that pair.
That function derives a table's primary key as `<singular>_id`, which is
formforge's convention and the reverse of this database's `id_<singular>` —
`stories` would resolve to `storie_id`. `_tables` is keyed here by
`table_name`, which is what the metatable routines actually hold anyway.

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
    v_current JSONB;
    v_built   RECORD;
BEGIN
    SELECT activity_log INTO v_current
    FROM _tables
    WHERE table_name = p_table_name;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT *
    INTO v_built
    FROM _build_activity_log(
        activity_category    := 'metatable_log',
        current_activity_log := COALESCE(v_current, '[]'::jsonb),
        activity_details     := p_action,
        activity_status      := p_status,
        activity_data        := COALESCE(p_data, '{}'::jsonb)
                                || jsonb_build_object('action', p_action,
                                                      'dbUser', current_user)
    );

    UPDATE _tables
    SET activity_log = v_built.activity_log
    WHERE table_name = p_table_name;
END;
$$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

