-- migrate:up

-- A system's stat block definition: the groups of stats an element run in
-- that system can carry, as jsonb, and an element's stat blocks: its values
-- for those stats, keyed by system id so one element can carry a block for
-- more than one system. The shapes are checked by the app
-- (apps/web/src/lib/stat-block-schemas.ts) rather than the database: a
-- definition's rules, such as a formula referring only to stats that exist,
-- are more than a CHECK can say. Both default to the empty shape so every
-- existing row reads as "none" rather than NULL.
ALTER TABLE systems
    ADD COLUMN IF NOT EXISTS stat_block_definition jsonb NOT NULL DEFAULT '{"groups":[]}'::jsonb;

ALTER TABLE elements
    ADD COLUMN IF NOT EXISTS stat_blocks jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN systems.stat_block_definition IS
    'The groups of stats an element run in this system can carry: {"groups":[{"name","label","stats":[{"name","label","type","rack","connectedTo","computedAs"}]}]}. Shape and rules: apps/web/src/lib/stat-block-schemas.ts.';

COMMENT ON COLUMN elements.stat_blocks IS
    'The element''s stat values per system, {"<id_system>":{"<group>":{"<stat>":{"value","min","max"}}}}, filling in that system''s stat_block_definition. Shape: apps/web/src/lib/stat-block-schemas.ts.';

-- migrate:down

