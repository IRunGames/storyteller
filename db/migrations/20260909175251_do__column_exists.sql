-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS _column_exists;

    -- ------------------------------------------------------------
/**
  _column_exists

  Report whether a column exists on a table. Intended as a migration guard,
  so that a step which cannot be expressed with `IF NOT EXISTS` can still be
  written idempotently.

  The table is resolved through the session `search_path`, so callers pass a
  bare table name and never a schema specifier. A table that does not exist
  returns FALSE rather than raising, which lets a guard read the same way
  whether it is the table or the column that is missing.

  Dropped columns leave tombstone rows in the catalog; those are excluded,
  as are the system columns at negative `attnum`.

  Parameters:
    _table_name  — table to inspect (required).
    _column_name — column to look for (required).

  Returns TRUE when the column exists, FALSE when the column or the table
  does not.
 */
CREATE OR REPLACE FUNCTION _column_exists(
    _table_name  VARCHAR,
    _column_name VARCHAR
)
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    STABLE
AS
$function$
DECLARE
    columnFound BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1
                   FROM pg_attribute a
                   WHERE a.attrelid = to_regclass(_table_name)
                     AND a.attname = _column_name
                     AND a.attnum > 0
                     AND NOT a.attisdropped)
    INTO columnFound;

    RETURN columnFound;
END;
$function$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

