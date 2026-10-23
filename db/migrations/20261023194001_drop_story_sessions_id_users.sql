-- migrate:up
-- Who came to a session is session_players' job now: the live tables mark a
-- player PRESENT there as they reach the table, and the session list, its
-- player counts and the session's info panel read it from there too.
-- story_sessions.id_users, the array of user ids the storyteller once noted
-- by hand, is dropped, so the two can never disagree again (they did: a
-- player at the table showed as "No players recorded").
--
-- Before it goes, each id it holds is copied into session_players, so no
-- attendance is lost:
--   - only ids that are still users, as the info panel already listed them;
--   - never the story's owner, who has no session_players row at a table of
--     their own and is not counted as a player anywhere else;
--   - as LEFT, since these are past sittings, with present_at the session's
--     open_at (or created_at, for one never opened) and left_at its done_at
--     where it has one;
--   - skipping anyone who already has a row for that session, which the
--     unique (id_story_session, player) index would refuse anyway.
--
-- The status trigger stamps left_at with now() on insert, so the UPDATE
-- after it puts the session's done_at there instead; now() is the
-- transaction's start time, which is what picks out exactly the rows this
-- migration inserted. The UPDATE leaves the status as it is, so the
-- transition check and the stamping trigger let it through untouched.
--
-- v_story_sessions selects id_users, so it is dropped first (never with
-- CASCADE) and rebuilt by the migration after this one, from
-- db/views/v_story_sessions.sql, counting session_players instead.
--
-- Forward only and safe to run twice: everything sits behind a check that
-- the column is still there.
DO $$
DECLARE
    copied integer;
BEGIN
    IF NOT EXISTS (SELECT 1
                   FROM information_schema.columns
                   WHERE table_schema = current_schema()
                     AND table_name = 'story_sessions'
                     AND column_name = 'id_users') THEN
        RAISE NOTICE 'story_sessions.id_users is already gone; nothing to do.';
        RETURN;
    END IF;

    INSERT INTO session_players (id_story, id_story_session, status, present_at, created_at,
                                 id_created_by_user, id_updated_by_user)
    SELECT ss.id_story,
           ss.id_story_session,
           'LEFT',
           COALESCE(ss.open_at, ss.created_at),
           COALESCE(ss.open_at, ss.created_at),
           player.id_user,
           player.id_user
    FROM story_sessions ss
             JOIN stories s ON s.id_story = ss.id_story
             CROSS JOIN LATERAL unnest(ss.id_users) AS player (id_user)
    WHERE EXISTS (SELECT 1 FROM s_users u WHERE u.id_user = player.id_user)
      AND player.id_user IS DISTINCT FROM s.id_created_by_user
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS copied = ROW_COUNT;

    UPDATE session_players sp
    SET left_at = COALESCE(ss.done_at, sp.left_at)
    FROM story_sessions ss
    WHERE ss.id_story_session = sp.id_story_session
      AND sp.status = 'LEFT'
      AND sp.left_at = now();

    RAISE NOTICE 'Copied % attendance rows from story_sessions.id_users into session_players.', copied;

    DROP VIEW IF EXISTS v_story_sessions;
    ALTER TABLE story_sessions DROP COLUMN id_users;
END
$$;

-- migrate:down
