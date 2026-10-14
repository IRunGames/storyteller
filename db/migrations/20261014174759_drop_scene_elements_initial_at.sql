-- migrate:up

-- INITIAL left the scene elements workflow two migrations back, and the
-- workflow procedures only add status columns, never take one away; the
-- view that read initial_at was rebuilt without it in the migration before
-- this. A plain DROP, so Postgres refuses if anything else still depends on
-- the column rather than taking it down with it.
ALTER TABLE scene_elements
    DROP COLUMN IF EXISTS initial_at;

-- migrate:down

