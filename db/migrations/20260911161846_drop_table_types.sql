-- migrate:up
-- Drop _table_types.
--
-- It was s_table_type until 20260909222130 renamed it, and it described kinds
-- of table: a table_prefix plus needs_create / needs_update /
-- needs_create_user / needs_update_user flags. Its only consumer was s_tables,
-- the earlier table registry that 20260909222129 dropped, and _tables — the
-- metatable that actually drives the needs_*/has_* machinery — carries those
-- decisions per table rather than per prefix. Nothing has read _table_types
-- since s_tables went.
--
-- No foreign key points here, no routine and no application code names it,
-- and its three rows (s_, _, and the blank user-data prefix) are descriptive
-- only. create_foundation_tables.sql still creates it as s_table_type: that
-- file is a one-time capture of the pre-dbmate schema, so it stays as the
-- historical record and this migration evolves it forward.

DROP TABLE IF EXISTS _table_types;

-- Keep the _tables metatable in step.
DELETE
FROM _tables
WHERE table_name = '_table_types';

-- migrate:down

