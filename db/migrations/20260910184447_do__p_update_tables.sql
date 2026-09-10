-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_update_tables;

    -- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE _p_update_tables()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Populates and maintains the `_tables` metadata table with schema
details about each base table in the database. This ensures the
metadata is always up-to-date, including information such as
timestamp columns, archival columns, user ID fields, UUID primary
keys, foreign key dependencies, and linked workflows. Additionally,
tracks tables that reference the primary key of each table
(`primary_key_dependants`).

Views are NOT tracked — `_tables` is reserved for base tables only,
since the needs_* / has_* mechanics (column additions, triggers, FK
indexes) only make sense for mutable tables. Any pre-existing VIEW
rows in `_tables` are purged on each run via the DELETE clause below.

- Steps Performed -
1. Retrieve the global setting `use_timestamp_with_timezone` to determine
   the type of timestamp columns.
2. Iterate through all base tables in the current schema, excluding
   `_tables` and backup tables (`__` prefix).
3. Check for the existence and validity of key columns:
   - `created_at` and `updated_at` (timestamps).
   - `archived_at` and `is_archived` (archival).
   - `id_created_by_user` and `id_updated_by_user` (user tracking).
   - Primary key as UUID (if applicable).
4. Identify foreign key dependencies for each table.
5. Identify tables that reference the primary key of the current table.
6. Insert or update metadata for each table in `_tables`.
====================================================================
*/
DECLARE
    -- Logging
    actionName VARCHAR DEFAULT '_update_tables';
    actionVersion VARCHAR DEFAULT '2026-05-28';
    idLog BIGINT := _action_log_start(
        actionName,
        actionVersion,
        '_tables',
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name != '_tables' AND table_name NOT LIKE '\_\_%')
    );

    -- Table-specific variables
    tbl RECORD;
    has_timestamps BOOLEAN;
    has_archival BOOLEAN;
    has_user_ids BOOLEAN;
    has_system_fields BOOLEAN;
    id_is_uuid BOOLEAN;
    foreign_keys TEXT[];
    primary_key_dependants TEXT[];
    use_timestamp_with_timezone BOOLEAN;
    column_definition TEXT;
    primary_key_column TEXT;
    kind_column TEXT;
    kind_udt_name TEXT;
    kind_values TEXT[];

    -- Results tracking
    processed_count BIGINT DEFAULT 0;
    affected_count  BIGINT DEFAULT 0;
