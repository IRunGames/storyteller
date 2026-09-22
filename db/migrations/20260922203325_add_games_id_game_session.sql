-- migrate:up
-- The session of play currently at the table, if any. A storyteller opening
-- a session points the game at it; when the session is done the pointer is
-- cleared, so the column is NULL between sessions. game_sessions keeps every
-- session as history; this is only which one is in progress. SET NULL rather
-- than CASCADE so deleting a session can never take its game with it.
ALTER TABLE games
    ADD COLUMN IF NOT EXISTS id_game_session integer
        REFERENCES game_sessions (id_game_session) ON DELETE SET NULL;

COMMENT ON COLUMN games.id_game_session IS
    'The session currently at the table, if any; NULL between sessions. '
    'game_sessions holds the history, this points at the one in progress.';

-- migrate:down

