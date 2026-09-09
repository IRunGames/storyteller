CREATE OR REPLACE FUNCTION _constraint_exists(
    p_table_name TEXT,
    p_constraint_name TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Helper function to check if a constraint exists on a specified table.

- Parameters -
p_table_name: Name of the table to check
p_constraint_name: Name of the constraint to check

- Returns -
BOOLEAN: TRUE if constraint exists, FALSE otherwise
====================================================================
*/
DECLARE
    constraint_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO constraint_count
    FROM information_schema.table_constraints
    WHERE table_name = p_table_name
      AND constraint_name = p_constraint_name;
    
    RETURN constraint_count > 0;
END $$;

CREATE OR REPLACE FUNCTION _add_foreign_key_constraint(
    p_table_name TEXT,
    p_column_name TEXT,
    p_referenced_table TEXT,
    p_referenced_column TEXT,
    p_constraint_name TEXT DEFAULT NULL,
    p_on_delete TEXT DEFAULT 'SET NULL',
    p_on_update TEXT DEFAULT 'CASCADE'
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Helper function to safely add a foreign key constraint to a table.
If the constraint already exists, it will be skipped.

- Parameters -
p_table_name: Name of the table to add constraint to
p_column_name: Name of the column that references foreign table
p_referenced_table: Name of the referenced table
p_referenced_column: Name of the referenced column
p_constraint_name: Name for the constraint (auto-generated if NULL)
p_on_delete: ON DELETE action (default: 'SET NULL')
p_on_update: ON UPDATE action (default: 'CASCADE')

- Returns -
BOOLEAN: TRUE if constraint was added, FALSE if already existed or failed
====================================================================
*/
DECLARE
    constraint_name TEXT;
    constraint_added BOOLEAN := FALSE;
BEGIN
    -- Generate constraint name if not provided
    IF p_constraint_name IS NULL THEN
        constraint_name := format('fk_%s_%s', p_table_name, p_column_name);
    ELSE
        constraint_name := p_constraint_name;
    END IF;
    
    -- Check if constraint already exists
    IF _constraint_exists(p_table_name, constraint_name) THEN
        RAISE NOTICE 'Foreign key constraint "%" already exists on table "%".', 
            constraint_name, p_table_name;
        RETURN FALSE;
    END IF;
    
    -- Add the foreign key constraint
    BEGIN
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I 
             FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE %s ON UPDATE %s',
            p_table_name, constraint_name, p_column_name, 
            p_referenced_table, p_referenced_column, p_on_delete, p_on_update
        );
        
        RAISE NOTICE 'Foreign key constraint "%" added to table "%".', 
            constraint_name, p_table_name;
        constraint_added := TRUE;
        
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'Foreign key constraint "%" already exists on table "%".', 
                constraint_name, p_table_name;
        WHEN OTHERS THEN
            RAISE WARNING 'Failed to add foreign key constraint "%" to table "%": %', 
                constraint_name, p_table_name, SQLERRM;
    END;
    
    RETURN constraint_added;
END $$;

CREATE OR REPLACE FUNCTION _drop_foreign_key_constraint(
    p_table_name TEXT,
    p_constraint_name TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Helper function to safely drop a foreign key constraint from a table.

- Parameters -
p_table_name: Name of the table to drop constraint from
p_constraint_name: Name of the constraint to drop

- Returns -
BOOLEAN: TRUE if constraint was dropped, FALSE if didn't exist
====================================================================
*/
DECLARE
    constraint_dropped BOOLEAN := FALSE;
BEGIN
    -- Check if constraint exists before trying to drop it
    IF NOT _constraint_exists(p_table_name, p_constraint_name) THEN
        RAISE NOTICE 'Foreign key constraint "%" does not exist on table "%".', 
            p_constraint_name, p_table_name;
        RETURN FALSE;
    END IF;
    
    -- Drop the constraint
    BEGIN
        EXECUTE format(
            'ALTER TABLE %I DROP CONSTRAINT %I',
            p_table_name, p_constraint_name
        );
        
        RAISE NOTICE 'Foreign key constraint "%" dropped from table "%".', 
            p_constraint_name, p_table_name;
        constraint_dropped := TRUE;
        
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Failed to drop foreign key constraint "%" from table "%": %', 
                p_constraint_name, p_table_name, SQLERRM;
    END;
    
    RETURN constraint_dropped;
END $$;

CREATE OR REPLACE FUNCTION _ensure_foreign_key(
    p_table_name TEXT,
    p_column_name TEXT,
    p_referenced_table TEXT,
    p_referenced_column TEXT,
    p_on_delete TEXT DEFAULT 'SET NULL',
    p_constraint_name TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Generic helper function to ensure a foreign key constraint exists between any two tables.
Automatically generates constraint names if not provided.

- Parameters -
p_table_name: Name of the source table (contains the foreign key column)
p_column_name: Name of the column in the source table
p_referenced_table: Name of the target/referenced table  
p_referenced_column: Name of the column in the referenced table
p_on_delete: ON DELETE action (default: 'SET NULL')
p_constraint_name: Name for the constraint (auto-generated if NULL)

- Returns -
BOOLEAN: TRUE if constraint was added, FALSE if already existed

- Examples -
_ensure_foreign_key('posts', 'created_by_user_id', 'users', 'user_id')
_ensure_foreign_key('orders', 'customer_id', 'customers', 'id', 'CASCADE')
_ensure_foreign_key('comments', 'post_id', 'posts', 'post_id', 'CASCADE', 'fk_comments_post')
====================================================================
*/
DECLARE
    constraint_name TEXT;
BEGIN
    -- Generate constraint name if not provided
    IF p_constraint_name IS NULL THEN
        constraint_name := format('fk_%s_%s', p_table_name, p_column_name);
    ELSE
        constraint_name := p_constraint_name;
    END IF;
    
    RETURN _add_foreign_key_constraint(
        p_table_name := p_table_name,
        p_column_name := p_column_name,
        p_referenced_table := p_referenced_table,
        p_referenced_column := p_referenced_column,
        p_constraint_name := constraint_name,
        p_on_delete := p_on_delete
    );
END $$;
