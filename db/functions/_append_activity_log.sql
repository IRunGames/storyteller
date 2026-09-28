/*
====================================================================
- Description -
Appends one entry to any table's activity_log field, for one record.

Ported from the formforge project with three changes, each of which was a
bug in this database:

1. The primary key is read from the catalog rather than guessed from the
   table's name. The original derived `<singular>_id` by regex, which is
   formforge's convention and the reverse of this schema's `id_<singular>`;
   worse, no regex gets there — `stories` singularises to `storie`, and the
   column is `id_story`. Asking pg_index removes the guess entirely and works
   whatever a table is called.
2. The user lookup reads `users.id_user` and `users.name`. The original read
   `users.user_id` and `users.full_name`, neither of which exists here, so
   the name never resolved and the inner handler silently swallowed it.
3. A composite primary key is refused rather than silently updating the wrong
   row, which the original's single-column assumption would have done.

The entry itself comes from `_build_activity_log`, so these read identically
to the entries `validate_status_transition` and `_log_table_activity` write.

Returns the new activityId, or NULL when the append failed — failures are
recorded in `_err` rather than raised, so logging can never be what breaks
the statement that was being logged.
====================================================================
*/

CREATE OR REPLACE FUNCTION _append_activity_log(
    table_name TEXT,
    field_name TEXT,
    record_id TEXT,
    activity_category VARCHAR,
    activity_details TEXT DEFAULT '',
    activity_status VARCHAR DEFAULT NULL,
    activity_source VARCHAR DEFAULT NULL,
    activity_tags VARCHAR[] DEFAULT '{}'::VARCHAR[],
    user_id TEXT DEFAULT NULL,
    template_version_id uuid DEFAULT NULL,
    file_id uuid DEFAULT NULL,
    related_activity_id uuid DEFAULT NULL,
    activity_data jsonb DEFAULT NULL
)
    RETURNS TEXT
AS
$func$
DECLARE
    v_state              TEXT;
    v_msg                TEXT;
    v_detail             TEXT;
    v_hint               TEXT;
    v_context            TEXT;

    actionname           VARCHAR DEFAULT '_append_activity_log';
    actionversion        VARCHAR DEFAULT '2026-09-28';

    current_activity_log jsonb;
    enriched_data        jsonb;
    resolved_user_name   TEXT;
    new_activity         jsonb;
    new_activity_id      uuid;
    build_result         record;
    primary_key_column   TEXT;
    key_column_count     INT;
    sql_query            TEXT;
BEGIN
    -- The table's actual primary key, from the catalog. No naming convention
    -- is assumed, so this is correct for id_story, _table_id and anything else.
    SELECT a.attname, COUNT(*) OVER ()
    INTO primary_key_column, key_column_count
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = table_name::regclass
      AND i.indisprimary;

    IF primary_key_column IS NULL THEN
        RAISE EXCEPTION 'Table % has no primary key, so a row cannot be addressed', table_name;
    END IF;

    IF key_column_count > 1 THEN
        RAISE EXCEPTION 'Table % has a composite primary key; _append_activity_log addresses one column',
            table_name;
    END IF;

    sql_query := FORMAT('SELECT %I FROM %I WHERE %I = %s',
                        field_name, table_name, primary_key_column, QUOTE_LITERAL(record_id));
    EXECUTE sql_query INTO current_activity_log;

    -- Resolve the display name once, only when there is something to look up.
    -- Function-qualified to disambiguate the parameter from the column.
    IF _append_activity_log.user_id IS NOT NULL AND _append_activity_log.user_id <> '' THEN
        BEGIN
            SELECT NULLIF(TRIM(u.name), '')
            INTO resolved_user_name
            FROM users u
            WHERE u.id_user::TEXT = _append_activity_log.user_id;
        EXCEPTION WHEN OTHERS THEN
            resolved_user_name := NULL;
        END;
    END IF;

    -- A caller-provided userName wins, so backfills can stamp historical names.
    enriched_data := COALESCE(activity_data, '{}'::jsonb);
    IF JSONB_TYPEOF(enriched_data) <> 'object' THEN
        enriched_data := '{}'::jsonb;
    END IF;
    IF resolved_user_name IS NOT NULL
       AND NULLIF(TRIM(COALESCE(enriched_data ->> 'userName', '')), '') IS NULL
    THEN
        enriched_data := enriched_data || JSONB_BUILD_OBJECT('userName', resolved_user_name);
    END IF;

    SELECT * INTO build_result FROM _build_activity_log(
        activity_category, current_activity_log, activity_details, activity_status,
        activity_source, activity_tags, user_id, template_version_id, file_id,
        related_activity_id, enriched_data
    );

    new_activity := build_result.activity_log;
    new_activity_id := build_result.activity_id;

    sql_query := FORMAT('UPDATE %I SET %I = %L::jsonb WHERE %I = %s',
                        table_name, field_name, new_activity,
                        primary_key_column, QUOTE_LITERAL(record_id));
    EXECUTE sql_query;

    RETURN new_activity_id::TEXT;

EXCEPTION
    WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
            v_state = RETURNED_SQLSTATE,
            v_msg = MESSAGE_TEXT,
            v_detail = PG_EXCEPTION_DETAIL,
            v_hint = PG_EXCEPTION_HINT,
            v_context = PG_EXCEPTION_CONTEXT;

        INSERT INTO _err (error_text, area)
        VALUES (CONCAT('Error in ', actionname, ' [', actionversion, ']', v_msg, v_detail), actionname);

        RETURN NULL;
END;
$func$ LANGUAGE plpgsql;
