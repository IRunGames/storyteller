/*
Proves an attachment's parent row exists. external_id cannot be a foreign key
because it points at one of three tables depending on kind, so this stands in
for the constraint Postgres cannot express.
*/
CREATE OR REPLACE FUNCTION tr_attachments_external_exists() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
DECLARE
    parent_table TEXT;
    parent_key   TEXT;
    found        BOOLEAN;
BEGIN
    -- A detached row is legal: a create form uploads before its story,
    -- session or scene exists, and claims the row when it is saved.
    IF NEW.external_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- No ELSE: a kind added to the enum and not to this CASE raises the first
    -- time it is used, rather than silently attaching to nothing.
    CASE NEW.kind
        WHEN 'STORY' THEN
            parent_table := 'stories';        parent_key := 'id_story';
        WHEN 'STORY_SESSION' THEN
            parent_table := 'story_sessions'; parent_key := 'id_story_session';
        WHEN 'STORY_SCENE' THEN
            parent_table := 'story_scenes';   parent_key := 'id_story_scene';
    END CASE;

    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE %I = $1)', parent_table, parent_key)
        INTO found USING NEW.external_id;

    IF NOT found THEN
        RAISE EXCEPTION 'attachments.external_id % has no % row', NEW.external_id, parent_table;
    END IF;

    RETURN NEW;
END;
$$;
