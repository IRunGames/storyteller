-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    -- No DROP: this is a trigger function, and once _p_update_tables_* has
    -- attached triggers to it, DROP FUNCTION fails with a dependency error.
    -- CREATE OR REPLACE updates the body in place and keeps the triggers.

    -- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tr_update_archived_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_archived = TRUE AND OLD.is_archived IS DISTINCT FROM NEW.is_archived THEN
        NEW.archived_at := NOW();
    ELSIF NEW.is_archived = FALSE AND OLD.is_archived IS DISTINCT FROM NEW.is_archived THEN
        NEW.archived_at := NULL;
    END IF;

    RETURN NEW;
END $$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

