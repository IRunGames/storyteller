/**
  _action_log_start

  Open an entry in `_action_logs` for a long-running action and seed the
  first `_action_steps` row with a "--=START=--" marker. Returns the new
  `_action_log_id` so callers can pass it to `_action_log_step` /
  `_action_log_end`.

  Parameters:
    _action_name      — display name of the action (required).
    _action_version   — caller-supplied version string (required).
    _main_table       — optional table name this action targets. When set,
                        emits a synthetic "<n> starting in <table>" step.
    _starting_records — optional row count at the start, surfaced on the
                        synthetic step above. Defaults to 0.
    _user_id          — optional user UUID stamped on `_action_logs.user_id`
                        so the log row can be traced back to its initiator.
 */
CREATE OR REPLACE FUNCTION _action_log_start(
    _action_name      VARCHAR,
    _action_version   VARCHAR,
    _main_table       VARCHAR DEFAULT '',
    _starting_records BIGINT  DEFAULT 0,
    _user_id          UUID    DEFAULT NULL
)
    RETURNS BIGINT
    LANGUAGE plpgsql
AS
$function$
DECLARE
    logName    VARCHAR(100) DEFAULT '_action_log_start';
    logVersion VARCHAR(20)  DEFAULT '2026-06-03';

    idLog      _action_logs._action_log_id%TYPE;
BEGIN
    RAISE NOTICE E'% [v %]>>>>>>>>>>>>>>>--=START=--::%', _action_name, _action_version, clock_timestamp();

    INSERT INTO _action_logs (action_name, action_version, main_table, starting_records, user_id)
    VALUES (_action_name, _action_version, _main_table, _starting_records, _user_id)
    RETURNING _action_log_id INTO idLog;

    INSERT INTO _action_steps (_action_log_id, step_name, step_log)
    VALUES (idLog, CONCAT('--=START=-- ', _action_name, ' [ ', _action_version, ' ] '),
            CONCAT(' [v ', _action_version, ' ]'));

    IF _main_table > '' THEN
        RAISE NOTICE E'--%    -- for % (starting records: %) ', clock_timestamp(), _main_table, _starting_records;
        PERFORM _action_log_step(idLog, CONCAT(_starting_records, ' starting in ', _main_table), _main_table,
                                 _starting_records);
    END IF;

    RAISE NOTICE E'--%   -- PROCESS ID %', clock_timestamp(), idLog;

    RETURN idLog;
END;
$function$;
