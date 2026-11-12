-- migrate:up

-- A scene element's own copy of its element's stat blocks: taken from the
-- element when the link is made (and from the old link when a scene is
-- copied), then changed in play, so the element's values stay the baseline
-- it was prepared with. Same shape as elements.stat_blocks, checked by the
-- app (apps/web/src/lib/stat-block-schemas.ts); only the groups the element
-- picked are present. Defaults to the empty shape so every existing link
-- reads as "none" rather than NULL.
ALTER TABLE scene_elements
    ADD COLUMN IF NOT EXISTS stat_blocks jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN scene_elements.stat_blocks IS
    'This link''s copy of the element''s stat_blocks, taken when the link was made and changed in play. Same shape as elements.stat_blocks.';

-- migrate:down

ALTER TABLE scene_elements
    DROP COLUMN IF EXISTS stat_blocks;
