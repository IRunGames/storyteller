-- migrate:up
-- A name for the sitting, and who came to it. id_users is an array rather
-- than a join table because attendance is a note the storyteller takes,
-- not a relationship anything else hangs off: nothing points at a row of
-- it, and a player who leaves the story keeps their place in the sessions
-- they sat through. An array cannot carry a foreign key, so the app resolves
-- the ids to people when it shows them and tolerates one that no longer
-- matches. A one-time change, so it sits here rather than in
-- custom/create_story_sessions_table.sql; IF NOT EXISTS keeps a re-run
-- harmless.
ALTER TABLE story_sessions
    ADD COLUMN IF NOT EXISTS title    text,
    ADD COLUMN IF NOT EXISTS id_users uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN story_sessions.title IS
    'The session''s name, as its write-up is titled.';
COMMENT ON COLUMN story_sessions.id_users IS
    'users.id_user of the players who came to the session; no foreign key, since arrays cannot carry one.';

-- migrate:down

