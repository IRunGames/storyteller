-- migrate:up
DO $$
BEGIN
    RAISE NOTICE '[%] START DROP AND CREATE VIEW', clock_timestamp();

    DROP VIEW IF EXISTS v_story_scenes;
    
    -- ------------------------------------------------------------
-- A scene with everything the app asks about it in one row: the scene itself,
-- when it entered the status it holds, where that status sits in its
-- workflow, and the sitting it was played in, numbered the way the Timeline
-- numbers it.
--
-- It exists so that no caller has to know the shape of a status workflow. Two
-- things here would otherwise have to be written out in the app, and would be
-- wrong the day a workflow is edited:
--
--   status_at     The workflow builds one <status>_at column per status,
--                 named after the key lower-cased. Which of them is "the date
--                 of this status" depends on the status the row holds, so the
--                 row is turned into jsonb and the column looked up by its
--                 computed name. A CASE over the statuses as they stand today
--                 would need a migration every time one is added.
--
--   s_status_id   The status's place in its workflow, for ordering. Joined
--                 from s_statuses, scoped to the workflow mapped to
--                 story_scenes in _tables, since two workflows may each have
--                 a status of the same name.
--
-- The scene's own columns come through as they are, search_text included, so
-- a caller selects from here instead of from the table. A view freezes what
-- `sc.*` meant when it was created, so a column added to story_scenes later
-- needs this view rebuilt: `just view v_story_scenes`.
CREATE VIEW v_story_scenes AS
SELECT sc.*,
       -- Null for a status whose column has never been stamped, which is the
       -- honest answer: the row holds the status but nothing recorded when it
       -- arrived there.
       (to_jsonb(sc) ->> (lower(sc.status) || '_at'))::timestamptz AS status_at,
       st.s_status_id,
       st.description                                             AS status_description,
       ss.title                                                   AS session_title,
       ss.updated_at                                              AS session_updated_at,
       -- The sitting's place in its story's opening order, counted exactly as
       -- sa_listStorySessions sorts, so scene and Timeline agree on which one
       -- session three is. Null when the scene has not been played.
       (SELECT count(*) + 1
        FROM story_sessions earlier
        WHERE earlier.id_story = ss.id_story
          AND (earlier.created_at, earlier.id_story_session)
            < (ss.created_at, ss.id_story_session))                AS session_number
FROM story_scenes sc
         -- Left: a scene waiting on the board has no sitting yet.
         LEFT JOIN story_sessions ss ON ss.id_story_session = sc.id_story_session
         -- Left as well, so a row holding a status the workflow no longer
         -- lists still comes back rather than vanishing from the board.
         LEFT JOIN s_statuses st
                   ON st.status_key = sc.status
                       AND st.s_status_workflow_id = ANY (
                           SELECT unnest(t.s_status_workflow_ids)
                           FROM _tables t
                           WHERE t.table_name = 'story_scenes');

    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE CREATING VIEW', clock_timestamp();
END $$;

-- migrate:down

