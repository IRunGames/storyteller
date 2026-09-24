-- migrate:up
-- Give users a search_text column: name, email and nick_name joined into one
-- generated column, so a lookup for a person matches whichever of the three
-- they typed. _tables holds the recipe and _p_update_tables_search_fields()
-- builds the column from it; users was never registered with search fields
-- before, so this is the first table in this database to get one. The
-- procedure skips a table whose column already exists, and the UPDATE is a
-- plain overwrite, so a re-run changes nothing.
DO
$$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM _tables WHERE table_name = 'users') THEN
            RAISE EXCEPTION
                'users is not present in _tables, so its search column cannot be added.';
        END IF;
    END
$$;

UPDATE _tables
SET search_fields     = ARRAY ['name', 'email', 'nick_name'],
    search_field_name = 'search_text',
    updated_at        = NOW()
WHERE table_name = 'users';

CALL _p_update_tables_search_fields();

-- The procedure logs rather than raises when it cannot build the column, so
-- check that it did.
DO
$$
    BEGIN
        IF NOT _column_exists('users', 'search_text') THEN
            RAISE EXCEPTION 'users.search_text was not created by _p_update_tables_search_fields().';
        END IF;
    END
$$;

-- migrate:down

