-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    -- No DROP: once the trigger on game_sessions depends on this function,
    -- DROP FUNCTION fails. CREATE OR REPLACE swaps the body in place and
    -- keeps the trigger, as the tr_update_updated_at migration does.

    -- ------------------------------------------------------------
-- BEFORE UPDATE OF status on game_sessions, for a row leaving suspended;
-- custom/create_game_sessions_table.sql attaches it. Adds the stretch just
-- ended, from suspended_at to now, onto paused_time, which the generated
-- length column subtracts: a session's length is its time at the table, not
-- the wall-clock time from opening to done. The workflow trigger stamps
-- suspended_at each time the row enters suspended, so it always marks the
-- start of this stretch and not an earlier one. NOW() rather than
-- clock_timestamp() so the pause ends at the very instant the workflow
-- trigger stamps resumed_at or done_at in the same statement.
CREATE OR REPLACE FUNCTION tr_add_game_sessions_paused_time()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.suspended_at IS NOT NULL THEN
        NEW.paused_time := OLD.paused_time + (NOW() - OLD.suspended_at);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

