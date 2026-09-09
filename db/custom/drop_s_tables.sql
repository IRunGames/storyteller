-- Drop s_tables.
--
-- Not to be confused with _tables, the metatable that drives the needs_*/has_*
-- column and trigger machinery. s_tables was a separate, earlier registry
-- (table_name, primary_key_column, id_table_type) that _tables superseded.
--
-- Empty at the time of writing, referenced by no foreign key, and named by no
-- routine or application code, so the drop is self-contained. Its only
-- outbound reference was to s_table_type, which the next migration renames.
--
-- create_foundation_tables.sql still creates it: that file is a one-time
-- capture of the pre-dbmate schema, so it stays as the historical record and
-- this migration evolves it forward.

DROP TABLE IF EXISTS s_tables;

-- Keep the _tables metatable in step.
DELETE
FROM _tables
WHERE table_name = 's_tables';
