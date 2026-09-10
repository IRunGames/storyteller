-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS _column_data_type;

    -- ------------------------------------------------------------
/**
  _column_data_type

  Report a column's data type, or NULL when the column -- or the table --
  does not exist. The NULL return is the point: callers can branch on
  "missing" and "wrong type" in one lookup instead of asking twice.

  The table is resolved through the session `search_path`, so callers pass a
  bare table name and never a schema specifier. This is what separates it from
  a plain `information_schema.columns` lookup, which matches on `table_name`
  alone: with the same table name in two schemas that returns both rows and
  `SELECT ... INTO` silently keeps whichever came first.

  Dropped columns leave tombstone rows in the catalog; those are excluded, as
  are the system columns at negative `attnum`.

  The name is returned canonically and WITHOUT length or precision modifiers:
  'character varying' rather than 'character varying(50)', 'timestamp without
  time zone' rather than 'timestamp'. Compare against those spellings -- the
  short forms 'varchar' and 'timestamp' never match. Use `_column_type_exists`
  instead when you want a comparison that accepts every spelling of a type.

  This agrees with `information_schema.columns.data_type` on every scalar
  type, and deliberately disagrees on arrays: information_schema flattens
  every array to the bare string 'ARRAY', while this returns the real type,
  'text[]' or 'character varying[]'. Code ported from an information_schema
  lookup that tested for 'ARRAY' has to be updated; nothing else changes.

  Parameters:
    _table_name  — table to inspect (required).
    _column_name — column to look for (required).

  Returns the type name, or NULL when the column or the table is absent.
 */
CREATE OR REPLACE FUNCTION _column_data_type(
    _table_name  VARCHAR,
    _column_name VARCHAR
)
    RETURNS TEXT
    LANGUAGE plpgsql
    STABLE
AS
$function$
DECLARE
    columnType TEXT;
BEGIN
    SELECT format_type(a.atttypid, NULL)
    INTO columnType
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass(_table_name)
      AND a.attname = _column_name
      AND a.attnum > 0
      AND NOT a.attisdropped;

    RETURN columnType;
END;
$function$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

