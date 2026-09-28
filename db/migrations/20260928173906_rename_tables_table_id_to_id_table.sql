-- migrate:up

-- `_table_id` was the only primary key in the schema still spelled the
-- formforge way. Everything else here is `id_<singular>` — id_story,
-- id_story_scene, id_attachment — so the metatable's own key is brought into
-- line.
--
-- Safe to rename: nothing references it. No foreign key points at _tables,
-- and every metatable procedure addresses rows by table_name, not by id. The
-- only code mention is the Drizzle mirror in apps/web/src/db/schema.ts, which
-- is updated alongside this.
--
-- The sequence keeps its old name (_tables__table_id_seq); the column default
-- still points at it, and renaming a sequence buys nothing.
DO
$$
    BEGIN
        IF _column_exists('_tables', '_table_id') THEN
            ALTER TABLE _tables RENAME COLUMN _table_id TO _id_table;
        END IF;
    END
$$;

-- migrate:down
