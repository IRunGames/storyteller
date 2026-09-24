-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS immutable_concat_ws;

    -- ------------------------------------------------------------
-- concat_ws() is STABLE, and a generated column's expression must be
-- IMMUTABLE, so _p_update_tables_search_fields builds every search_text
-- column on this instead. The behaviour differs from concat_ws in two ways
-- the search columns rely on: each part is trimmed, and when every part is
-- NULL the result is NULL rather than an empty string, so an empty row has
-- no search text at all.
CREATE FUNCTION immutable_concat_ws(_separator text, VARIADIC _concat_me text[]) RETURNS text
    IMMUTABLE
    PARALLEL SAFE
    LANGUAGE plpgsql
AS
$func$
DECLARE
    -- for logging
    actionName       VARCHAR DEFAULT 'immutable_concat_ws';
    actionVersion    VARCHAR DEFAULT '2025-03-13';

    text_result      TEXT DEFAULT '';
    single_text      TEXT ;
    not_null_count   INT DEFAULT 0;

    current_location INT DEFAULT 0;

BEGIN

    FOREACH single_text IN ARRAY _concat_me
        LOOP
            IF single_text IS NOT NULL THEN
                not_null_count := not_null_count + 1;
                IF current_location = 0 OR text_result = '' THEN
                    text_result := TRIM(single_text);
                ELSE
                    text_result := text_result || _separator || TRIM(single_text);
                END IF;
            END IF;

            current_location := current_location + 1;

        END LOOP;

    if not_null_count = 0 then
        return null;
    end if;
    RETURN text_result;

END;
$func$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

