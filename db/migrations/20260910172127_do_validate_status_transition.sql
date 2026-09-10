-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    -- No DROP: once _p_attach_status_transition_triggers has run, every
    -- workflow-bearing table has a trigger depending on this function and
    -- DROP FUNCTION fails. CREATE OR REPLACE swaps the body in place.

    -- ------------------------------------------------------------
/*
====================================================================
- Description -
Generic BEFORE UPDATE trigger function enforcing a table's status
workflow. The status column to police is passed as TG_ARGV[0], so one
function serves every workflow-bearing table; the per-table triggers are
attached by `_p_attach_status_transition_triggers`.

Allowed transitions come from `s_statuses.transition_from_status_keys`,
which lists the statuses that may transition *into* a given status. On a
legal transition the function also appends a `status_change_log` entry to
the row's `activity_log`.

- Steps Performed -
1. Resolves the workflow for (TG_TABLE_NAME, status column); raises if none.
2. Reads OLD/NEW values of the status column dynamically; returns early
   when the status did not change.
3. Rejects the update unless the old status appears in the new status's
   `transition_from_status_keys`, naming the legal destinations (or
   reporting the old status as terminal).
4. Skips logging with a WARNING when the table has no `activity_log`
   column; otherwise appends an activity entry, attributing it to
   `id_updated_by_user` when that column exists.

- Note -
Attached to tables by `_p_attach_status_transition_triggers`. Once those
triggers exist this function cannot be dropped without CASCADE, so it is
maintained via CREATE OR REPLACE and its signature must stay stable.
====================================================================
*/

CREATE OR REPLACE FUNCTION validate_status_transition()
    RETURNS trigger
    LANGUAGE plpgsql
AS
$$
DECLARE
    workflow_id         integer;
    allowed_transitions text[];
    old_status          text;
    new_status          text;
    status_col          text := TG_ARGV[0];
    activity_data       jsonb;
    error_text          text;
    valid_new_statuses  text[];
    entry               jsonb;
    has_activity_col    boolean;
    has_user_id_col     boolean;
    resolved_user_id    text;
BEGIN
    -- Get the workflow id for the specific status column of this table.
    SELECT sw.s_status_workflow_id
    INTO workflow_id
    FROM _tables t
             JOIN s_status_workflows sw
                  ON sw.s_status_workflow_id = ANY (t.s_status_workflow_ids)
    WHERE t.table_name = TG_TABLE_NAME
      AND sw.status_column_name = status_col;

    IF workflow_id IS NULL THEN
        RAISE EXCEPTION 'No workflow for % column %', TG_TABLE_NAME, status_col;
    END IF;

    -- Dynamically extract the OLD and NEW values for the row being updated.
    EXECUTE format('SELECT ($1).%I', status_col) INTO old_status USING OLD;
    EXECUTE format('SELECT ($1).%I', status_col) INTO new_status USING NEW;

    -- If the status did not change, no need to validate
    IF new_status = old_status THEN
        RETURN NEW;
    END IF;

    -- Retrieve the allowed predecessor statuses from s_statuses.
    SELECT transition_from_status_keys
    INTO allowed_transitions
    FROM s_statuses
    WHERE s_status_workflow_id = workflow_id
      AND status_key = new_status;

    IF allowed_transitions IS NOT NULL
        AND NOT (old_status = ANY (allowed_transitions))
    THEN
        -- Determine the valid statuses you can transition to from your starting status.
        SELECT array_agg(status_key)
        INTO valid_new_statuses
        FROM s_statuses
        WHERE s_status_workflow_id = workflow_id
          AND old_status = ANY (transition_from_status_keys);

        error_text := CASE
                          WHEN valid_new_statuses IS NULL THEN
                              format(
                                      'Invalid transition from "%s" to "%s" for workflow %s. "%s" is terminal',
                                      old_status, new_status, workflow_id, old_status
                              )
                          ELSE
                              format(
                                      'Invalid transition from "%s" to "%s" for workflow %s. From status "%s", valid transitions are: "%s"',
                                      old_status, new_status, workflow_id, old_status, valid_new_statuses
                              )
            END;
    END IF;

    -- Raise exception with specific error case
    IF error_text IS NOT NULL THEN
        RAISE EXCEPTION '%', error_text;
    END IF;

    -- Check for activity_log column before building the log and appending
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute
      WHERE attrelid   = TG_RELID
        AND attname    = 'activity_log'
        AND NOT attisdropped
    )
    INTO has_activity_col;

    -- Skip logging but warn the user if the activity_log column is missing
    IF NOT has_activity_col THEN
        RAISE WARNING 'Table "%" has no activity_log column; skipping log append', TG_TABLE_NAME;
        RETURN NEW;
    END IF;

    -- Check for id_updated_by_user column to resolve the app user
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute
      WHERE attrelid   = TG_RELID
        AND attname    = 'id_updated_by_user'
        AND NOT attisdropped
    )
    INTO has_user_id_col;

    IF has_user_id_col THEN
        EXECUTE format('SELECT ($1).id_updated_by_user::text') INTO resolved_user_id USING NEW;
    END IF;

    -- Build the inner activityData
    activity_data := jsonb_build_object(
            'id_user', current_user,
            'timestamp', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSZ'),
            'previous_status', old_status,
            'new_status', new_status
                     );

    -- Build the activity log
    entry := jsonb_build_object(
            'fileId', NULL,
            'userId', resolved_user_id,
            'activityAt', now(),
            'activityId', gen_random_uuid(),
            'activityData', activity_data,
            'activityTags', '[]'::jsonb,
            'activitySource', NULL,
            'activityStatus', NULL,
            'activityDetails', '',
            'activityCategory', 'status_change_log',
            'relatedActivityId', NULL,
            'templateVersionId', NULL
             );

    -- Add or append to the existing activity log with the new entry
    NEW.activity_log :=
            coalesce(NEW.activity_log, '[]'::jsonb)
                || jsonb_build_array(entry);

    RETURN NEW;
END;
$$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

