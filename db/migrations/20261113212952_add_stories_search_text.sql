-- migrate:up

-- stories.search_text: the story's title, summary and standard tags, so the
-- Stories page's search finds a story by any of them. _tables holds the
-- recipe and _p_update_tables_search_fields() builds the generated column
-- from it. join_code is left out: it is the story's private way in, and a
-- search must not be a way to find it.
CALL _p_set_and_update_table_features('stories',
    p_search_fields := ARRAY ['title', 'summary', 'standard_tags']);

DO $$
BEGIN
    IF NOT _column_exists('stories', 'search_text') THEN
        RAISE EXCEPTION 'stories.search_text was not created by _p_update_tables_search_fields().';
    END IF;
END $$;

-- migrate:down

-- Nothing else reads the column, so it goes alone, and the recipe with it so
-- a later run of the procedure does not build it again.
ALTER TABLE stories DROP COLUMN IF EXISTS search_text;
UPDATE _tables SET search_fields = NULL, updated_at = NOW() WHERE table_name = 'stories';
