-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    -- Foreign keys to and from the table off, its triggers off; _seed_end
    -- puts them back and checks every row (functions/_seed_begin.sql says why).
    PERFORM _seed_begin('s_statuses');

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    DELETE FROM s_statuses WHERE s_status_id < 0;

    RAISE NOTICE '+++    [%] Seeding s_statuses', clock_timestamp();

    -- ------------------------------------------------------------
    -- Seed data for `s_statuses`: the statuses of every workflow in
    -- s_status_workflows. transition_from_status_keys lists the statuses a
    -- row may arrive FROM; NULL means nothing leads to it.
    --
    -- The seed runs with the table's triggers off (_seed_begin above), which
    -- is what lets two statuses point at each other (open <-> suspended): the
    -- trigger that checks every listed key already exists in the workflow is
    -- off, so a cycle can be inserted in a single statement.
    --
    -- s_status_id counts down from -1 in insertion order, so a status can be
    -- added anywhere without renumbering; nothing references this key.
    WITH raw_statuses (s_status_workflow_id, status_key, description, transition_from_status_keys) AS (
        VALUES
            -- Game sessions: `game_sessions` (open <-> suspended, either -> done)
            (-1, 'open',      'The session is being played.',           ARRAY['suspended']),
            (-1, 'suspended', 'The session is paused, to be resumed.', ARRAY['open']),
            (-1, 'done',      'The session has ended.',                ARRAY['open', 'suspended'])
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
    PERFORM _seed_end('s_statuses');

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

