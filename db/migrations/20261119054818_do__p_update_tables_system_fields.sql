-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_update_tables_system_fields;

    -- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE _p_update_tables_system_fields()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Ensures that all tables flagged with `needs_system_fields = TRUE` in the
`_tables` metadata table have the three system-field columns:

  system_by   TEXT
  system_at   timestamp, with or without time zone per the global setting
              `timestamp_with_timezone`, the same as created_at and updated_at
  system_id   INTEGER

Each is added nullable and without a default; nothing here fills them in.
These are the types `_p_update_tables` looks for when it sets
`has_system_fields`, so a table built here is recognised on every later run.

- Steps Performed -
1. Read the timestamp setting to decide system_at's type.
2. Iterate through all tables where `needs_system_fields = TRUE`.
3. For each table:
   a. If any of the three columns already exists with another type, stop
      for that table: log the error and set `has_system_fields = FALSE`.
   b. Otherwise add whichever of the three are missing.
4. Set `has_system_fields = TRUE` on success.

- Notes -
A column of another type is reported, never dropped and re-added: it may hold
values, and converting them is a decision for whoever made it, not for a
procedure every migration runs. All three are checked before any is added, so
a table that fails is left exactly as it was.
====================================================================
*/
DECLARE
    tbl RECORD;
    use_timestamp_with_timezone BOOLEAN;
    column_definition TEXT;
    column_names CONSTANT TEXT[] := ARRAY['system_by', 'system_at', 'system_id'];
    column_types TEXT[];
    i INTEGER;
BEGIN
    RAISE NOTICE 'Starting procedure "_p_update_tables_system_fields".';

    SELECT value::BOOLEAN
    INTO use_timestamp_with_timezone
    FROM _global_settings
    WHERE key = 'timestamp_with_timezone';

    -- Spelled the way Postgres reports it, which is how _p_update_tables
    -- compares it.
    IF use_timestamp_with_timezone THEN
        column_definition := 'timestamp with time zone';
    ELSE
        column_definition := 'timestamp without time zone';
    END IF;

    column_types := ARRAY['text', column_definition, 'integer'];

    FOR tbl IN
        SELECT table_name
        FROM _tables
        WHERE needs_system_fields = TRUE
    LOOP
        RAISE NOTICE 'Processing table: %', tbl.table_name;

        BEGIN
            FOR i IN 1 .. array_length(column_names, 1) LOOP
                IF _column_exists(tbl.table_name, column_names[i])
                   AND NOT _column_type_exists(tbl.table_name, column_names[i], column_types[i]) THEN
                    RAISE EXCEPTION '%.% is %, not %; convert it by hand',
                        tbl.table_name, column_names[i],
                        _column_data_type(tbl.table_name, column_names[i]), column_types[i];
                END IF;
            END LOOP;

            FOR i IN 1 .. array_length(column_names, 1) LOOP
                IF NOT _column_exists(tbl.table_name, column_names[i]) THEN
                    RAISE NOTICE 'Adding % to table: %', column_names[i], tbl.table_name;
                    EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s',
                                   tbl.table_name, column_names[i], column_types[i]);
                    PERFORM _log_table_activity(tbl.table_name, 'success', 'create_column',
                        jsonb_build_object('procedure', '_p_update_tables_system_fields',
                                           'feature', 'system_fields', 'target', column_names[i],
                                           'detail', column_types[i]));
                END IF;
            END LOOP;

            UPDATE _tables
            SET has_system_fields = TRUE,
                updated_at = NOW()
            WHERE table_name = tbl.table_name;
            RAISE NOTICE 'System fields configured for table: %', tbl.table_name;

        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to configure system fields for table: %. Error: %', tbl.table_name, SQLERRM;
            PERFORM _log_table_activity(tbl.table_name, 'error', 'configure_system_fields',
                jsonb_build_object('procedure', '_p_update_tables_system_fields',
                                   'feature', 'system_fields', 'detail', SQLERRM));
            UPDATE _tables
            SET has_system_fields = FALSE,
                updated_at = NOW()
            WHERE table_name = tbl.table_name;
        END;
    END LOOP;

    RAISE NOTICE 'Procedure "_p_update_tables_system_fields" completed.';
END $$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

