-- migrate:up
-- What a storyteller keeps about a sitting once it is over: free text for
-- notes, a summary and the questions left hanging, plus a link to the
-- write-up of the session and to its hero image. All nullable text: a
-- session that has just opened has none of them yet, and nothing is derived
-- from them. A one-time change, so it sits here rather than in
-- custom/create_story_sessions_table.sql; IF NOT EXISTS keeps a re-run
-- harmless.
ALTER TABLE story_sessions
    ADD COLUMN IF NOT EXISTS notes               text,
    ADD COLUMN IF NOT EXISTS summary             text,
    ADD COLUMN IF NOT EXISTS lingering_questions text,
    ADD COLUMN IF NOT EXISTS image_link          text,
    ADD COLUMN IF NOT EXISTS link                text;

COMMENT ON COLUMN story_sessions.notes IS
    'The storyteller''s working notes on the session: who was met, what was given, what was learned.';
COMMENT ON COLUMN story_sessions.summary IS
    'What happened, in a few sentences.';
COMMENT ON COLUMN story_sessions.lingering_questions IS
    'The threads left open at the end of the session, one per line.';
COMMENT ON COLUMN story_sessions.image_link IS
    'URL of the session''s hero image.';
COMMENT ON COLUMN story_sessions.link IS
    'URL of the session''s write-up.';

-- migrate:down

