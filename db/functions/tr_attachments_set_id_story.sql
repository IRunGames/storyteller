/*
Keeps attachments.id_story on the story an attachment belongs to, whichever of
its parts it sits on: the story itself, one of its sessions, or one of its
scenes. Set on every insert and every change of parent, so an upload, a
create form's claim and a move from the story's attachments to a scene all
fill it without the app having to.

id_story is not what any attachments list reads -- kind and external_id are
-- it is there so everything a story owns can be found from the story, for
cleaning up after it.

A detached row (external_id NULL, a create form's upload not yet claimed)
keeps whatever id_story it was given, NULL unless the caller knew better.
tr_biu_attachments_external_exists runs before this one, triggers firing in
name order, so the parent is known to exist by the time it is looked up.
*/
CREATE OR REPLACE FUNCTION tr_attachments_set_id_story() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
BEGIN
    IF NEW.external_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- No ELSE, as in tr_attachments_external_exists: a kind added to the enum
    -- and not here raises the first time it is used.
    CASE NEW.kind
        WHEN 'STORY' THEN
            NEW.id_story := NEW.external_id;
        WHEN 'STORY_SESSION' THEN
            SELECT id_story INTO NEW.id_story
            FROM story_sessions WHERE id_story_session = NEW.external_id;
        WHEN 'STORY_SCENE' THEN
            SELECT id_story INTO NEW.id_story
            FROM story_scenes WHERE id_story_scene = NEW.external_id;
    END CASE;

    RETURN NEW;
END;
$$;
