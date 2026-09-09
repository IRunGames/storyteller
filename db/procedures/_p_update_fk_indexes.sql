CREATE OR REPLACE PROCEDURE _p_update_fk_indexes()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
This procedure ensures that all foreign key constraints in tables 
marked as needing foreign key indexes (`needs_fk_indexes = TRUE`) 
have corresponding indexes created.

- Steps Performed -
1. Start the action log for the procedure.
2. Retrieve all tables from `_tables` where `needs_fk_indexes` is TRUE.
3. For each table:
   a. Check if the table has any foreign keys.
   b. If no foreign keys exist, log the information and skip further processing for that table.
   c. For each foreign key in the table:
      i. Generate the expected index name using the naming convention: `idx_fk_<table_name>_<column_name>`.
      ii. Check if the index already exists in `pg_indexes`.
      iii. If the index does not exist, create it and log the action.
      iv. If the index already exists, log that no action is required.
4. Log the completion of the process for each table.
5. End the action log for the procedure.
====================================================================
*/
DECLARE
    -- Logging
    actionName VARCHAR DEFAULT '_p_update_fk_indexes';
    actionVersion VARCHAR DEFAULT '2025-01-15';
    idLog BIGINT := _action_log_start(
        actionName,
        actionVersion,
        '_tables',
        (SELECT COUNT(*) FROM _tables WHERE needs_fk_indexes = TRUE)
    );

    -- Table-specific variables
    tbl RECORD;
    fk RECORD;
    index_name TEXT;
    exists_index BOOLEAN;
    has_foreign_keys BOOLEAN;

    -- Results tracking
    processed_count BIGINT DEFAULT 0;
    affected_count BIGINT DEFAULT 0;
BEGIN
    -- Loop through all tables in `_tables` where needs_fk_indexes is TRUE
    FOR tbl IN
        SELECT table_name
        FROM _tables
        WHERE needs_fk_indexes = TRUE
    LOOP
        PERFORM _action_log_step(idLog, CONCAT('Processing table: ', tbl.table_name), tbl.table_name, 0);

        -- Check if the table has any foreign keys
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE constraint_type = 'FOREIGN KEY'
            AND table_name = tbl.table_name
        ) INTO has_foreign_keys;

        IF NOT has_foreign_keys THEN
            PERFORM _action_log_step(idLog, CONCAT('Table ', tbl.table_name, ' has no foreign keys.'), tbl.table_name, 0);
            CONTINUE;
        END IF;

        -- Loop through all foreign key constraints for the table
        FOR fk IN
            SELECT
                tc.constraint_name AS fk_name,
                kcu.column_name AS fk_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = tbl.table_name
        LOOP
            -- Generate the expected index name
            index_name := format('idx_fk_%I_%I', tbl.table_name, fk.fk_column);

            -- Check if the index already exists
            SELECT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE tablename = tbl.table_name
                AND indexname = index_name
            ) INTO exists_index;

            -- Create the index if it doesn't exist
            IF NOT exists_index THEN
                EXECUTE format('CREATE INDEX %I ON %I (%I)', index_name, tbl.table_name, fk.fk_column);
                PERFORM _action_log_step(idLog, CONCAT('Created index: ', index_name, ' on column: ', fk.fk_column), tbl.table_name, 1);
                affected_count := affected_count + 1;
            ELSE
                PERFORM _action_log_step(idLog, CONCAT('Index already exists: ', index_name), tbl.table_name, 0);
            END IF;
        END LOOP;

        PERFORM _action_log_step(idLog, CONCAT('Completed processing table: ', tbl.table_name), tbl.table_name, 1);
        processed_count := processed_count + 1;
    END LOOP;

    -- End the action log
    PERFORM _action_log_end(idLog, processed_count, affected_count);
END;
$$;