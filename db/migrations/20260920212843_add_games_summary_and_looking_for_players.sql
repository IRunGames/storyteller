-- migrate:up
-- The Stories page shows a summary on each card and a "Looking for Players"
-- section. Both are plain columns on games; neither needs a lookup table.
ALTER TABLE games ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_looking_for_players boolean NOT NULL DEFAULT false;

-- migrate:down

