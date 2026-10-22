-- A session with the two things every list of sessions shows about it and
-- the table cannot hold: which session of its story it was, and how many came.
--
--   session_number  Its place in its story's opening order, 1 for the first:
--                   by created_at, with the id breaking the tie for sessions
--                   opened in one statement, as the seed does. The Timeline
--                   sorts the same way, newest first, so its rows and their
--                   numbers agree. A count of the sessions before it rather
--                   than row_number(): a window only lets a filter on
--                   id_story through, so looking one session up by its id
--                   would number every session there is first. The count
--                   is asked per row that survives the filter. v_story_scenes
--                   counts a scene's sitting the same way on its own rather
--                   than reading this view, so that rebuilding either one
--                   never has to drop the other.
--
--   player_count    How many of the users in id_users are still users: the
--                   same people the session's info panel lists, which leaves
--                   out an id nobody matches any more. id_users is an array
--                   with no foreign key (see create_story_sessions_table), so
--                   the count is held to s_users rather than taken from its
--                   length.
--
-- The session's own columns come through as they are, so a caller selects
-- from here instead of from the table. A view freezes what `ss.*` meant when
-- it was created, so a column added to story_sessions later needs this view
-- rebuilt: `just view v_story_sessions`.
CREATE VIEW v_story_sessions AS
SELECT ss.*,
       (SELECT count(*) + 1
        FROM story_sessions earlier
        WHERE earlier.id_story = ss.id_story
          AND (earlier.created_at, earlier.id_story_session)
            < (ss.created_at, ss.id_story_session)) AS session_number,
       (SELECT count(*)
        FROM s_users u
        WHERE u.id_user = ANY (ss.id_users))        AS player_count
FROM story_sessions ss;
