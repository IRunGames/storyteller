-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE PROCEDURE', clock_timestamp();

    DROP PROCEDURE IF EXISTS _p_update_tables_kinds;

    -- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE _p_update_tables_kinds()
LANGUAGE plpgsql
AS $$
/*
====================================================================
- Description -
Builds the kind column, and the enum type behind it, for every table that
declares `kind_values` in `_tables`.

A kind is declared, not discovered, the same way a status workflow is: the
values are written to the metatable and this procedure makes the database
match them. `_p_update_tables()` only records what is already there, which is
why the two run in that order — it creates the `_tables` row this declaration
lands on.

- Steps Performed -
1. Iterate through every table whose `kind_values` is a non-empty array.
2. For each table:
   a. The column is the one `kind_column` names, or `kind` by default.
   b. If it does not exist, create the enum type `<table>_<column>` from the
      declared values and add the column.
   c. If it exists, it must be an enum; any declared value the type lacks is
      added to it.
3. Write the resolved column name and the enum's actual values back to
   `_tables`.

- Notes -
The enum type is named `<table>_<column>` rather than a singularised form:
turning `stories` into `story` in SQL needs rules that break on the first
irregular name.

`ALTER TYPE ... ADD VALUE` only ever grows a type — an enum value cannot be
removed — and Postgres will not let a value added here be *used* in the same
transaction unless the type was created in it. dbmate wraps each migration in
one, so a migration that adds a kind and then inserts rows using it must split
in two, or declare `-- migrate:up transaction:false`.

The column is added nullable, as it must be for a table that may already hold
rows. A table that wants it mandatory follows with its own
`ALTER TABLE ... ALTER COLUMN ... SET NOT NULL`.
====================================================================
*/
DECLARE
    tbl RECORD;
    -- v_ prefixes throughout: these names are also columns of _tables, and an
    -- unprefixed `kind_column` in the UPDATE below would be ambiguous.
    v_kind_column TEXT;
    v_kind_type_name TEXT;
    v_kind_udt_name TEXT;
    v_kind_value TEXT;
    v_kind_values TEXT[];
    v_values_before TEXT[];
    v_values_added TEXT[];
BEGIN
    RAISE NOTICE 'Starting procedure "_p_update_tables_kinds".';

    FOR tbl IN
        SELECT table_name, kind_column, kind_values
        FROM _tables
        WHERE kind_values IS NOT NULL
          AND CARDINALITY(kind_values) > 0
    LOOP
        RAISE NOTICE 'Processing table: %', tbl.table_name;

      BEGIN
        v_kind_column := COALESCE(tbl.kind_column, 'kind');
        v_kind_type_name := tbl.table_name || '_' || v_kind_column;

        SELECT c.udt_name
        INTO v_kind_udt_name
        FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = tbl.table_name
          AND c.column_name = v_kind_column;

        IF v_kind_udt_name IS NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM pg_type
                WHERE typname = v_kind_type_name
                  AND typnamespace = current_schema()::regnamespace
            ) THEN
                RAISE NOTICE 'Creating enum type % for table %', v_kind_type_name, tbl.table_name;
                EXECUTE format(
                    'CREATE TYPE %I AS ENUM (%s)',
                    v_kind_type_name,
                    (SELECT string_agg(quote_literal(value), ', ')
                     FROM unnest(tbl.kind_values) AS value)
                );
                PERFORM _log_table_activity(tbl.table_name, 'success', 'create_type',
                    jsonb_build_object('procedure', '_p_update_tables_kinds',
                                       'feature', 'kind', 'target', v_kind_type_name,
                                       'detail', array_to_string(tbl.kind_values, ', ')));
            END IF;

            RAISE NOTICE 'Adding kind column % to table %', v_kind_column, tbl.table_name;
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I %I',
                tbl.table_name, v_kind_column, v_kind_type_name
            );
            v_kind_udt_name := v_kind_type_name;
            PERFORM _log_table_activity(tbl.table_name, 'success', 'create_column',
                jsonb_build_object('procedure', '_p_update_tables_kinds',
                                   'feature', 'kind', 'target', v_kind_column,
                                   'detail', v_kind_type_name));
        ELSE
            IF NOT EXISTS (
                SELECT 1
                FROM pg_type ty
                JOIN pg_enum e ON e.enumtypid = ty.oid
                WHERE ty.typname = v_kind_udt_name
                  AND ty.typnamespace = current_schema()::regnamespace
            ) THEN
                RAISE EXCEPTION
                    'Table %.% names % as its kind column, but that column is % '
                    'and not an enum type.',
                    current_schema(), tbl.table_name, v_kind_column, v_kind_udt_name;
            END IF;

            -- ADD VALUE IF NOT EXISTS will not say whether it added anything,
            -- so the type's values are read before and diffed after. Declaring
            -- values that are already there is a no-op and logs nothing.
            SELECT ARRAY_AGG(enumlabel ORDER BY enumsortorder)
            INTO v_values_before
            FROM pg_enum
            JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
            WHERE pg_type.typname = v_kind_udt_name
              AND pg_type.typnamespace = current_schema()::regnamespace
            GROUP BY pg_enum.enumtypid;

            FOREACH v_kind_value IN ARRAY tbl.kind_values
            LOOP
                EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L',
                               v_kind_udt_name, v_kind_value);
            END LOOP;

            SELECT ARRAY_AGG(value)
            INTO v_values_added
            FROM unnest(tbl.kind_values) AS value
            WHERE value <> ALL (COALESCE(v_values_before, ARRAY[]::TEXT[]));

            IF v_values_added IS NOT NULL THEN
                PERFORM _log_table_activity(tbl.table_name, 'success', 'add_enum_values',
                    jsonb_build_object('procedure', '_p_update_tables_kinds',
                                       'feature', 'kind', 'target', v_kind_udt_name,
                                       'detail', array_to_string(v_values_added, ', ')));
            END IF;
        END IF;

        -- Write back what the enum actually holds, which is the declaration
        -- plus anything it already had.
        SELECT ARRAY_AGG(enumlabel ORDER BY enumsortorder)
        INTO v_kind_values
        FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = v_kind_udt_name
          AND pg_type.typnamespace = current_schema()::regnamespace
        GROUP BY pg_enum.enumtypid;

        UPDATE _tables
        SET kind_column = v_kind_column,
            kind_values = v_kind_values,
            updated_at  = NOW()
        WHERE table_name = tbl.table_name;

        RAISE NOTICE 'Kind for table % is %.% with values %',
            tbl.table_name, v_kind_column, v_kind_type_name, v_kind_values;

      EXCEPTION WHEN OTHERS THEN
        -- One table's bad declaration must not abort the run for the rest.
        RAISE NOTICE 'Failed to configure kind for table: %. Error: %', tbl.table_name, SQLERRM;
        PERFORM _log_table_activity(tbl.table_name, 'error', 'configure_kind',
            jsonb_build_object('procedure', '_p_update_tables_kinds',
                               'feature', 'kind', 'target', v_kind_column,
                               'detail', SQLERRM));
      END;
    END LOOP;

    RAISE NOTICE 'Procedure "_p_update_tables_kinds" complete.';
END;
$$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_PROCEDURE.SH', clock_timestamp();
END $migrate$;

-- migrate:down

