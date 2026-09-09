-- migrate:up
-- Create _err, the catch-all diagnostic sink. The _action_log_* functions
-- write one row here from their EXCEPTION handlers before re-recording the
-- failure on _action_steps.
CREATE TABLE _err
(
    _err_id    BIGSERIAL
        PRIMARY KEY,
    error_text TEXT,
    area       VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX _err_area_created_at_idx
    ON _err (area, created_at);

-- migrate:down