BEGIN
    -- Retrieve the `use_timestamp_with_timezone` setting
    PERFORM _action_log_step(idLog, 'Retrieve global settings: use_timestamp_with_timezone', '_global_settings', 0);
    SELECT value::BOOLEAN
    INTO use_timestamp_with_timezone
    FROM _global_settings
    WHERE key = 'timestamp_with_timezone';

    -- Determine the column definition based on the setting.
    --
    -- Spelled the way Postgres reports it, not the short form. This value is
    -- matched against information_schema.data_type below to decide the has_*
    -- flags, and 'timestamp' never equals the reported 'timestamp without time
    -- zone' -- so with the setting off, has_timestamps and has_archival came
    -- out FALSE for tables that did have the columns.
    IF use_timestamp_with_timezone THEN
        column_definition := 'timestamp with time zone';
    ELSE
        column_definition := 'timestamp without time zone';
    END IF;
    PERFORM _action_log_step(idLog, CONCAT('Determined column type: ', column_definition), '_global_settings', 0);

    -- Remove rows in `_tables` whose table no longer exists OR is now a view.
    -- This purges any legacy VIEW entries from earlier versions of this
    -- procedure that tracked views; views are no longer represented in
    -- `_tables` at all.
    DELETE FROM _tables
    WHERE table_name NOT IN (
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
            AND table_type = 'BASE TABLE'
            AND table_name != '_tables'
            AND table_name NOT LIKE '\_\_%'
    );

    -- Loop through base tables only — views are intentionally excluded.
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_type = 'BASE TABLE'
          AND table_name != '_tables'
          AND table_name NOT LIKE '\_\_%'
        ORDER BY table_name ASC
    LOOP
        PERFORM _action_log_step(idLog, CONCAT('Processing table: ', tbl.table_name), tbl.table_name::VARCHAR, 0);

        -- Check if `created_at` and `updated_at` exist with the correct type and default
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = tbl.table_name
            AND column_name = 'created_at'
            AND data_type = column_definition
            AND (
                column_default LIKE 'now%' OR
                column_default LIKE 'clock_timestamp%' OR
                column_default LIKE 'current_timestamp%'
            )
        ) AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = tbl.table_name
            AND column_name = 'updated_at'
            AND data_type = column_definition
            AND (
                column_default LIKE 'now%' OR
                column_default LIKE 'clock_timestamp%' OR
                column_default LIKE 'current_timestamp%'
            )
        ) INTO has_timestamps;

        PERFORM _action_log_step(idLog, CONCAT('Timestamps check for table ', tbl.table_name, ': ', has_timestamps), tbl.table_name::VARCHAR, 0);

        -- Check if `archived_at` and `is_archived` columns exist with the correct types
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = tbl.table_name
              AND column_name = 'archived_at'
              AND data_type = column_definition
        ) AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = tbl.table_name
              AND column_name = 'is_archived'
              AND data_type = 'boolean'
        ) INTO has_archival;

        PERFORM _action_log_step(idLog, CONCAT('Archival columns check for table ', tbl.table_name, ': ', has_archival), tbl.table_name::VARCHAR, 0);

        -- Check if `id_created_by_user` and `id_updated_by_user` exist with correct type
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = tbl.table_name
              AND column_name = 'id_created_by_user'
              AND data_type = 'bigint'
        ) AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = tbl.table_name
              AND column_name = 'id_updated_by_user'
              AND data_type = 'bigint'
        ) INTO has_user_ids;

        PERFORM _action_log_step(idLog, CONCAT('User ID columns check for table ', tbl.table_name, ': ', has_user_ids), tbl.table_name::VARCHAR, 0);

        -- Check if all three system-field columns exist with the correct types.
        -- system_at must match the configured timestamp column definition (with
        -- or without time zone) — same rule the timestamps detector applies.
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = tbl.table_name
              AND column_name = 'system_by'
              AND data_type = 'text'
        ) AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = tbl.table_name
              AND column_name = 'system_at'
              AND data_type = column_definition
        ) AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = tbl.table_name
              AND column_name = 'system_id'
              AND data_type = 'bigint'
        ) INTO has_system_fields;

        PERFORM _action_log_step(idLog, CONCAT('System fields check for table ', tbl.table_name, ': ', has_system_fields), tbl.table_name::VARCHAR, 0);

        -- Determine the primary key column dynamically and check if it is a UUID
        SELECT kcu.column_name
        INTO primary_key_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = tbl.table_name;

        SELECT CASE
            WHEN EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = tbl.table_name
                  AND column_name = primary_key_column
                  AND data_type = 'uuid'
            ) THEN TRUE
            ELSE FALSE
        END INTO id_is_uuid;

        PERFORM _action_log_step(idLog, CONCAT('UUID primary key check for table ', tbl.table_name, ': ', id_is_uuid), tbl.table_name::VARCHAR, 0);

        -- Get foreign keys defined in the current table
        SELECT ARRAY_AGG(DISTINCT ccu.table_name || '.' || ccu.column_name)
        INTO foreign_keys
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
        ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND kcu.table_name = tbl.table_name;

        PERFORM _action_log_step(idLog, CONCAT('Foreign keys for table ', tbl.table_name, ': ', foreign_keys), tbl.table_name::VARCHAR, 0);

        -- Identify tables that reference the current table's primary key
        SELECT ARRAY_AGG(DISTINCT kcu.table_name || '.' || kcu.column_name)
        INTO primary_key_dependants
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
        ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = tbl.table_name
        AND ccu.column_name = primary_key_column;

        PERFORM _action_log_step(idLog, CONCAT('Primary key dependants for table ', tbl.table_name, ': ', primary_key_dependants), tbl.table_name::VARCHAR, 0);

        -- Kind column info
        -- Get enum name + column
        SELECT
            column_name, udt_name INTO kind_column, kind_udt_name
        FROM
            information_schema.columns
        WHERE
            table_name = tbl.table_name
            AND udt_name IN (
                SELECT t.typname
                FROM pg_type t
                JOIN pg_enum e ON t.oid = e.enumtypid
            );
        -- Get enum array
        SELECT ARRAY_AGG(enumlabel ORDER BY enumsortorder) INTO kind_values
        FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = kind_udt_name
        GROUP BY pg_enum.enumtypid;
        PERFORM _action_log_step(idLog, CONCAT('Kind column for table ', tbl.table_name, ': ', kind_column), tbl.table_name::VARCHAR, 0);

        -- Insert or update the table information in `_tables`
        BEGIN
            INSERT INTO _tables (
                table_name, needs_timestamps, has_timestamps,
                needs_archival, has_archival, needs_user_ids,
                has_user_ids, needs_system_fields, has_system_fields,
                id_is_uuid, foreign_key_dependencies,
                primary_key_dependants, needs_fk_indexes,
                created_at, updated_at,
                kind_column, kind_values
            )
            VALUES (
                tbl.table_name,
                has_timestamps,
                has_timestamps,
                has_archival,
                has_archival,
                has_user_ids,
                has_user_ids,
                has_system_fields,
                has_system_fields,
                id_is_uuid,
                COALESCE(foreign_keys, '{}'),
                COALESCE(primary_key_dependants, '{}'),
                TRUE,
                NOW(),
                NOW(),
                kind_column,
                kind_values
            )
            ON CONFLICT (table_name) DO UPDATE
            SET has_timestamps = EXCLUDED.has_timestamps,
                has_archival = EXCLUDED.has_archival,
                has_user_ids = EXCLUDED.has_user_ids,
                has_system_fields = EXCLUDED.has_system_fields,
                id_is_uuid = EXCLUDED.id_is_uuid,
                foreign_key_dependencies = EXCLUDED.foreign_key_dependencies,
                primary_key_dependants = EXCLUDED.primary_key_dependants,
                updated_at = NOW(),
                kind_column = EXCLUDED.kind_column,
                kind_values = EXCLUDED.kind_values;

            -- Log successful table update
            PERFORM _action_log_step(idLog, CONCAT('Updated metadata for table: ', tbl.table_name), tbl.table_name::VARCHAR, 1);
            processed_count := processed_count + 1;
            affected_count := affected_count + 1;

        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error updating table %: %', tbl.table_name, SQLERRM;
            INSERT INTO _err (error_text, area)
            VALUES (CONCAT('Error updating table: ', tbl.table_name, ' - ', SQLERRM), '_update_tables');
        END;
    END LOOP;

    -- End the action log
    PERFORM _action_log_end(idLog, processed_count, affected_count);
END $$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

