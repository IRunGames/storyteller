-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    SET session_replication_role = 'replica';

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    DELETE FROM s_statuses WHERE s_status_id < 0;

    RAISE NOTICE '+++    [%] Seeding xxx', clock_timestamp();

    -- ------------------------------------------------------------
    -- Seed data for `s_statuses`: the statuses of every workflow in
    -- s_status_workflows. transition_from_status_keys lists the statuses a
    -- row may arrive FROM. An empty array means nothing leads to it; NULL
    -- means validate_status_transition does not check, so anything may.
    --
    -- The seed runs with session_replication_role = 'replica', so the trigger
    -- that checks every listed key already exists in the workflow is off and
    -- a workflow can be inserted in a single statement whatever order its
    -- rows are in, cycles included.
    --
    -- s_status_id counts down from -1 in insertion order, so a status can be
    -- added anywhere without renumbering; nothing references this key.
    --
    -- Every status_key is UPPER CASE. It is a constant in a column, not prose,
    -- and reads as one wherever it turns up: in a CHECK constraint, in an
    -- activity_log entry, in a query someone types by hand. The metatable
    -- procedures lower-case the key when they build the <status>_at column
    -- names, so the columns stay open_at and pending_at.
    WITH raw_statuses (s_status_workflow_id, status_key, description, transition_from_status_keys) AS (
        VALUES
            -- Story sessions: `story_sessions`. Read as transitions FROM each
            -- status: open -> suspended or done; suspended -> resumed or
            -- done; resumed -> suspended or done. A session is only ever
            -- open once, so nothing leads back to it and open_at is stamped
            -- exactly once; a session may pause and resume any number of
            -- times.
            (-1, 'OPEN',      'The session is being played.',                     ARRAY[]::text[]),
            (-1, 'SUSPENDED', 'The session is paused, to be resumed.',           ARRAY['OPEN', 'RESUMED']),
            (-1, 'RESUMED',   'The session is being played again after a pause.', ARRAY['SUSPENDED']),
            (-1, 'DONE',      'The session has ended.',                          ARRAY['OPEN', 'SUSPENDED', 'RESUMED']),

            -- Story scenes: `story_scenes`. Every status leads to every
            -- other: a scene can be picked up, set down and picked up again,
            -- and one marked complete by mistake goes straight back. pending
            -- is the default a scene is created with, so its list is the two
            -- it can return from rather than empty.
            (-2, 'PENDING',  'The scene is prepared but not yet in play.', ARRAY['ACTIVE', 'COMPLETE']),
            (-2, 'ACTIVE',   'The scene is being played.',                 ARRAY['PENDING', 'COMPLETE']),
            (-2, 'COMPLETE', 'The scene has been played out.',             ARRAY['PENDING', 'ACTIVE']),

            -- Attachments: UPLOADING -> READY or ERROR; ERROR -> UPLOADING (retry).
            -- UPLOADING lists only ERROR because a retry is the only *transition* into
            -- it; rows arrive there by insert, and the transition trigger is BEFORE
            -- UPDATE only, so inserts are never checked. That is also what lets a typed
            -- link be inserted straight into READY without faking an upload.
            (-3, 'UPLOADING', 'The file is being uploaded.',           ARRAY['ERROR']),
            (-3, 'READY',     'The file is stored and can be shown.',  ARRAY['UPLOADING']),
            (-3, 'ERROR',     'The upload failed and may be retried.', ARRAY['UPLOADING']),

            -- Elements: `elements`. Every status leads to every other: an
            -- element is noted down, made ready for play, retired, and brought
            -- back whenever the story wants it. PENDING is the default an
            -- element is created with, so its list is the two it can return
            -- from rather than empty.
            (-4, 'PENDING',  'The element is noted but not yet ready for play.', ARRAY['READY', 'INACTIVE']),
            (-4, 'READY',    'The element is ready to be used in play.',         ARRAY['PENDING', 'INACTIVE']),
            (-4, 'INACTIVE', 'The element is set aside and not in use.',         ARRAY['PENDING', 'READY']),

            -- Scene elements: `scene_elements`. Every status leads to every
            -- other: an element in a scene starts out initial, and can be
            -- hidden from the players, shown, or switched off, and back
            -- again, initial included. INITIAL is the default a link is
            -- created with, so its list is the three it can return from
            -- rather than empty.
            (-5, 'INITIAL',   'The element has just been brought into the scene.',       ARRAY['INVISIBLE', 'READY', 'DISABLED']),
            (-5, 'INVISIBLE', 'The element is in the scene but hidden from the players.', ARRAY['INITIAL', 'READY', 'DISABLED']),
            (-5, 'READY',     'The element is in the scene and can be used.',            ARRAY['INITIAL', 'INVISIBLE', 'DISABLED']),
            (-5, 'DISABLED',  'The element is in the scene but switched off.',           ARRAY['INITIAL', 'INVISIBLE', 'READY']),

            -- Session players: `session_players`. Read as transitions FROM
            -- each status: waiting -> present, away or left; present -> away
            -- or left; away -> waiting, present or left; left -> waiting or
            -- present. WAITING is the default a row is created with, and a
            -- player who comes back from away or from leaving waits again,
            -- which restamps waiting_at, so the waiting room's clock starts
            -- over. Nothing leads from present back to waiting: once at the
            -- table, a player who drops out is away, not waiting.
            (-6, 'WAITING', 'The player is in the waiting room, before the table opens.', ARRAY['AWAY', 'LEFT']),
            (-6, 'PRESENT', 'The player is at the table.',                               ARRAY['WAITING', 'AWAY', 'LEFT']),
            (-6, 'AWAY',    'The player''s page has gone quiet without them leaving.',   ARRAY['WAITING', 'PRESENT']),
            (-6, 'LEFT',    'The player has left.',                                      ARRAY['WAITING', 'PRESENT', 'AWAY'])
    ),
    numbered_statuses AS (
        SELECT -ROW_NUMBER() OVER () AS s_status_id, *
        FROM raw_statuses
    )
    INSERT INTO s_statuses (s_status_id, s_status_workflow_id, status_key, description, transition_from_status_keys)
    SELECT * FROM numbered_statuses;

    -- Bring every table mapped to a workflow into line with the statuses just
    -- seeded: the CHECK on the status column, the <status>_at columns, the
    -- trigger that stamps them and the trigger that rejects a transition the
    -- workflow does not allow. A table's create script makes the same calls
    -- for its first build; these cover a re-seed that edits a workflow later.
    CALL _p_update_workflow_constraints();
    CALL _p_update_workflow_columns();
    CALL _p_update_workflow_status_timestamp_triggers();
    CALL _p_attach_workflow_triggers();
    CALL _p_attach_status_transition_triggers();
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    SET session_replication_role = 'origin';

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

