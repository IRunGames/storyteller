-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_set_and_update_table_features;

    -- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE _p_set_and_update_table_features(
    p_table_name          TEXT,
    p_timestamps          BOOLEAN   DEFAULT FALSE,
    p_archival            BOOLEAN   DEFAULT FALSE,
    p_user_ids            BOOLEAN   DEFAULT FALSE,
    p_activity_log        BOOLEAN   DEFAULT FALSE,
    p_tags                BOOLEAN   DEFAULT FALSE,
    p_tags_column         TEXT      DEFAULT NULL,
    p_kind_values         TEXT[]    DEFAULT NULL,
    p_kind_column         TEXT      DEFAULT NULL,
    p_status_workflow_ids INTEGER[] DEFAULT NULL,
    p_search_fields       TEXT[]    DEFAULT NULL,
    p_search_field_name   TEXT      DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Does a table's whole `_tables` setup in one call: registers it, records what
it needs, and runs only the procedures those needs call for.

This is the short form of the sequence every `custom/create_<table>_table.sql`
would otherwise spell out by hand. Ported from the formforge project's
`_set_and_update_table_features`, with the switches this database has gained
since: kinds, status workflows and search fields.

- Usage -
  CALL _p_set_and_update_table_features('attachments',
      p_timestamps          := TRUE,
      p_user_ids            := TRUE,
      p_activity_log        := TRUE,
      p_status_workflow_ids := ARRAY[-3],
      p_kind_values         := ARRAY['STORY', 'STORY_SESSION', 'STORY_SCENE']);

- Parameters -
  p_timestamps          created_at / updated_at and the set_updated_at trigger
  p_archival            is_archived / archived_at / id_archived_by_user
  p_user_ids            id_created_by_user / id_updated_by_user and their FKs
  p_activity_log        activity_log JSONB NOT NULL DEFAULT '[]'
  p_tags                a TEXT[] tags column, NOT NULL DEFAULT '{}', with a GIN index
  p_tags_column         that column's name when it is not `tags`
  p_kind_values         the enum values for the table's kind column; builds
                        the column and the type <table>_<column> if absent
  p_kind_column         the kind column's name when it is not `kind`
  p_status_workflow_ids the workflows from s_status_workflows this table runs
  p_search_fields       the columns concatenated into the generated search column
  p_search_field_name   that column's name when it is not `search_text`

- Notes -
The booleans are OR-ed into whatever the table already declares, never
assigned over it. The formforge original assigned, so calling it twice with
different switches silently turned features off; here a second call can only
ever add. Turning a feature off is deliberate work: clear the flag yourself
and drop what it built.

The array parameters are ignored when NULL and replace when given, so passing
one is how you change it and omitting it is how you leave it alone.

There is no p_system_fields. `_tables` carries the flag, but this database has
no `_p_update_tables_system_fields()` to act on it, and a switch with no
procedure behind it is a control that looks like it does something.
====================================================================
*/
DECLARE
    v_timestamps   BOOLEAN;
    v_archival     BOOLEAN;
    v_user_ids     BOOLEAN;
    v_activity_log BOOLEAN;
    v_tags         BOOLEAN;
    v_kind_values  TEXT[];
    v_workflows    INTEGER[];
    v_search       TEXT[];
    v_missing      INTEGER[];
BEGIN
    RAISE NOTICE 'Setting up table features for: %', p_table_name;

    -- Register the table, so the declarations below have a row to land on.
    CALL _p_update_tables();

    IF NOT EXISTS (SELECT 1 FROM _tables WHERE table_name = p_table_name) THEN
        RAISE EXCEPTION
            '% is not present in _tables even after _p_update_tables(), so its '
            'features cannot be set. Does the table exist in schema %?',
            p_table_name, current_schema();
    END IF;

    -- A workflow that has not been seeded would leave status unguarded, so
    -- say so rather than building half a table.
    IF p_status_workflow_ids IS NOT NULL THEN
        SELECT ARRAY_AGG(id)
        INTO v_missing
        FROM unnest(p_status_workflow_ids) AS id
        WHERE NOT EXISTS (
            SELECT 1 FROM s_status_workflows w WHERE w.s_status_workflow_id = id
        );

        IF v_missing IS NOT NULL THEN
            RAISE EXCEPTION
                'Workflow(s) % are not present in s_status_workflows; run the '
                'seed_s_status_workflows and seed_s_statuses migrations first.',
                v_missing;
        END IF;
    END IF;

    UPDATE _tables
    SET needs_timestamps      = COALESCE(needs_timestamps, FALSE) OR p_timestamps,
        needs_archival        = COALESCE(needs_archival, FALSE) OR p_archival,
        needs_user_ids        = COALESCE(needs_user_ids, FALSE) OR p_user_ids,
        needs_activity_log    = COALESCE(needs_activity_log, FALSE) OR p_activity_log,
        needs_tags            = COALESCE(needs_tags, FALSE) OR p_tags,
        tags_column           = COALESCE(p_tags_column, tags_column),
        kind_values           = COALESCE(p_kind_values, kind_values),
        kind_column           = COALESCE(p_kind_column, kind_column),
        s_status_workflow_ids = COALESCE(p_status_workflow_ids, s_status_workflow_ids),
        search_fields         = COALESCE(p_search_fields, search_fields),
        search_field_name     = COALESCE(p_search_field_name, search_field_name),
        updated_at            = NOW()
    WHERE table_name = p_table_name;

    -- Branch on what the table declares now, not on the parameters, so a call
    -- that adds one feature still maintains the ones already there.
    SELECT needs_timestamps, needs_archival, needs_user_ids, needs_activity_log,
           needs_tags, kind_values, s_status_workflow_ids, search_fields
    INTO v_timestamps, v_archival, v_user_ids, v_activity_log,
         v_tags, v_kind_values, v_workflows, v_search
    FROM _tables
    WHERE table_name = p_table_name;

    IF v_timestamps THEN
        RAISE NOTICE 'Applying timestamps...';
        CALL _p_update_tables_timestamps();
    END IF;

    IF v_user_ids THEN
        RAISE NOTICE 'Applying user ids...';
        CALL _p_update_tables_user_ids();
    END IF;

    IF v_archival THEN
        RAISE NOTICE 'Applying archival...';
        CALL _p_update_tables_archives();
    END IF;

    IF v_activity_log THEN
        RAISE NOTICE 'Applying activity log...';
        CALL _p_update_tables_activity_log();
    END IF;

    IF v_tags THEN
        RAISE NOTICE 'Applying tags...';
        CALL _p_update_tables_tags();
    END IF;

    IF v_kind_values IS NOT NULL AND CARDINALITY(v_kind_values) > 0 THEN
        RAISE NOTICE 'Applying kinds...';
        CALL _p_update_tables_kinds();
    END IF;

    -- The workflow procedures come after activity_log: the transition trigger
    -- appends every move to it and expects the column to be there.
    IF v_workflows IS NOT NULL AND CARDINALITY(v_workflows) > 0 THEN
        RAISE NOTICE 'Applying status workflow(s)...';
        CALL _p_update_workflow_constraints();
        CALL _p_update_workflow_columns();
        CALL _p_update_workflow_status_timestamp_triggers();
        CALL _p_attach_workflow_triggers();
        CALL _p_attach_status_transition_triggers();
    END IF;

    -- Search fields last of the builders: a search column may concatenate the
    -- <status>_at columns the workflow procedures have just added.
    IF v_search IS NOT NULL AND CARDINALITY(v_search) > 0 THEN
        RAISE NOTICE 'Applying search fields...';
        CALL _p_update_tables_search_fields();
    END IF;

    CALL _p_update_fk_indexes();

    RAISE NOTICE 'Table features complete for: %', p_table_name;
END;
$$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

