/**
  _column_type_exists

  Report whether a column exists on a table AND holds the given type.
  Intended as a migration guard for steps that convert a column in place,
  where re-running the conversion would corrupt already-converted data.

  Both sides are compared as type OIDs rather than as text, so every Postgres
  spelling of a type matches its canonical form: 'timestamptz' equals
  'timestamp with time zone', 'varchar' equals 'character varying', 'int8'
  equals 'bigint'. This is what makes the function safe as a guard — one that
  string-matched `information_schema.columns.data_type` would silently fall
  through whenever the caller spelled the type the other way.

  Length and precision modifiers are ignored: 'varchar' and 'varchar(50)'
  both match a character varying column. Compare the modifier separately if
  that distinction matters.

  An unknown type name, a missing column, and a missing table all return
  FALSE rather than raising.

  Parameters:
    _table_name  — table to inspect (required).
    _column_name — column to look for (required).
    _type        — expected type, in any Postgres spelling (required).

  Returns TRUE when the column exists with that type, FALSE otherwise.
 */
CREATE OR REPLACE FUNCTION _column_type_exists(
    _table_name  VARCHAR,
    _column_name VARCHAR,
    _type        VARCHAR
)
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    STABLE
AS
$function$
DECLARE
    typeMatches BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1
                   FROM pg_attribute a
                   WHERE a.attrelid = to_regclass(_table_name)
                     AND a.attname = _column_name
                     AND a.attnum > 0
                     AND NOT a.attisdropped
                     AND a.atttypid = to_regtype(_type))
    INTO typeMatches;

    RETURN typeMatches;
END;
$function$;
