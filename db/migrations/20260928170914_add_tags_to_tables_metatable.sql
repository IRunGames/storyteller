-- migrate:up

-- The tags feature on the metatable: a standard TEXT[] column a table can ask
-- for, the same way it asks for timestamps or an activity log.
--
-- needs_tags is the declaration and has_tags the discovery, as with every
-- other feature pair here. tags_column names the column when it is not the
-- default `tags`, and follows kind_column's rule: _p_update_tables() reads it
-- rather than overwriting it, so a table may name its own.
ALTER TABLE _tables ADD COLUMN IF NOT EXISTS needs_tags  BOOLEAN DEFAULT FALSE;
ALTER TABLE _tables ADD COLUMN IF NOT EXISTS has_tags    BOOLEAN;
ALTER TABLE _tables ADD COLUMN IF NOT EXISTS tags_column TEXT;

COMMENT ON COLUMN _tables.needs_tags IS
    'Ask _p_update_tables_tags() for a TEXT[] tags column, NOT NULL DEFAULT ''{}'', with a GIN index.';
COMMENT ON COLUMN _tables.has_tags IS
    'Whether that column is actually present, as _p_update_tables() found it.';
COMMENT ON COLUMN _tables.tags_column IS
    'The tags column''s name when it is not `tags`. Declared, never overwritten.';

-- migrate:down
