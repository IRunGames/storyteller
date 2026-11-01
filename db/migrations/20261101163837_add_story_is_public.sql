-- migrate:up
-- A public story's sessions, and the scenes played out in them, can be read
-- by anyone signed in. Otherwise only the storyteller and the story's
-- players can open a session; the storyteller's notes, lingering questions
-- and unplayed scenes stay theirs either way (sa_getStorySession).
ALTER TABLE stories ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- migrate:down
