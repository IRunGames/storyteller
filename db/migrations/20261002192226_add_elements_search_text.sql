-- migrate:up

-- elements.search_text: every text column an element has, its status and
-- every tag, so the Prep Work board's Elements column finds an element by any
-- of them. _tables holds the recipe and _p_update_tables_search_fields()
-- builds the generated column from it. kind is an enum, which that procedure
-- skips, so it is not searched here; the card shows it instead.
CALL _p_set_and_update_table_features('elements',
    p_search_fields := ARRAY ['status', 'initial_name', 'name', 'title', 'description', 'notes', 'tags']);

DO $$
BEGIN
    IF NOT _column_exists('elements', 'search_text') THEN
        RAISE EXCEPTION 'elements.search_text was not created by _p_update_tables_search_fields().';
    END IF;
END $$;

-- migrate:down

