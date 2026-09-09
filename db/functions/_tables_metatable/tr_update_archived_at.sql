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
