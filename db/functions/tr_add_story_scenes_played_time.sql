-- BEFORE UPDATE OF status on story_scenes, for a row leaving active; the
-- add_story_scenes_length migration attaches it. Adds the stretch just ended,
-- from active_at to now, onto played_time, which the generated length column
-- reads: a scene's length is its time in play, as a session's is its time at
-- the table.
--
-- Summed stretch by stretch rather than measured end to end, as
-- story_sessions does, because a scene can go back to active — set down and
-- picked up again, or reopened after it was marked complete — and the
-- workflow trigger restamps active_at each time it does, so the first time a
-- scene went into play is not kept anywhere. active_at always marks the start
-- of the stretch now ending. NOW() rather than clock_timestamp() so the
-- stretch ends at the very instant the workflow trigger stamps the status the
-- row is moving to.
CREATE OR REPLACE FUNCTION tr_add_story_scenes_played_time()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.active_at IS NOT NULL THEN
        NEW.played_time := OLD.played_time + (NOW() - OLD.active_at);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
