-- The three BEFORE triggers fire in name order: the holder is proved to
-- exist, then the use is held to its attachment's story, then a sort_order
-- left out is filled in.
CREATE OR REPLACE TRIGGER tr_biu_attachment_uses_external_exists
    BEFORE INSERT OR UPDATE OF kind, external_id ON attachment_uses
    FOR EACH ROW EXECUTE FUNCTION tr_attachment_uses_external_exists();

CREATE OR REPLACE TRIGGER tr_biu_attachment_uses_same_story
    BEFORE INSERT OR UPDATE OF kind, external_id, id_attachment ON attachment_uses
    FOR EACH ROW EXECUTE FUNCTION tr_attachment_uses_same_story();

CREATE OR REPLACE TRIGGER tr_bi_attachment_uses_sort_order
    BEFORE INSERT ON attachment_uses
    FOR EACH ROW EXECUTE FUNCTION tr_attachment_uses_sort_order();

-- A holder takes its uses with it; the attachments stay the story's.
CREATE OR REPLACE TRIGGER tr_ad_stories_attachment_uses
    AFTER DELETE ON stories
    FOR EACH ROW EXECUTE FUNCTION tr_attachment_uses_delete_for_parent('STORY', 'id_story');

CREATE OR REPLACE TRIGGER tr_ad_story_sessions_attachment_uses
    AFTER DELETE ON story_sessions
    FOR EACH ROW EXECUTE FUNCTION tr_attachment_uses_delete_for_parent('STORY_SESSION', 'id_story_session');

CREATE OR REPLACE TRIGGER tr_ad_story_scenes_attachment_uses
    AFTER DELETE ON story_scenes
    FOR EACH ROW EXECUTE FUNCTION tr_attachment_uses_delete_for_parent('STORY_SCENE', 'id_story_scene');

CREATE OR REPLACE TRIGGER tr_ad_elements_attachment_uses
    AFTER DELETE ON elements
    FOR EACH ROW EXECUTE FUNCTION tr_attachment_uses_delete_for_parent('ELEMENT', 'id_element');

CREATE OR REPLACE TRIGGER tr_ad_scene_elements_attachment_uses
    AFTER DELETE ON scene_elements
    FOR EACH ROW EXECUTE FUNCTION tr_attachment_uses_delete_for_parent('SCENE_ELEMENT', 'id_scene_element');
