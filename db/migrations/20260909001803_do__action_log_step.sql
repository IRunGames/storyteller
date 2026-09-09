-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS _action_log_step;

    -- ------------------------------------------------------------
/**
  _action_log_step

  Append one `_action_steps` row to an open `_action_logs` entry. Callers
  pass the `_action_log_id` returned by `_action_log_start`; `_action_log_end`
  / `_action_log_terminate` later aggregate these rows into
  `_action_logs.action_log` and compute per-step timings.

  Parameters:
    _action_id        — the `_action_log_id` returned by `_action_log_start`.
    _step_name        — human-readable description of this step (required).
                        Surfaced verbatim in the aggregated step trail.
    _main_table       — optional table this step acted on. Stored on
                        `_action_steps.step_log`.
    _affected_records — optional row count for this step. Conventionally 1
                        when the step changed something and 0 when it was
                        purely informational; `_action_log_end` renders it
                        as the "->" side of the step's (from->to) summary.

  Returns the new `_action_step_id`. Every caller in this codebase invokes
  it via PERFORM and discards the result.
 */
CREATE OR REPLACE FUNCTION _action_log_step(
    _action_id        BIGINT,
    _step_name        VARCHAR,
    _main_table       VARCHAR DEFAULT '',
    _affected_records BIGINT  DEFAULT NULL
)
    RETURNS BIGINT
    LANGUAGE plpgsql
AS
$function$
DECLARE
    logName    VARCHAR(100) DEFAULT '_action_log_step';
    logVersion VARCHAR(20)  DEFAULT '2026-06-03';

    idStep     _action_steps._action_step_id%TYPE;
BEGIN
    INSERT INTO _action_steps (_action_log_id, step_name, step_log, affected_records)
    VALUES (_action_id, _step_name, NULLIF(_main_table, ''), _affected_records)
    RETURNING _action_step_id INTO idStep;

    RAISE NOTICE E'--%    -- % %', clock_timestamp(), _step_name,
        CASE WHEN _main_table > '' THEN CONCAT('[', _main_table, ']') ELSE '' END;

    RETURN idStep;
END;
$function$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

