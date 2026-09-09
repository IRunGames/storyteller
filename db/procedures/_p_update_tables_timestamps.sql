CREATE OR REPLACE PROCEDURE _p_update_tables_timestamps()
LANGUAGE plpgsql
AS $procedure$
/*
====================================================================
- Description -
Ensures all tables flagged with `needs_timestamps` in `_tables` have 
proper `created_at` and `updated_at` columns with the correct type and 
default value. Also attaches a trigger to maintain the `updated_at` 
column whenever a row is updated.

- Steps Performed -
1. Retrieve the global setting `use_timestamp_with_timezone` to determine 
   the type of timestamp columns (`timestamp` vs. `timestamp with time zone`).
2. Iterate through tables flagged with `needs_timestamps = TRUE` in `_tables`.
3. Validate or recreate the `created_at` column with the appropriate type 
   and default value.
4. Validate or recreate the `updated_at` column with the appropriate type 
   and default value.
5. Attach a `BEFORE UPDATE` trigger to the table for managing the 
   `updated_at` column automatically.
6. Update the metadata in `_tables` to indicate that the table now has 
   timestamp columns.
====================================================================
*/
DECLARE
    tbl RECORD;
    column_type TEXT;
    default_value TEXT;
    use_timestamp_with_timezone BOOLEAN;
    column_definition TEXT;
BEGIN
    RAISE NOTICE 'Procedure "_p_update_tables_timestamps" started.';

    -- Retrieve the `use_timestamp_with_timezone` setting
    SELECT value::BOOLEAN
    INTO use_timestamp_with_timezone
    FROM _global_settings
    WHERE key = 'timestamp_with_timezone';

    -- Determine the column type based on the setting
    IF use_timestamp_with_timezone THEN
        column_definition := 'timestamp with time zone';
    ELSE
        column_definition := 'timestamp';
    END IF;

    -- Loop through tables where needs_timestamps = TRUE
    FOR tbl IN
        SELECT table_name
        FROM _tables
        WHERE needs_timestamps = TRUE
    LOOP
        -- Check `created_at` column type and default
        SELECT data_type, column_default
        INTO column_type, default_value
        FROM information_schema.columns
        WHERE table_name = tbl.table_name
          AND column_name = 'created_at';

        -- Recreate `created_at` if it doesn't meet requirements or doesn't exist
        IF column_type IS NULL OR column_type != column_definition OR default_value IS DISTINCT FROM 'now()' THEN
            IF column_type IS NOT NULL THEN
                RAISE NOTICE '"created_at" column exists in table % but is incorrect. Dropping and recreating.', tbl.table_name;
                EXECUTE format(
                    'ALTER TABLE IF EXISTS %I DROP COLUMN created_at',
                    tbl.table_name
                );
            ELSE
                RAISE NOTICE '"created_at" column does not exist in table %. Adding column.', tbl.table_name;
            END IF;

            -- Add the column with the correct type and default
            EXECUTE format(
                'ALTER TABLE IF EXISTS %I ADD COLUMN created_at %s',
                tbl.table_name, CONCAT(column_definition, ' DEFAULT now()')
            );
        ELSE
            RAISE NOTICE '"created_at" column in table % already meets requirements.', tbl.table_name;
        END IF;

        -- Check `updated_at` column type and default
        SELECT data_type, column_default
        INTO column_type, default_value
        FROM information_schema.columns
        WHERE table_name = tbl.table_name
          AND column_name = 'updated_at';

        -- Recreate `updated_at` if it doesn't meet requirements or doesn't exist
        IF column_type IS NULL OR column_type != column_definition OR default_value IS DISTINCT FROM 'now()' THEN
            IF column_type IS NOT NULL THEN
                RAISE NOTICE '"updated_at" column exists in table % but is incorrect. Dropping and recreating.', tbl.table_name;
                EXECUTE format(
                    'ALTER TABLE IF EXISTS %I DROP COLUMN updated_at',
                    tbl.table_name
                );
            ELSE
                RAISE NOTICE '"updated_at" column does not exist in table %. Adding column.', tbl.table_name;
            END IF;

            EXECUTE format(
                'ALTER TABLE IF EXISTS %I ADD COLUMN updated_at %s',
                tbl.table_name, CONCAT(column_definition, ' DEFAULT now()')
            );
        ELSE
            RAISE NOTICE '"updated_at" column in table % already meets requirements.', tbl.table_name;
        END IF;

        -- Attach the `updated_at` trigger
        RAISE NOTICE 'Ensuring trigger for "updated_at" column in table %.', tbl.table_name;
        EXECUTE format(
            'CREATE OR REPLACE TRIGGER set_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW
             EXECUTE FUNCTION tr_update_updated_at()',
            tbl.table_name
        );

        -- Update the `has_timestamps` flag to TRUE
        RAISE NOTICE 'Updating metadata for table % to reflect timestamp handling.', tbl.table_name;
        UPDATE _tables
        SET has_timestamps = TRUE,
            updated_at = NOW()
        WHERE table_name = tbl.table_name;
    END LOOP;

    RAISE NOTICE 'Procedure "_p_update_tables_timestamps" completed successfully.';
END $procedure$;