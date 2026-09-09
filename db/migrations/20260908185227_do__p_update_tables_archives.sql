-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_update_tables_archives;

    -- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE _p_update_tables_archives()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Ensures that all tables marked as needing archival (`needs_archival = TRUE`) 
in the `_tables` metadata table have the correct `archived_at`,
`archived_by_user_id`, and `is_archived` columns with proper types.
Additionally, a trigger is attached to automatically
update the `archived_at` column when `is_archived` changes, and another trigger
is attached to automatically set `archived_by_user_id` to NULL when `is_archived`
transitions from TRUE to FALSE.

- Steps Performed -
1. Retrieve the global setting `timestamp_with_timezone` to determine the type of 
   `archived_at` columns (either `TIMESTAMP WITH TIME ZONE` or `TIMESTAMP`).
2. Iterate through all tables in the `_tables` metadata table where `needs_archival = TRUE`.
3. For each table:
   a. Ensure the `archived_at` column exists and is of the correct type.
   b. Ensure the `archived_by_user_id` column exists and is of the correct type (`UUID`).
   c. Ensure the `is_archived` column exists and is of the correct type (`BOOLEAN`).
   d. Drop and recreate any columns that are incorrectly defined.
   e. Add any missing columns.
4. Attach a trigger to update the `archived_at` column automatically when 
   `is_archived` is updated.
5. Attach a trigger to NULL the `archived_by_user_id` column automatically when
   `is_archived` transitions from TRUE to FALSE.
6. Update the `_tables` metadata to reflect changes.
====================================================================
*/
DECLARE
    tbl RECORD;
    column_type TEXT;
    use_timestamp_with_timezone BOOLEAN;
    column_definition TEXT;
