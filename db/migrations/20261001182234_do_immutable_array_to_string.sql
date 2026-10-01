-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS immutable_array_to_string;

    -- ------------------------------------------------------------
-- array_to_string() is STABLE, because for an arbitrary element type it calls
-- that type's output function, and a generated column's expression must be
-- IMMUTABLE. For text[] there is nothing to convert, so the result depends on
-- the array alone, and _p_update_tables_search_fields builds a text[] search
-- field (attachments.tags) on this instead.
--
-- NULL rather than '' for an empty or NULL array, so immutable_concat_ws
-- treats a row with no tags as having nothing to add, the same as a NULL text
-- column, instead of leaving a trailing separator behind.
CREATE FUNCTION immutable_array_to_string(_parts text[], _separator text) RETURNS text
    IMMUTABLE
    PARALLEL SAFE
    LANGUAGE sql
AS
$func$
SELECT NULLIF(array_to_string(_parts, _separator), '');
$func$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

