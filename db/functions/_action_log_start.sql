/**
  _action_log_start

  Open an entry in `_action_logs` for a long-running action and seed the
  first `_action_steps` row with a "--=START=--" marker. Returns the new
  `_id_action_log` so callers can pass it to `_action_log_step` /
  `_action_log_end`.

  Parameters:
    p_action_name      — display name of the action (required).
    p_action_version   — caller-supplied version string (required).
    p_main_table       — optional table name this action targets. When set,
                        emits a synthetic "<n> starting in <table>" step.
    p_starting_records — optional row count at the start, surfaced on the
                        synthetic step above. Defaults to 0.
    p_id_user          — optional user UUID stamped on
                        `_action_logs.id_created_by_user` so the log row can be
                        traced back to its initiator. That column is managed by
                        _p_update_tables_user_ids, which also gives it a
                        foreign key to users, so an id that does not exist is
                        now rejected rather than quietly stored.
 */
CREATE OR REPLACE FUNCTION _action_log_start(
    p_action_name      VARCHAR,
    p_action_version   VARCHAR,
    p_main_table       VARCHAR DEFAULT '',
    p_starting_records BIGINT  DEFAULT 0,
    p_id_user          UUID    DEFAULT NULL
)
    RETURNS BIGINT
    LANGUAGE plpgsql
AS
$function$
DECLARE
    logName    VARCHAR(100) DEFAULT '_action_log_start';
    logVersion VARCHAR(20)  DEFAULT '2026-06-03';

    idLog      _action_logs._id_action_log%TYPE;
BEGIN
    RAISE NOTICE E'% [v %]>>>>>>>>>>>>>>>--=START=--::%', p_action_name, p_action_version, clock_timestamp();

    INSERT INTO _action_logs (action_name, action_version, main_table, starting_records, id_created_by_user)
    VALUES (p_action_name, p_action_version, p_main_table, p_starting_records, p_id_user)
    RETURNING _id_action_log INTO idLog;

    INSERT INTO _action_steps (_id_action_log, step_name, step_log)
    VALUES (idLog, CONCAT('--=START=-- ', p_action_name, ' [ ', p_action_version, ' ] '),
            CONCAT(' [v ', p_action_version, ' ]'));

    IF p_main_table > '' THEN
        RAISE NOTICE E'--%    -- for % (starting records: %) ', clock_timestamp(), p_main_table, p_starting_records;
        PERFORM _action_log_step(idLog, CONCAT(p_starting_records, ' starting in ', p_main_table), p_main_table,
                                 p_starting_records);
    END IF;

    RAISE NOTICE E'--%   -- PROCESS ID %', clock_timestamp(), idLog;

    RETURN idLog;
END;
$function$;
