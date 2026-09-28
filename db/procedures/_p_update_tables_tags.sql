CREATE OR REPLACE PROCEDURE _p_update_tables_tags()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Ensures every table flagged `needs_tags = TRUE` in `_tables` has a TEXT[] tags
column that is NOT NULL with a default of '{}', and a GIN index over it.

- Steps Performed -
1. Iterate through all tables where `needs_tags = TRUE`.
2. For each table:
   a. Resolve the column: whatever `tags_column` names, or `tags`.
   b. If it does not exist, add it as TEXT[] NOT NULL DEFAULT '{}'.
   c. If it exists, it must be TEXT[]; backfill NULLs, then enforce the
      default and NOT NULL.
   d. Create a GIN index over it if one is not already there.
3. Record the resolved name in `tags_column` and set `has_tags = TRUE`, or
   `FALSE` on failure. A table that could not be configured is reported
   through that flag rather than by aborting the whole run.

- Notes -
The index is GIN because tags are queried with @>, && and = ANY, and a btree
index serves none of them — without it every tag lookup is a sequential scan.
That index is most of the reason to have a standard tags feature rather than
each table declaring its own TEXT[].

'{}' rather than NULL so nothing reading tags has to handle both an absent
array and an empty one, the same choice activity_log makes with '[]'.
====================================================================
*/
DECLARE
    tbl RECORD;
    v_tags_column TEXT;
    v_udt_name TEXT;
    v_index_name TEXT;
    v_was_nullable BOOLEAN;
    v_had_index BOOLEAN;
BEGIN
    RAISE NOTICE 'Starting procedure "_p_update_tables_tags".';

    FOR tbl IN
        SELECT table_name, tags_column
        FROM _tables
        WHERE needs_tags = TRUE
    LOOP
        RAISE NOTICE 'Processing table: %', tbl.table_name;

        BEGIN
            v_tags_column := COALESCE(tbl.tags_column, 'tags');
            v_index_name := tbl.table_name || '_' || v_tags_column || '_gin';

            SELECT c.udt_name, c.is_nullable = 'YES'
            INTO v_udt_name, v_was_nullable
            FROM information_schema.columns c
            WHERE c.table_schema = current_schema()
              AND c.table_name = tbl.table_name
              AND c.column_name = v_tags_column;

            SELECT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname = current_schema() AND indexname = v_index_name
            ) INTO v_had_index;

            IF v_udt_name IS NULL THEN
                RAISE NOTICE 'Adding % column to table: %', v_tags_column, tbl.table_name;
                EXECUTE format(
                    'ALTER TABLE %I ADD COLUMN %I TEXT[] NOT NULL DEFAULT ''{}''',
                    tbl.table_name, v_tags_column
                );
                PERFORM _log_table_activity(tbl.table_name, 'success', 'create_column',
                    jsonb_build_object('procedure', '_p_update_tables_tags',
                                       'feature', 'tags', 'target', v_tags_column,
                                       'detail', 'TEXT[] NOT NULL DEFAULT ''{}'''));
            ELSIF v_udt_name <> '_text' THEN
                -- The column is there but is the wrong type, so it is left
                -- exactly as it is. The handler below catches this and records
                -- has_tags = FALSE, the same way _p_update_tables_activity_log
                -- reports a table it could not configure: one table's bad
                -- declaration must not abort the run for every other table.
                -- `SELECT table_name FROM _tables WHERE needs_tags AND NOT
                -- has_tags` is how you find them.
                RAISE EXCEPTION
                    'Table %.% names % as its tags column, but that column is % '
                    'and not TEXT[].',
                    current_schema(), tbl.table_name, v_tags_column, v_udt_name;
            ELSE
                RAISE NOTICE 'Column % exists on %. Ensuring NOT NULL with default.',
                    v_tags_column, tbl.table_name;
                EXECUTE format(
                    'UPDATE %I SET %I = ''{}'' WHERE %I IS NULL',
                    tbl.table_name, v_tags_column, v_tags_column
                );
                EXECUTE format(
                    'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT ''{}''',
                    tbl.table_name, v_tags_column
                );
                EXECUTE format(
                    'ALTER TABLE %I ALTER COLUMN %I SET NOT NULL',
                    tbl.table_name, v_tags_column
                );

                -- Only a column that was actually nullable has changed. One
                -- that was already NOT NULL has just been re-asserted, and
                -- re-asserting is not an event.
                IF v_was_nullable THEN
                    PERFORM _log_table_activity(tbl.table_name, 'success', 'set_not_null',
                        jsonb_build_object('procedure', '_p_update_tables_tags',
                                           'feature', 'tags', 'target', v_tags_column));
                END IF;
            END IF;

            -- GIN over the array, so @> and && can use an index.
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON %I USING GIN (%I)',
                v_index_name, tbl.table_name, v_tags_column
            );

            -- IF NOT EXISTS will not say whether it built anything, which is
            -- why the index was looked up before the statement ran.
            IF NOT v_had_index THEN
                PERFORM _log_table_activity(tbl.table_name, 'success', 'create_index',
                    jsonb_build_object('procedure', '_p_update_tables_tags',
                                       'feature', 'tags', 'target', v_index_name,
                                       'detail', 'GIN'));
            END IF;

            UPDATE _tables
            SET tags_column = v_tags_column,
                has_tags    = TRUE,
                updated_at  = NOW()
            WHERE table_name = tbl.table_name;
            RAISE NOTICE 'tags configured for table: % (%, index %)',
                tbl.table_name, v_tags_column, v_index_name;

        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to configure tags for table: %. Error: %', tbl.table_name, SQLERRM;
            UPDATE _tables
            SET has_tags   = FALSE,
                updated_at = NOW()
            WHERE table_name = tbl.table_name;
            PERFORM _log_table_activity(tbl.table_name, 'error', 'configure_tags',
                jsonb_build_object('procedure', '_p_update_tables_tags',
                                   'feature', 'tags', 'target', v_tags_column,
                                   'detail', SQLERRM));
        END;
    END LOOP;

    RAISE NOTICE 'Procedure "_p_update_tables_tags" completed.';
END $$;
