-- migrate:up
-- Rename the actor columns to the id_<entity> convention.
--
--   created_by_user_id   -> id_created_by_user
--   updated_by_user_id   -> id_updated_by_user
--   archived_by_user_id  -> id_archived_by_user
--
-- These columns are created and maintained by _p_update_tables_user_ids and
-- _p_update_tables_archives, which now use the new names. Any table those
-- procedures had already processed carries the old ones, so they are renamed
-- here rather than left for the procedures to add alongside the originals.
--
-- Swept across the schema rather than naming tables one by one: the set is
-- whatever _tables.needs_user_ids / needs_archival happened to cover when the
-- procedures last ran, and a sweep stays correct as that set changes.
--
-- Idempotent: a column already carrying the new name is skipped, and a table
-- holding both names is left alone and reported, since that needs a human to
-- decide which one holds the real data.

DO
$$
    DECLARE
        r        RECORD;
        renamed  INT := 0;
        conflict INT := 0;
    BEGIN
        FOR r IN
            SELECT c.relname::TEXT AS tbl,
                   a.attname::TEXT AS old_col,
                   CASE a.attname
                       WHEN 'created_by_user_id' THEN 'id_created_by_user'
                       WHEN 'updated_by_user_id' THEN 'id_updated_by_user'
                       WHEN 'archived_by_user_id' THEN 'id_archived_by_user'
                       END          AS new_col
            FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
                     JOIN pg_attribute a ON a.attrelid = c.oid
                         AND a.attnum > 0
                         AND NOT a.attisdropped
            WHERE n.nspname = current_schema()
              AND c.relkind = 'r'
              AND a.attname IN ('created_by_user_id', 'updated_by_user_id', 'archived_by_user_id')
            ORDER BY 1, 2
            LOOP
                -- Both names present means an earlier partial run or a
                -- hand-made column; renaming would collide, so leave it.
                IF EXISTS (SELECT 1
                           FROM pg_attribute
                           WHERE attrelid = format('%I', r.tbl)::regclass
                             AND attname = r.new_col
                             AND NOT attisdropped) THEN
                    RAISE WARNING '%.% not renamed: % already exists on that table',
                        r.tbl, r.old_col, r.new_col;
                    conflict := conflict + 1;
                    CONTINUE;
                END IF;

                EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I',
                               r.tbl, r.old_col, r.new_col);
                RAISE NOTICE 'renamed %.% -> %', r.tbl, r.old_col, r.new_col;
                renamed := renamed + 1;
            END LOOP;

        RAISE NOTICE 'actor columns: % renamed, % skipped on conflict', renamed, conflict;
    END
$$;

-- RENAME COLUMN leaves constraint names untouched, so any foreign key created
-- under the old name still reads fk_<table>_created_by_user_id. Rename those
-- to match; _p_update_tables_user_ids drops both spellings on its next run, so
-- this only matters for tables it has not reprocessed yet.
DO
$$
    DECLARE
        r       RECORD;
        renamed INT := 0;
    BEGIN
        FOR r IN
            SELECT c.conname::TEXT                AS old_name,
                   c.conrelid::regclass::TEXT     AS tbl,
                   replace(replace(replace(c.conname::TEXT,
                                           '_created_by_user_id', '_id_created_by_user'),
                                   '_updated_by_user_id', '_id_updated_by_user'),
                           '_archived_by_user_id', '_id_archived_by_user') AS new_name
            FROM pg_constraint c
                     JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE n.nspname = current_schema()
              AND c.contype = 'f'
              AND (c.conname LIKE '%\_created\_by\_user\_id'
                OR c.conname LIKE '%\_updated\_by\_user\_id'
                OR c.conname LIKE '%\_archived\_by\_user\_id')
            LOOP
                EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
                               r.tbl, r.old_name, r.new_name);
                RAISE NOTICE 'renamed constraint % -> %', r.old_name, r.new_name;
                renamed := renamed + 1;
            END LOOP;

        RAISE NOTICE 'actor FK constraints: % renamed', renamed;
    END
$$;

-- migrate:down

