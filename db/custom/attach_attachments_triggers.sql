CREATE OR REPLACE TRIGGER tr_biu_attachments_external_exists
    BEFORE INSERT OR UPDATE OF kind, external_id ON attachments
    FOR EACH ROW EXECUTE FUNCTION tr_attachments_external_exists();

CREATE OR REPLACE TRIGGER tr_ad_stories_attachments
    AFTER DELETE ON stories
    FOR EACH ROW EXECUTE FUNCTION tr_attachments_delete_for_parent('STORY', 'id_story');

CREATE OR REPLACE TRIGGER tr_ad_story_sessions_attachments
    AFTER DELETE ON story_sessions
    FOR EACH ROW EXECUTE FUNCTION tr_attachments_delete_for_parent('STORY_SESSION', 'id_story_session');

CREATE OR REPLACE TRIGGER tr_ad_story_scenes_attachments
    AFTER DELETE ON story_scenes
    FOR EACH ROW EXECUTE FUNCTION tr_attachments_delete_for_parent('STORY_SCENE', 'id_story_scene');
