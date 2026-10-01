-- migrate:up

-- attachments.search_text: the file name, the address and every tag, so the
-- Prep Work board's Attachments column finds an attachment by any of them.
-- _tables holds the recipe and _p_update_tables_search_fields() builds the
-- generated column from it; tags is a text[], which that procedure joins
-- through immutable_array_to_string (20261001182235 taught it how). cover is
-- a tag like the others here, so searching "cover" finds the cover.
CALL _p_set_and_update_table_features('attachments',
    p_search_fields := ARRAY ['file_name', 'url', 'tags']);

DO $$
BEGIN
    IF NOT _column_exists('attachments', 'search_text') THEN
        RAISE EXCEPTION 'attachments.search_text was not created by _p_update_tables_search_fields().';
    END IF;
END $$;

-- migrate:down
