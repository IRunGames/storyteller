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
            (-2, 'COMPLETE', 'The scene has been played out.',             ARRAY['PENDING', 'ACTIVE'])
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
