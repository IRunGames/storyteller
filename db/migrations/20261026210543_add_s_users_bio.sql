-- migrate:up
-- The user's bio: free text they write about themselves on their profile,
-- shown under their name and nickname. Null until they write one.
ALTER TABLE s_users ADD COLUMN IF NOT EXISTS bio text;

-- migrate:down
