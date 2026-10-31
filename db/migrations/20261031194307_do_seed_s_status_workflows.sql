-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    -- Foreign keys to and from the table off, its triggers off; _seed_end
    -- puts them back and checks every row (functions/_seed_begin.sql says why).
    PERFORM _seed_begin('s_status_workflows');

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    -- Name the ids this seed inserts; never clear by id < 0.
    DELETE FROM s_status_workflows WHERE s_status_workflow_id IN (-1, -2, -3, -4, -5, -6, -7);

    RAISE NOTICE '+++    [%] Seeding s_status_workflows', clock_timestamp();

    -- ------------------------------------------------------------
    -- Seed data for `s_status_workflows`: one row per status workflow. Which
    -- table a workflow governs is set in that table's create script in
    -- custom/ (UPDATE _tables SET s_status_workflow_ids), not here: a
    -- workflow is seeded before its table exists, so at this point there is
    -- no _tables row for the mapping to land on.
    INSERT INTO s_status_workflows (s_status_workflow_id, name, status_column_name, workflow_trigger)
    VALUES
        (-1, 'Story Sessions Status Workflow', 'status', NULL),
        (-2, 'Story Scenes Status Workflow', 'status', NULL),
        (-3, 'Attachments Status Workflow', 'status', NULL),
        (-4, 'Elements Status Workflow', 'status', NULL),
        (-5, 'Scene Elements Status Workflow', 'status', NULL),
        (-6, 'Session Players Status Workflow', 'status', NULL),
        (-7, 'Feedback Status Workflow', 'status', NULL);
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    PERFORM _seed_end('s_status_workflows');

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

