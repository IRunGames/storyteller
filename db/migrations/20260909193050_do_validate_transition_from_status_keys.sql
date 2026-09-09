-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    -- No DROP: tr_validate_transition_from_status_keys on s_statuses depends on
    -- this function, so DROP FUNCTION fails with a dependency error. The file
    -- below re-creates the trigger, and CREATE OR REPLACE keeps it valid.

    -- ------------------------------------------------------------
/*
====================================================================
- Description -
Guards the `s_statuses` metadata table itself. Every key listed in
`transition_from_status_keys` must name a status that belongs to the same
workflow, so a workflow cannot be seeded with a transition pointing at a
status that does not exist (or belongs to a different workflow).

This validates the *definition* of a workflow. The companion function
`validate_status_transition` validates individual row transitions on the
tables a workflow is attached to.

- Steps Performed -
1. Fires BEFORE INSERT OR UPDATE on `s_statuses`.
2. Skips rows whose `transition_from_status_keys` is NULL.
3. For each key in the array, confirms a matching `status_key` exists in
   `s_statuses` for the same `s_status_workflow_id`.
4. Raises an exception naming the offending key and the valid statuses.

- Note -
The trigger is attached at the bottom of this file rather than by
`_p_attach_status_transition_triggers`, because it guards a fixed metadata
table rather than a workflow-bearing table discovered at run time.
====================================================================
*/

CREATE OR REPLACE FUNCTION validate_transition_from_status_keys() RETURNS trigger AS $$
DECLARE
    key TEXT;
    cnt INT;
    valid_statuses TEXT[];
BEGIN
    IF NEW.transition_from_status_keys IS NOT NULL THEN
        -- Retrieve all valid status keys for the current workflow
        SELECT array_agg(status_key)
          INTO valid_statuses
          FROM s_statuses
         WHERE s_status_workflow_id = NEW.s_status_workflow_id;

        FOREACH key IN ARRAY NEW.transition_from_status_keys LOOP
            SELECT COUNT(*) INTO cnt
              FROM s_statuses
             WHERE s_status_workflow_id = NEW.s_status_workflow_id
               AND status_key = key;
            IF cnt = 0 THEN
                RAISE EXCEPTION
                  'Invalid transition_from_status_keys: status "%" not part of workflow %. Valid statuses: %',
                  key, NEW.s_status_workflow_id, valid_statuses;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate transition_from_status_keys before INSERT or UPDATE on s_statuses
DROP TRIGGER IF EXISTS tr_validate_transition_from_status_keys ON s_statuses;
CREATE TRIGGER tr_validate_transition_from_status_keys
BEFORE INSERT OR UPDATE ON s_statuses
FOR EACH ROW EXECUTE FUNCTION validate_transition_from_status_keys();
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

