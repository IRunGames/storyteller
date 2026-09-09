CREATE OR REPLACE FUNCTION tr_clear_archived_by()
    RETURNS TRIGGER AS
$$
BEGIN
    new.archived_by_user_id := NULL;
    RETURN new;
END;
$$ LANGUAGE plpgsql;