BEGIN
    -- Retrieve the `timestamp_with_timezone` setting
    RAISE NOTICE 'Retrieving global setting for timestamp with timezone...';
    SELECT value::BOOLEAN
    INTO use_timestamp_with_timezone
    FROM _global_settings
    WHERE key = 'timestamp_with_timezone';

    RAISE NOTICE 'Use timestamp with time zone: %', use_timestamp_with_timezone;

    -- Determine the column type based on the setting
    IF use_timestamp_with_timezone THEN
        column_definition := 'timestamp with time zone';
    ELSE
        column_definition := 'timestamp';
    END IF;

    -- Loop through tables where needs_archival is TRUE
    FOR tbl IN
        SELECT table_name
        FROM _tables
        WHERE needs_archival = TRUE
    LOOP
        RAISE NOTICE 'Processing table: %', tbl.table_name;

        -- Check `archived_at` column
        RAISE NOTICE 'Checking "archived_at" column in table: %', tbl.table_name;
        SELECT data_type
        INTO column_type
        FROM information_schema.columns
        WHERE table_name = tbl.table_name
          AND column_name = 'archived_at';

        -- If `archived_at` exists but is not of the desired type, drop and recreate it
        IF column_type IS NOT NULL AND column_type != column_definition THEN
            RAISE NOTICE '"archived_at" column exists but is of type %. Updating to %.', column_type, column_definition;
            EXECUTE format(
                'ALTER TABLE %I DROP COLUMN archived_at',
                tbl.table_name
            );
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN archived_at %s',
                tbl.table_name, column_definition
            );
            RAISE NOTICE '"archived_at" column updated in table: %', tbl.table_name;
        ELSIF column_type IS NULL THEN
            -- If `archived_at` does not exist, add it
            RAISE NOTICE '"archived_at" column does not exist in table: %. Adding it as %.', tbl.table_name, column_definition;
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN archived_at %s',
                tbl.table_name, column_definition
            );
            RAISE NOTICE '"archived_at" column added to table: %', tbl.table_name;
        ELSE
            RAISE NOTICE '"archived_at" column already exists and is of the correct type in table: %', tbl.table_name;
        END IF;

        -- archived_by_user_id (UUID, nullable)
        RAISE NOTICE 'Checking "archived_by_user_id" column in table: %', tbl.table_name;
        SELECT data_type
        INTO column_type
        FROM information_schema.columns
        WHERE table_name = tbl.table_name
          AND column_name = 'archived_by_user_id';

        IF column_type IS NULL THEN
            RAISE NOTICE '"archived_by_user_id" column does not exist in table: %. Adding it as UUID.', tbl.table_name;
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN archived_by_user_id UUID',
                tbl.table_name
            );
            RAISE NOTICE '"archived_by_user_id" column added to table: %', tbl.table_name;
        ELSIF UPPER(column_type) <> 'UUID' THEN
            RAISE NOTICE '"archived_by_user_id" column exists but is of type %. Updating to UUID.', column_type;
            BEGIN
                EXECUTE format(
                  'ALTER TABLE %I ALTER COLUMN archived_by_user_id TYPE uuid USING archived_by_user_id::uuid',
                  tbl.table_name);
            EXCEPTION WHEN datatype_mismatch OR cannot_coerce OR invalid_text_representation THEN
                RAISE NOTICE 'Could not migrate % to UUID. Recreating column destructively.', column_type;
                EXECUTE format('ALTER TABLE %I DROP COLUMN archived_by_user_id',
                               tbl.table_name);
                EXECUTE format('ALTER TABLE %I ADD COLUMN archived_by_user_id uuid',
                               tbl.table_name);
            END;
            RAISE NOTICE '"archived_by_user_id" column updated in table: %', tbl.table_name;
        ELSE
            RAISE NOTICE '"archived_by_user_id" column already exists and is of the correct type in table: %', tbl.table_name;
        END IF;

        -- Ensure a single, named FK constraint to users(user_id) with
        -- ON DELETE SET NULL. archived_by_user_id is an authorship/audit
        -- reference (VULCAN-1082): purging a user must null the reference, not
        -- delete the archived record. _ensure_foreign_key is idempotent and
        -- names the constraint fk_<table>_archived_by_user_id, so this no longer
        -- accumulates duplicate unnamed FKs on every run.
        RAISE NOTICE 'Ensuring FK %(archived_by_user_id) -> users(user_id) ON DELETE SET NULL...', tbl.table_name;
        PERFORM _ensure_foreign_key(tbl.table_name, 'archived_by_user_id', 'users', 'user_id', 'SET NULL');

        -- Check `is_archived` column
        RAISE NOTICE 'Checking "is_archived" column in table: %', tbl.table_name;
        SELECT data_type
        INTO column_type
        FROM information_schema.columns
        WHERE table_name = tbl.table_name
          AND column_name = 'is_archived';

        -- If `is_archived` exists but is not BOOLEAN, drop and recreate it
        IF column_type IS NOT NULL AND column_type != 'boolean' THEN
            RAISE NOTICE '"is_archived" column exists but is not BOOLEAN. Updating to BOOLEAN.';
            EXECUTE format(
                'ALTER TABLE %I DROP COLUMN is_archived',
                tbl.table_name
            );
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN is_archived BOOLEAN DEFAULT FALSE NOT NULL',
                tbl.table_name
            );
            RAISE NOTICE '"is_archived" column updated in table: %', tbl.table_name;
        ELSIF column_type IS NULL THEN
            -- If `is_archived` does not exist, add it
            RAISE NOTICE '"is_archived" column does not exist in table: %. Adding it.', tbl.table_name;
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN is_archived BOOLEAN DEFAULT FALSE NOT NULL',
                tbl.table_name
            );
            RAISE NOTICE '"is_archived" column added to table: %', tbl.table_name;
        ELSE
            RAISE NOTICE '"is_archived" column already exists and is of the correct type in table: %', tbl.table_name;
        END IF;

        -- Attach the trigger to nullify `archived_by_user_id`
        -- when `is_archived` is changed to FALSE
        RAISE NOTICE 'Attaching trigger clear_archived_by_on_unarchive to table: %', tbl.table_name;
        EXECUTE format(
            'CREATE OR REPLACE TRIGGER clear_archived_by_on_unarchive
             BEFORE UPDATE OF is_archived ON %I
             FOR EACH ROW
             WHEN (OLD.is_archived = TRUE AND NEW.is_archived = FALSE)
             EXECUTE FUNCTION tr_clear_archived_by()',
            tbl.table_name
        );
        RAISE NOTICE 'Trigger clear_archived_by_on_unarchive attached to table: %', tbl.table_name;

        -- Attach the trigger to update `archived_at` when `is_archived` changes
        RAISE NOTICE 'Attaching trigger set_archived_at to table: %', tbl.table_name;
        EXECUTE format(
            'CREATE OR REPLACE TRIGGER set_archived_at
             BEFORE UPDATE OF is_archived ON %I
             FOR EACH ROW
             WHEN (OLD.is_archived IS DISTINCT FROM NEW.is_archived)
             EXECUTE FUNCTION tr_update_archived_at()',
            tbl.table_name
        );
        RAISE NOTICE 'Trigger set_archived_at attached to table: %', tbl.table_name;

        -- Update `_tables` metadata
        RAISE NOTICE 'Updating metadata in "_tables" for table: %', tbl.table_name;
        UPDATE _tables
        SET has_archival = TRUE,
            updated_at = NOW()
        WHERE table_name = tbl.table_name;
        RAISE NOTICE 'Metadata updated for table: %', tbl.table_name;
    END LOOP;

    RAISE NOTICE 'Archival updates completed successfully.';
END $$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

-- NOPE / Optional! ------------------------------------------------------------

