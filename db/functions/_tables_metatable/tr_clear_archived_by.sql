CREATE OR REPLACE FUNCTION tr_clear_archived_by()
    RETURNS TRIGGER AS
$$
BEGIN
    new.id_archived_by_user := NULL;
    RETURN new;
END;
$$ LANGUAGE plpgsql;
