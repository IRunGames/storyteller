-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    -- No DROP: this is a trigger function, and once _p_update_tables_* has
    -- attached triggers to it, DROP FUNCTION fails with a dependency error.
    -- CREATE OR REPLACE updates the body in place and keeps the triggers.

    -- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tr_clear_archived_by()
    RETURNS TRIGGER AS
$$
BEGIN
    new.archived_by_user_id := NULL;
    RETURN new;
END;
$$ LANGUAGE plpgsql;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

