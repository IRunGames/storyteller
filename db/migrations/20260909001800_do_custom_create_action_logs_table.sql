-- migrate:up
-- Create _action_logs, the header row for a long-running action.
-- Opened by _action_log_start(), closed by _action_log_end() on success or
-- _action_log_terminate() on failure. The step trail lives in _action_steps
-- and is aggregated into action_log when the entry is closed.
CREATE TABLE _action_logs
(
    _action_log_id   BIGSERIAL
        PRIMARY KEY,
    action_name      VARCHAR,
    action_version   VARCHAR,
    main_table       VARCHAR,
    user_id          UUID,
    starting_records BIGINT,
    ending_records   BIGINT,
    affected_records BIGINT,
    success          BOOLEAN,
    is_finished      BOOLEAN                  DEFAULT FALSE,
    action_seconds   INTEGER,
    action_log       TEXT,
    details          JSONB,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at      TIMESTAMP WITH TIME ZONE
);

-- Unfinished entries are the ones worth finding; action_name drives the
-- NOTICE lookups in _action_log_end / _action_log_terminate.
CREATE INDEX _action_logs_is_finished_created_at_idx
    ON _action_logs (is_finished, created_at);

CREATE INDEX _action_logs_action_name_idx
    ON _action_logs (action_name);

-- migrate:down

