-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS _column_type_helper;

    -- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION _get_column_type(
    p_table_name TEXT,
    p_column_name TEXT
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Helper function to get the data type of a column in a specified table.
Returns NULL if the column does not exist.

- Parameters -
p_table_name: Name of the table to check
p_column_name: Name of the column to check

- Returns -
TEXT: The data type of the column, or NULL if column doesn't exist
====================================================================
*/
DECLARE
    column_data_type TEXT;
BEGIN
    SELECT data_type
    INTO column_data_type
    FROM information_schema.columns
    WHERE table_name = p_table_name
      AND column_name = p_column_name;
    
    RETURN column_data_type;
END $$;


CREATE OR REPLACE FUNCTION _ensure_column_type(
    p_table_name TEXT,
    p_column_name TEXT,
    p_expected_type TEXT,
    p_default_value TEXT DEFAULT 'NULL'
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Helper function to ensure a column exists with the correct data type.
If the column doesn't exist, it creates it.
If the column exists with wrong type, it drops and recreates it.

- Parameters -
p_table_name: Name of the table
p_column_name: Name of the column
p_expected_type: Expected data type (e.g., 'UUID', 'BIGINT')
p_default_value: Default value for the column (default: 'NULL')

- Returns -
BOOLEAN: TRUE if column was created/updated, FALSE if no changes needed
====================================================================
*/
DECLARE
    current_type TEXT;
    column_changed BOOLEAN := FALSE;
BEGIN
    current_type := _get_column_type(p_table_name, p_column_name);
    
    -- Column doesn't exist, create it
    IF current_type IS NULL THEN
        RAISE NOTICE 'Column "%" does not exist in table "%. Adding column with type %.', 
            p_column_name, p_table_name, p_expected_type;
        
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN %I %s DEFAULT %s',
            p_table_name, p_column_name, p_expected_type, p_default_value
        );
        
        RAISE NOTICE 'Column "%" added to table "%".', p_column_name, p_table_name;
        column_changed := TRUE;
        
    -- Column exists but wrong type, recreate it
    ELSIF current_type != lower(p_expected_type) THEN
        RAISE NOTICE 'Column "%" exists in table "%" but is type "%" instead of "%. Updating column type.', 
            p_column_name, p_table_name, current_type, p_expected_type;
        
        EXECUTE format(
            'ALTER TABLE %I DROP COLUMN %I',
            p_table_name, p_column_name
        );
        
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN %I %s DEFAULT %s',
            p_table_name, p_column_name, p_expected_type, p_default_value
        );
        
        RAISE NOTICE 'Column "%" updated in table "%".', p_column_name, p_table_name;
        column_changed := TRUE;
        
    ELSE
        RAISE NOTICE 'Column "%" already exists with correct type "%" in table "%".', 
            p_column_name, p_expected_type, p_table_name;
    END IF;
    
    RETURN column_changed;
END $$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

