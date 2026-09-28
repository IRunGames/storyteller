CREATE OR REPLACE PROCEDURE _p_update_tables_user_ids()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Ensures that all tables flagged with `needs_user_ids` in the `_tables` 
metadata table have proper `id_created_by_user` and `id_updated_by_user` 
columns with foreign key constraints to the users table.

- Steps Performed -
1. Iterate through all tables flagged with `needs_user_ids = TRUE` in `_tables`.
2. Validate the `id_created_by_user` column:
   - If it exists but is not of type `UUID`, drop and recreate it.
   - If it does not exist, add it as a `UUID` column with a default value of `NULL`.
3. Validate the `id_updated_by_user` column:
   - If it exists but is not of type `UUID`, drop and recreate it.
   - If it does not exist, add it as a `UUID` column with a default value of `NULL`.
4. Add foreign key constraints to the users table for both columns.
5. Update the metadata in `_tables` to indicate that the table now has 
   user ID tracking columns.
====================================================================
*/
DECLARE
    tbl RECORD;
    had_created_col BOOLEAN;
    had_updated_col BOOLEAN;
    had_created_fk BOOLEAN;
    had_updated_fk BOOLEAN;
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

      BEGIN
        -- The helpers below do not report whether they changed anything, and
        -- the foreign keys are dropped and re-added on every run, so what was
        -- already there is recorded first. Only what is genuinely new is
        -- logged; re-adding an identical constraint is not an event.
        had_created_col := _column_exists(tbl.table_name, 'id_created_by_user');
        had_updated_col := _column_exists(tbl.table_name, 'id_updated_by_user');
        had_created_fk  := _constraint_exists(tbl.table_name,
                               format('fk_%s_id_created_by_user', tbl.table_name));
        had_updated_fk  := _constraint_exists(tbl.table_name,
                               format('fk_%s_id_updated_by_user', tbl.table_name));

        -- Drop existing foreign key constraints before modifying columns.
        PERFORM _drop_foreign_key_constraint(tbl.table_name, format('fk_%s_id_created_by_user', tbl.table_name));
        PERFORM _drop_foreign_key_constraint(tbl.table_name, format('fk_%s_id_updated_by_user', tbl.table_name));

        -- Also clear the pre-rename constraint names. A table last processed
        -- before the id_<entity> rename still carries these, and they would
        -- otherwise linger alongside the new ones.
        PERFORM _drop_foreign_key_constraint(tbl.table_name, format('fk_%s_created_by_user_id', tbl.table_name));
        PERFORM _drop_foreign_key_constraint(tbl.table_name, format('fk_%s_updated_by_user_id', tbl.table_name));
        
        -- Ensure id_created_by_user column exists with correct type
        PERFORM _ensure_column_type(tbl.table_name, 'id_created_by_user', 'UUID', 'NULL');
        
        -- Ensure id_updated_by_user column exists with correct type
        PERFORM _ensure_column_type(tbl.table_name, 'id_updated_by_user', 'UUID', 'NULL');
        
        -- Add foreign key constraints using helper function
        PERFORM _ensure_foreign_key(tbl.table_name, 'id_created_by_user', 'users', 'id_user');
        PERFORM _ensure_foreign_key(tbl.table_name, 'id_updated_by_user', 'users', 'id_user');

        IF NOT had_created_col THEN
            PERFORM _log_table_activity(tbl.table_name, 'success', 'create_column',
                jsonb_build_object('procedure', '_p_update_tables_user_ids',
                                   'feature', 'user_ids', 'target', 'id_created_by_user',
                                   'detail', 'UUID NULL'));
        END IF;
        IF NOT had_updated_col THEN
            PERFORM _log_table_activity(tbl.table_name, 'success', 'create_column',
                jsonb_build_object('procedure', '_p_update_tables_user_ids',
                                   'feature', 'user_ids', 'target', 'id_updated_by_user',
                                   'detail', 'UUID NULL'));
        END IF;
        IF NOT had_created_fk THEN
            PERFORM _log_table_activity(tbl.table_name, 'success', 'create_foreign_key',
                jsonb_build_object('procedure', '_p_update_tables_user_ids',
                                   'feature', 'user_ids',
                                   'target', format('fk_%s_id_created_by_user', tbl.table_name),
                                   'detail', 'users.id_user'));
        END IF;
        IF NOT had_updated_fk THEN
            PERFORM _log_table_activity(tbl.table_name, 'success', 'create_foreign_key',
                jsonb_build_object('procedure', '_p_update_tables_user_ids',
                                   'feature', 'user_ids',
                                   'target', format('fk_%s_id_updated_by_user', tbl.table_name),
                                   'detail', 'users.id_user'));
        END IF;

        -- Update the `needs_user_ids` and `has_user_ids` flags
        RAISE NOTICE 'Updating metadata for table: % in "_tables".', tbl.table_name;
        UPDATE _tables
        SET has_user_ids = TRUE,
            updated_at = NOW()
        WHERE table_name = tbl.table_name;
        RAISE NOTICE 'Metadata updated for table: %', tbl.table_name;

      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to configure user_ids for table: %. Error: %', tbl.table_name, SQLERRM;
        UPDATE _tables SET has_user_ids = FALSE, updated_at = NOW()
        WHERE table_name = tbl.table_name;
        PERFORM _log_table_activity(tbl.table_name, 'error', 'configure_user_ids',
            jsonb_build_object('procedure', '_p_update_tables_user_ids',
                               'feature', 'user_ids', 'detail', SQLERRM));
      END;
    END LOOP;

    RAISE NOTICE 'Procedure "_p_update_tables_user_ids" completed successfully.';
END $$;