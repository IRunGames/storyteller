-- migrate:up
-- A new scene starts with its story's standard tags; see
-- functions/tr_story_scenes_standard_tags.sql. Insert only: a scene's tags
-- are its own once it exists.
CREATE OR REPLACE TRIGGER tr_bi_story_scenes_standard_tags
    BEFORE INSERT ON story_scenes
    FOR EACH ROW EXECUTE FUNCTION tr_story_scenes_standard_tags();

-- migrate:down

