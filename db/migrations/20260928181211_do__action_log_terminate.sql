-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS _action_log_terminate;

    -- ------------------------------------------------------------
/**
  _action_log_terminate

  Abnormally close an `_action_logs` row when an action fails or is
  cancelled. Stamps `finished_at`, `ending_records`, `affected_records`,
  optional `details`, and an aggregated `action_log` text built from
  `_action_steps` with a `THIS PROCESS FAILED` header. Appends a
  `==-TERMINATED-==` step before aggregating so the trail records the
  termination point. Returns the full set of `_action_steps` for this
  log so callers can render the step trail.

  Use `_action_log_end` for successful completion; use this for the
  failure / cancellation path.

  Parameters:
    p_id_action_log      — the `_id_action_log` returned by `_action_log_start`.
    _end_records    — optional final row count at the point of termination.
    _affect_records — optional count of rows the action affected before
                      terminating.
    _details        — optional JSONB blob persisted on `_action_logs.details`
                      (e.g. { error: <message>, call: <params> }).
                      Existing `details` is preserved when this is NULL.
 */
CREATE OR REPLACE FUNCTION _action_log_terminate(
    p_id_action_log      BIGINT,
    _end_records    BIGINT DEFAULT NULL,
    _affect_records BIGINT DEFAULT NULL,
    _details        JSONB  DEFAULT NULL
)
    RETURNS SETOF _action_steps
    LANGUAGE plpgsql
AS
$function$
DECLARE
    logName    VARCHAR DEFAULT '_action_log_terminate';
    logVersion VARCHAR DEFAULT '2026-06-08';
    v_state    TEXT;
    v_msg      TEXT;
    v_detail   TEXT;
    v_hint     TEXT;
    v_context  TEXT;
BEGIN
    RAISE NOTICE E'%!!!!!!!!!!!!...terminating=--::%',
        (SELECT action_name FROM _action_logs WHERE p_id_action_log = p_id_action_log),
        clock_timestamp();

    -- Add a finishing step
    INSERT INTO _action_steps (step_name, _id_action_log)
    VALUES ('==-TERMINATED-==', p_id_action_log);

    -- Update the main log table
    UPDATE _action_logs
    SET is_finished      = TRUE,
        success          = FALSE,
        finished_at      = clock_timestamp(),
        ending_records   = _end_records,
        affected_records = _affect_records,
        details          = COALESCE(_details, details),
        action_seconds   = FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - created_at))),
        action_log       = E'THIS PROCESS FAILED \n' ||
                           (SELECT STRING_AGG(CONCAT(
                                       '::', created_at::TEXT, ':- ', step_name::TEXT, ' (',
                                       COALESCE(_action_steps.starting_records, _action_steps.expected_records), '->',
                                       COALESCE(_action_steps.affected_records, _action_steps.ending_records), ')'
                                   )::TEXT, E'\n'
                                   ORDER BY created_at, _id_action_step)
                            FROM _action_steps
                            WHERE p_id_action_log = p_id_action_log)
    WHERE p_id_action_log = p_id_action_log;

    -- Put the action name on the step records
    UPDATE _action_steps
    SET action_name = _action_logs.action_name || ' ' || _action_logs.action_version
    FROM _action_logs
    WHERE _action_logs._id_action_log = _action_steps._id_action_log
      AND _action_steps._id_action_log = p_id_action_log;

    -- Update the step timing
    UPDATE _action_steps d2
    SET step_seconds = EXTRACT(EPOCH FROM (d2.created_at - d1.created_at))
    FROM _action_steps d1
    WHERE d1._id_action_log = d2._id_action_log
      AND d2._id_action_step = (d1._id_action_step + 1)
      AND d2.step_seconds IS NULL
      AND d1._id_action_log = p_id_action_log;

    RAISE NOTICE E'%::% - ==-TERMINATED log-==',
        clock_timestamp(),
        (SELECT action_name FROM _action_logs WHERE p_id_action_log = p_id_action_log);

    RETURN QUERY SELECT * FROM _action_steps WHERE p_id_action_log = p_id_action_log ORDER BY _id_action_step;

EXCEPTION
    WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
            v_state   = RETURNED_SQLSTATE,
            v_msg     = MESSAGE_TEXT,
            v_detail  = PG_EXCEPTION_DETAIL,
            v_hint    = PG_EXCEPTION_HINT,
            v_context = PG_EXCEPTION_CONTEXT;

        RAISE WARNING E'Got exception:\n        state  : %\n        message: %\n        detail : %\n        hint   : %\n        context: %',
            v_state, v_msg, v_detail, v_hint, v_context;

        INSERT INTO _err (error_text, area)
        VALUES (CONCAT('Error in ', logName, ' [', logVersion, ']: ', v_msg, ' - ', v_detail), logName);

        INSERT INTO _action_steps (step_name, step_log, p_id_action_log)
        VALUES ('SQLEXCEPTION', CONCAT('ERROR ', v_state, ': ', v_msg), p_id_action_log);

        RAISE NOTICE E'EEEEEEEEEEEEE[][][][]%::% - -ERROR terminating log-',
            clock_timestamp(),
            (SELECT action_name FROM _action_logs WHERE p_id_action_log = p_id_action_log);

        RETURN QUERY SELECT * FROM _action_steps WHERE p_id_action_log = p_id_action_log ORDER BY _id_action_step;
END;
$function$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

