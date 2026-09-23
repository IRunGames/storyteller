-- migrate:up
-- A session's length was done_at - open_at. That was its time at the table
-- while resuming re-stamped open_at; now that a session is only ever open
-- once it would count every pause too. paused_time collects each suspended
-- stretch as the row leaves suspended (functions/
-- tr_add_game_sessions_paused_time.sql), and length subtracts it.
-- custom/create_game_sessions_table.sql builds a fresh database the same
-- way; this brings an existing one up to it.
ALTER TABLE game_sessions
    ADD COLUMN IF NOT EXISTS paused_time interval NOT NULL DEFAULT '0';

COMMENT ON COLUMN game_sessions.paused_time IS
    'Time spent suspended, summed by tr_add_game_sessions_paused_time as each '
    'pause ends; length subtracts it.';

CREATE OR REPLACE TRIGGER tr_bu_game_sessions_paused_time
    BEFORE UPDATE OF status ON game_sessions
    FOR EACH ROW
    WHEN (OLD.status = 'suspended' AND NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION tr_add_game_sessions_paused_time();

-- A generated column's expression cannot be altered, so length is dropped
-- and added back. Dropping loses nothing: the value is recomputed from the
-- other columns, and every existing row has paused_time 0, so a finished
-- session keeps the length it had. A re-run repeats the swap harmlessly.
ALTER TABLE game_sessions DROP COLUMN IF EXISTS length;
ALTER TABLE game_sessions
    ADD COLUMN length integer
        GENERATED ALWAYS AS (
            round(EXTRACT(EPOCH FROM (done_at - open_at - paused_time)) / 60)::integer
        ) STORED;

-- migrate:down

