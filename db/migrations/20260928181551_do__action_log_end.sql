-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS _action_log_end;

    -- ------------------------------------------------------------
/**
  _action_log_end

  Close an `_action_logs` row: stamp `is_finished`, `finished_at`,
  `ending_records`, `affected_records`, optional `details`, and the
  aggregated `action_log` text built from `_action_steps`. Returns the
  full set of `_action_steps` for this log so callers can render the
  step trail.

  Parameters:
    p_id_action_log      — the `_id_action_log` returned by `_action_log_start`.
    p_end_records    — optional final row count.
    p_affect_records — optional count of rows the action affected overall.
    p_details        — optional JSONB blob persisted on `_action_logs.details`
                      (e.g. { call: <params>, response: <lambda result> }).
                      Existing `details` is preserved when this is NULL.
 */
CREATE OR REPLACE FUNCTION _action_log_end(
    p_id_action_log      BIGINT,
    p_end_records    BIGINT DEFAULT NULL,
    p_affect_records BIGINT DEFAULT NULL,
    p_details        JSONB  DEFAULT NULL
)
    RETURNS SETOF _action_steps
    LANGUAGE plpgsql
AS
$function$
DECLARE
    logName    VARCHAR DEFAULT '_action_log_end';
    logVersion VARCHAR DEFAULT '2026-06-03';

    v_state    TEXT;
    v_msg      TEXT;
    v_detail   TEXT;
    v_hint     TEXT;
    v_context  TEXT;

    task_started_at TIMESTAMP DEFAULT (SELECT created_at FROM _action_logs WHERE _id_action_log = p_id_action_log);
    task_done_at    TIMESTAMP DEFAULT clock_timestamp();
    task_length     INTEGER   DEFAULT FLOOR(EXTRACT(EPOCH FROM (task_done_at - task_started_at)));

BEGIN
    -- Finishing step
    INSERT INTO _action_steps (step_name, _id_action_log)
    VALUES (CONCAT('==-END v', logVersion, '-== total time:{', task_length::TEXT, 's}'), p_id_action_log);

    -- Calculate from -> to for each step
    UPDATE _action_steps
    SET action_name = CASE
                          WHEN COALESCE(starting_records, expected_records, affected_records, ending_records) IS NOT NULL
                              THEN CONCAT(' (',
                                          COALESCE(_action_steps.starting_records, _action_steps.expected_records),
                                          '->',
                                          COALESCE(_action_steps.affected_records, _action_steps.ending_records), ') ')
                          ELSE ''
        END
    WHERE _action_steps._id_action_log = p_id_action_log;

    -- Update the step timing
    UPDATE _action_steps d2
    SET step_seconds = EXTRACT(EPOCH FROM (d2.created_at - d1.created_at))
    FROM _action_steps d1
    WHERE d1._id_action_log = d2._id_action_log
      AND d2._id_action_step = (d1._id_action_step + 1)
      AND d2.step_seconds IS NULL
      AND d1._id_action_log = p_id_action_log;

    -- Update the main log table
    UPDATE _action_logs
    SET success          = TRUE,
        is_finished      = TRUE,
        finished_at      = clock_timestamp(),
        ending_records   = p_end_records,
        affected_records = p_affect_records,
        details          = COALESCE(p_details, details),
        action_seconds   = FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - created_at))),
        action_log       = (SELECT STRING_AGG(
                                           CONCAT('::{', COALESCE(step_seconds, 0)::TEXT, 's}::', created_at::TEXT,
                                                  ':- ', step_name::TEXT, action_name)::TEXT, E'\n'
                                           ORDER BY created_at, _id_action_step)
                            FROM _action_steps
                            WHERE _id_action_log = p_id_action_log)
    WHERE _id_action_log = p_id_action_log;

    -- Put the action name on the step records
    UPDATE _action_steps
    SET action_name = _action_logs.action_name || ' ' || _action_logs.action_version
    FROM _action_logs
    WHERE _action_logs._id_action_log = _action_steps._id_action_log
      AND _action_steps._id_action_log = p_id_action_log;

    RAISE NOTICE E'%<<<<<<<<<<--=END=--TOTAL TIME::{%s}::%',
        (SELECT action_name FROM _action_logs WHERE _id_action_log = p_id_action_log),
        task_length,
        clock_timestamp();

    RETURN QUERY SELECT * FROM _action_steps WHERE _id_action_log = p_id_action_log ORDER BY _id_action_step;

EXCEPTION
    WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
            v_state = RETURNED_SQLSTATE,
            v_msg = MESSAGE_TEXT,
            v_detail = PG_EXCEPTION_DETAIL,
            v_hint = PG_EXCEPTION_HINT,
            v_context = PG_EXCEPTION_CONTEXT;

        RAISE WARNING E'Got exception:\n        state  : %\n        message: %\n        detail : %\n        hint   : %\n        context: %',
            v_state, v_msg, v_detail, v_hint, v_context;

        -- COMMIT is illegal inside a plpgsql function (only legal in
        -- procedures). It would raise `2D000 invalid_transaction_termination`
        -- and prevent the diagnostic _err / _action_steps writes below from
        -- running. Removed.

        INSERT INTO _err (error_text, area)
        VALUES (CONCAT('Error in ', logName, ' [', logVersion, ']: ', v_msg, ' - ', v_detail), logName);

        INSERT INTO _action_steps (step_name, step_log, _id_action_log)
        VALUES ('SQLEXCEPTION', CONCAT('ERROR ', v_state, ': ', v_msg), p_id_action_log);

        RAISE NOTICE E'[][][][][]EEEE%::% -ERROR ENDING log-',
            clock_timestamp(),
            (SELECT action_name FROM _action_logs WHERE _id_action_log = p_id_action_log);

        RETURN QUERY SELECT * FROM _action_steps WHERE _id_action_log = p_id_action_log ORDER BY _id_action_step;
END;
$function$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

