-- Create _action_steps, the per-step trail for an open _action_logs entry.
-- Rows are appended by _action_log_step() and aggregated by _action_log_end()
-- / _action_log_terminate() into _action_logs.action_log.
CREATE TABLE _action_steps
(
    _id_action_step  BIGSERIAL
        PRIMARY KEY,
    _id_action_log   BIGINT NOT NULL,
    step_name        VARCHAR,
    step_log         VARCHAR,
    action_name      VARCHAR,
    step_seconds     NUMERIC,
    starting_records BIGINT,
    expected_records BIGINT,
    affected_records BIGINT,
    ending_records   BIGINT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Every read in _action_log_end / _action_log_terminate filters on the log id,
-- then orders by created_at, _id_action_step.
CREATE INDEX _action_steps_action_log_id_idx
    ON _action_steps (_id_action_log, created_at, _id_action_step);
