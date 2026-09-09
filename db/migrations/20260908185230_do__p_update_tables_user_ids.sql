-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_update_tables_user_ids;

    -- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE _p_update_tables_user_ids()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Ensures that all tables flagged with `needs_user_ids` in the `_tables` 
metadata table have proper `created_by_user_id` and `updated_by_user_id` 
columns with foreign key constraints to the users table.

- Steps Performed -
1. Iterate through all tables flagged with `needs_user_ids = TRUE` in `_tables`.
2. Validate the `created_by_user_id` column:
   - If it exists but is not of type `UUID`, drop and recreate it.
   - If it does not exist, add it as a `UUID` column with a default value of `NULL`.
3. Validate the `updated_by_user_id` column:
   - If it exists but is not of type `UUID`, drop and recreate it.
   - If it does not exist, add it as a `UUID` column with a default value of `NULL`.
4. Add foreign key constraints to the users table for both columns.
5. Update the metadata in `_tables` to indicate that the table now has 
   user ID tracking columns.
====================================================================
*/
DECLARE
    tbl RECORD;
    column_type TEXT;
BEGIN
    RAISE NOTICE 'Starting procedure "_p_update_tables_user_ids".';

    -- Loop through tables where needs_user_ids is TRUE
    FOR tbl IN
        SELECT table_name
        FROM _tables
        WHERE needs_user_ids = TRUE
    LOOP
        RAISE NOTICE 'Processing table: %', tbl.table_name;

        -- Drop existing foreign key constraints before modifying columns
        PERFORM _drop_foreign_key_constraint(tbl.table_name, format('fk_%s_created_by_user_id', tbl.table_name));
        PERFORM _drop_foreign_key_constraint(tbl.table_name, format('fk_%s_updated_by_user_id', tbl.table_name));
        
        -- Ensure created_by_user_id column exists with correct type
        PERFORM _ensure_column_type(tbl.table_name, 'created_by_user_id', 'UUID', 'NULL');
        
        -- Ensure updated_by_user_id column exists with correct type
        PERFORM _ensure_column_type(tbl.table_name, 'updated_by_user_id', 'UUID', 'NULL');
        
        -- Add foreign key constraints using helper function
        PERFORM _ensure_foreign_key(tbl.table_name, 'created_by_user_id', 'users', 'user_id');
        PERFORM _ensure_foreign_key(tbl.table_name, 'updated_by_user_id', 'users', 'user_id');

        -- Update the `needs_user_ids` and `has_user_ids` flags
        RAISE NOTICE 'Updating metadata for table: % in "_tables".', tbl.table_name;
        UPDATE _tables
        SET has_user_ids = TRUE,
            updated_at = NOW()
        WHERE table_name = tbl.table_name;
        RAISE NOTICE 'Metadata updated for table: %', tbl.table_name;
    END LOOP;

    RAISE NOTICE 'Procedure "_p_update_tables_user_ids" completed successfully.';
END $$;    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

-- NOPE / Optional! ------------------------------------------------------------

