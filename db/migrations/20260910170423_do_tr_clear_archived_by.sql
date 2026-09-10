-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    -- No DROP: _p_update_tables_archives attaches triggers to this function,
    -- and DROP FUNCTION fails once any exist. CREATE OR REPLACE is enough.

    -- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tr_clear_archived_by()
    RETURNS TRIGGER AS
$$
BEGIN
    new.id_archived_by_user := NULL;
    RETURN new;
END;
$$ LANGUAGE plpgsql;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

