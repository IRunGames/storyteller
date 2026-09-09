-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    -- No DROP: this is a trigger function, and once _p_update_tables_* has
    -- attached triggers to it, DROP FUNCTION fails with a dependency error.
    -- CREATE OR REPLACE updates the body in place and keeps the triggers.

    -- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tr_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

