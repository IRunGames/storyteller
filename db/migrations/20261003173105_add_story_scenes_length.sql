-- migrate:up

-- A scene's length, in whole minutes, as a session has one: its time in play.
-- story_sessions measures open_at to done_at less paused_time; a scene cannot,
-- because active_at is restamped every time it goes back into play, so here
-- each stretch in active is added up as it ends instead.
-- functions/tr_add_story_scenes_played_time.sql does the adding and has to be
-- migrated before this runs.

ALTER TABLE story_scenes
    ADD COLUMN IF NOT EXISTS played_time interval NOT NULL DEFAULT '0';

COMMENT ON COLUMN story_scenes.played_time IS
    'Time spent active, summed by tr_add_story_scenes_played_time as each '
    'stretch in active ends; length reads it.';

CREATE OR REPLACE TRIGGER tr_bu_story_scenes_played_time
    BEFORE UPDATE OF status ON story_scenes
    FOR EACH ROW
    WHEN (OLD.status = 'ACTIVE' AND NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION tr_add_story_scenes_played_time();

-- Scenes already finished were never timed. The seed puts them straight into
-- complete with active_at and complete_at both set, so the stretch between
-- the two is the best record there is of how long each ran. Only a row that
-- has nothing summed yet is touched, so a re-run adds nothing twice.
UPDATE story_scenes
SET played_time = complete_at - active_at
WHERE played_time = '0'
  AND active_at IS NOT NULL
  AND complete_at > active_at;

-- The length once the scene has been finished, null before. complete_at
-- rather than the status, as v_story_scenes.completed_at reads it: a scene
-- reopened after it was finished keeps its stamp and its length, and the
-- length takes in the extra stretch as soon as that stretch ends. A
-- generated column's expression cannot be altered later; drop and re-add it
-- to change it.
ALTER TABLE story_scenes
    ADD COLUMN IF NOT EXISTS length integer
        GENERATED ALWAYS AS (
            CASE
                WHEN complete_at IS NOT NULL
                    THEN round(EXTRACT(EPOCH FROM played_time) / 60)::integer
                END
            ) STORED;

-- migrate:down

