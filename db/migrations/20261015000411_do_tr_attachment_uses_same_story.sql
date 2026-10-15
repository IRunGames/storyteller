-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS tr_attachment_uses_same_story;

    -- ------------------------------------------------------------
/*
Keeps a use inside its attachment's story. The holder's story is worked out
from kind and external_id (a story is its own; a session, a scene or an
element names theirs; a scene element's is its scene's), written into
attachment_uses.id_story, and held
against attachments.id_story: a use of another story's picture raises. An
attachment with no story yet (a create form's upload, not yet claimed) is
claimed by its first use, which is how attachments.id_story is set now that
attachments carry no holder of their own.

tr_biu_attachment_uses_external_exists runs before this one, triggers firing
in name order, so the holder is known to exist by the time it is looked up.
*/
CREATE OR REPLACE FUNCTION tr_attachment_uses_same_story() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
DECLARE
    holder_story integer;
    file_story   integer;
BEGIN
    -- No ELSE, as in tr_attachment_uses_external_exists: a kind added to the
    -- enum and not here raises the first time it is used.
    CASE NEW.kind
        WHEN 'STORY' THEN
            holder_story := NEW.external_id;
        WHEN 'STORY_SESSION' THEN
            SELECT id_story INTO holder_story
            FROM story_sessions WHERE id_story_session = NEW.external_id;
        WHEN 'STORY_SCENE' THEN
            SELECT id_story INTO holder_story
            FROM story_scenes WHERE id_story_scene = NEW.external_id;
        WHEN 'ELEMENT' THEN
            SELECT id_story INTO holder_story
            FROM elements WHERE id_element = NEW.external_id;
        WHEN 'SCENE_ELEMENT' THEN
            -- Through the scene rather than the element: nothing holds a
            -- link's two halves to one story, and the scene is what the
            -- picture is for.
            SELECT s.id_story INTO holder_story
            FROM scene_elements se
                     JOIN story_scenes s ON s.id_story_scene = se.id_story_scene
            WHERE se.id_scene_element = NEW.external_id;
    END CASE;

    SELECT id_story INTO file_story
    FROM attachments WHERE id_attachment = NEW.id_attachment;

    IF file_story IS NULL THEN
        UPDATE attachments SET id_story = holder_story
        WHERE id_attachment = NEW.id_attachment;
    ELSIF file_story <> holder_story THEN
        RAISE EXCEPTION 'attachment % belongs to story %, not to story % of % %',
            NEW.id_attachment, file_story, holder_story, NEW.kind, NEW.external_id;
    END IF;

    NEW.id_story := holder_story;
    RETURN NEW;
END;
$$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

