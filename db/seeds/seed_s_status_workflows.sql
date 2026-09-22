    -- Seed data for `s_status_workflows`: one row per status workflow. Which
    -- table a workflow governs is set in that table's create script in
    -- custom/ (UPDATE _tables SET s_status_workflow_ids), not here: a
    -- workflow is seeded before its table exists, so at this point there is
    -- no _tables row for the mapping to land on.
    INSERT INTO s_status_workflows (s_status_workflow_id, name, status_column_name, workflow_trigger)
    VALUES
        (-1, 'Game Sessions Status Workflow', 'status', NULL);
