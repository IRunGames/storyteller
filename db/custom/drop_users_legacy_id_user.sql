-- Drop users.legacy_id_user.
--
-- It was carried over as an escape hatch for rows predating the bigint -> uuid
-- swap, but users was rebuilt empty, so nothing ever populated it and nothing
-- outside this repo can be holding one of those old ids.
--
-- create_auth_tables.sql no longer declares the column, but the migration
-- generated from its earlier version still does, so a database built from
-- scratch creates the column and then drops it here. Both paths converge on
-- the same shape.
--
-- Paired with removing `legacyIdUser` from apps/web/src/db/schema.ts: Drizzle
-- selects every declared column, so the two must be changed together.

alter table users
    drop column if exists legacy_id_user;
