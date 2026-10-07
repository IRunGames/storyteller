-- migrate:up

-- story_sessions.id_story_scene: the scene the table is on right now, the
-- way stories.id_story_session is the session the story is on. Null before
-- the first scene comes up and between scenes. story_scenes.id_story_session
-- keeps the history of which scenes a sitting ran; this is only the current
-- one.
--
-- ON DELETE SET NULL, as stories.id_story_session is: deleting a scene takes
-- the session off it rather than taking the session with it. Nothing here
-- holds the scene to the session's story; whatever sets the pointer checks
-- that, as the scene_elements actions do for their pair.
ALTER TABLE story_sessions
    ADD COLUMN IF NOT EXISTS id_story_scene integer
        REFERENCES story_scenes (id_story_scene) ON DELETE SET NULL;

COMMENT ON COLUMN story_sessions.id_story_scene IS
    'The scene the session is on now, if any. story_scenes.id_story_session '
    'keeps which scenes the session ran; this is only the current one.';

-- The same name _p_update_fk_indexes would choose, so its next run finds it.
CREATE INDEX IF NOT EXISTS idx_fk_story_sessions_id_story_scene
    ON story_sessions (id_story_scene);

-- Make sure the metatable's record of foreign keys and dependants catches up.
CALL _p_update_tables();

-- migrate:down

