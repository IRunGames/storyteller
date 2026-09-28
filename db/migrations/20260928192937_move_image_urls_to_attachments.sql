-- migrate:up

-- The three inline image columns become rows in attachments. Every migrated
-- row is is_uploaded = FALSE: Vercel Blob has never been wired up, so every
-- URL in the database today is a link someone typed rather than a file we
-- hold. NOT EXISTS makes each insert skip a parent that already has an
-- attachment of that kind, so the backfill never doubles a picture up -- it
-- only ever adds what is missing.
INSERT INTO attachments (kind, external_id, status, url, is_uploaded, sort_order,
                         id_created_by_user, id_updated_by_user)
SELECT 'STORY', s.id_story, 'READY', s.image_url, FALSE, 0,
       s.id_created_by_user, s.id_updated_by_user
FROM stories s
WHERE s.image_url IS NOT NULL AND btrim(s.image_url) <> ''
  AND NOT EXISTS (SELECT 1 FROM attachments a
                  WHERE a.kind = 'STORY' AND a.external_id = s.id_story);

INSERT INTO attachments (kind, external_id, status, url, is_uploaded, sort_order,
                         id_created_by_user, id_updated_by_user)
SELECT 'STORY_SESSION', ss.id_story_session, 'READY', ss.image_link, FALSE, 0,
       ss.id_created_by_user, ss.id_updated_by_user
FROM story_sessions ss
WHERE ss.image_link IS NOT NULL AND btrim(ss.image_link) <> ''
  AND NOT EXISTS (SELECT 1 FROM attachments a
                  WHERE a.kind = 'STORY_SESSION' AND a.external_id = ss.id_story_session);

INSERT INTO attachments (kind, external_id, status, url, is_uploaded, sort_order,
                         id_created_by_user, id_updated_by_user)
SELECT 'STORY_SCENE', sc.id_story_scene, 'READY', sc.image_link, FALSE, 0,
       sc.id_created_by_user, sc.id_updated_by_user
FROM story_scenes sc
WHERE sc.image_link IS NOT NULL AND btrim(sc.image_link) <> ''
  AND NOT EXISTS (SELECT 1 FROM attachments a
                  WHERE a.kind = 'STORY_SCENE' AND a.external_id = sc.id_story_scene);

-- v_story_scenes is the only thing that reads a doomed column, and it reads it
-- through `sc.*`: a view freezes what the star meant when it was created, so
-- image_link is a real column of the view and blocks the ALTER. It is dropped
-- by name, never with CASCADE, then rebuilt afterwards from
-- db/views/v_story_scenes.sql, unchanged, because its `sc.*` now resolves
-- without the column. Rebuilding before the ALTER would freeze image_link
-- straight back in and the drop would fail.
DROP VIEW IF EXISTS v_story_scenes;

-- story_scenes.search_text is generated from status, title and description
-- only, so dropping the picture leaves the generated column alone.
ALTER TABLE stories        DROP COLUMN IF EXISTS image_url;
ALTER TABLE story_sessions DROP COLUMN IF EXISTS image_link;
ALTER TABLE story_scenes   DROP COLUMN IF EXISTS image_link;

-- ------------------------------------------------------------
-- db/views/v_story_scenes.sql, verbatim, so the file and the database agree.
-- A scene with everything the app asks about it in one row: the scene itself,
-- when it entered the status it holds, where that status sits in its
-- workflow, when it was finished and which finished scene of its sitting it
-- was, and the sitting itself, numbered the way the Timeline numbers it.
--
-- It exists so that no caller has to know the shape of a status workflow.
-- Four things here would otherwise have to be written out in the app, and
-- would be wrong the day a workflow is edited:
--
--   status_at     The workflow builds one <status>_at column per status,
--                 named after the key lower-cased. Which of them is "the date
--                 of this status" depends on the status the row holds, so the
--                 row is turned into jsonb and the column looked up by its
--                 computed name. A CASE over the statuses as they stand today
--                 would need a migration every time one is added.
--
--   completed_at  The same trick against the workflow's last status rather
--                 than the row's own, so it is "when this scene was finished"
--                 without the word COMPLETE appearing anywhere. A scene that
--                 was finished and then reopened keeps the stamp, which is
--                 what it is: the time it was finished.
--
--   scene_number  Which finished scene of its sitting this was, in the order
--                 they were finished. Null until a scene is finished, so a
--                 board shows numbers against the scenes that have been
--                 played and nothing against the ones still to come.
--
--   s_status_id   The status's place in its workflow, for ordering. Scoped to
--                 the workflow mapped to story_scenes in _tables, since two
--                 workflows may each have a status of the same name.
--
-- The scene's own columns come through as they are, search_text included, so
-- a caller selects from here instead of from the table. A view freezes what
-- `sc.*` meant when it was created, so a column added to story_scenes later
-- needs this view rebuilt: `just view v_story_scenes`.
CREATE VIEW v_story_scenes AS
WITH workflow AS (SELECT s.s_status_id, s.status_key, s.description
                  FROM s_statuses s
                  WHERE s.s_status_workflow_id = ANY (SELECT unnest(t.s_status_workflow_ids)
                                                      FROM _tables t
                                                      WHERE t.table_name = 'story_scenes')),
     -- The end of the workflow. s_status_id counts down in the order the seed
     -- lists the statuses, so the lowest id is the last one.
     final_status AS (SELECT status_key FROM workflow ORDER BY s_status_id LIMIT 1),
     scenes AS (SELECT sc.*,
                       (to_jsonb(sc) ->> (lower(sc.status) || '_at'))::timestamptz AS status_at,
                       (to_jsonb(sc) ->>
                        (lower((SELECT status_key FROM final_status)) || '_at'))::timestamptz
                                                                                   AS completed_at
                FROM story_scenes sc)
SELECT s.*,
       -- Ascending puts the unfinished ones last, so the finished scenes take
       -- 1 upwards between them and the CASE drops the numbers that would
       -- have gone to scenes that are not finished. The id breaks a tie for
       -- scenes finished in the same statement, as the seed does.
       CASE
           WHEN s.completed_at IS NOT NULL
               THEN row_number()
                    OVER (PARTITION BY s.id_story_session ORDER BY s.completed_at, s.id_story_scene)
           END                                                    AS scene_number,
       w.s_status_id,
       w.description                                              AS status_description,
       ss.title                                                   AS session_title,
       ss.updated_at                                              AS session_updated_at,
       -- The sitting's place in its story's opening order, counted exactly as
       -- sa_listStorySessions sorts, so scene and Timeline agree on which one
       -- session three is. The CASE is what makes it null for a scene that has
       -- not been played: the outer join leaves ss.id_story null, every
       -- predicate below goes null with it, nothing matches and a bare
       -- count(*) + 1 would put every waiting scene in session 1.
       CASE
           WHEN s.id_story_session IS NOT NULL
               THEN (SELECT count(*) + 1
                     FROM story_sessions earlier
                     WHERE earlier.id_story = ss.id_story
                       AND (earlier.created_at, earlier.id_story_session)
                         < (ss.created_at, ss.id_story_session))
           END                                                    AS session_number
FROM scenes s
         -- Left: a scene waiting on the board has no sitting yet.
         LEFT JOIN story_sessions ss ON ss.id_story_session = s.id_story_session
         -- Left as well, so a row holding a status the workflow no longer
         -- lists still comes back rather than vanishing from the board.
         LEFT JOIN workflow w ON w.status_key = s.status;
-- ------------------------------------------------------------

-- migrate:down
