-- migrate:up

-- The tags a new scene starts with, set on a story or, for every story that
-- runs it, on a system; see functions/standard_tags_for_story.sql. The same
-- type and default as the standard tags feature's column (TEXT[] NOT NULL
-- DEFAULT '{}'), but added here rather than through _tables: each table
-- has one tags column there, and these are not the rows' own tags. Nothing
-- searches by them, so no GIN index.
ALTER TABLE systems
    ADD COLUMN IF NOT EXISTS standard_tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE stories
    ADD COLUMN IF NOT EXISTS standard_tags text[] NOT NULL DEFAULT '{}';

-- An Eastern King lives only in the development database, not in the seeds
-- (seeds/seed_stories.sql says why), so its standard tags are set here; on a
-- database without it this updates nothing.
UPDATE stories
SET standard_tags = ARRAY ['assets', 'scene']
WHERE id_story = -1
  AND title = 'An Eastern King'
  AND standard_tags = '{}';

-- migrate:down

