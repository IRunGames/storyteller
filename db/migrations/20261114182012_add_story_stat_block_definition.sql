-- migrate:up

-- A story's own copy of its system's stat block definition: taken from the
-- system when the storyteller copies it on the story's page, then changed on
-- the story alone. Same shape as systems.stat_block_definition, checked by
-- the app (apps/web/src/lib/stat-block-schemas.ts), with the updatedAt stamp
-- the app writes into it. NULL, as every existing story starts, means the
-- story has no copy and reads its system's definition.
ALTER TABLE stories
    ADD COLUMN IF NOT EXISTS stat_block_definition jsonb;

COMMENT ON COLUMN stories.stat_block_definition IS
    'The story''s own copy of its system''s stat_block_definition, read in place of the system''s when set. NULL reads the system''s.';

-- migrate:down

ALTER TABLE stories
    DROP COLUMN IF EXISTS stat_block_definition;
