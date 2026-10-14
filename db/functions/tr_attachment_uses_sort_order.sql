/*
Gives a use left without a sort_order one: 1000 + its own id, so a new use
falls in after any a storyteller has ordered by hand (which start at 0) and
after every earlier default. A default expression cannot read another
column, which is why this is a trigger and the column has none; the identity
default has already given NEW its id by the time a BEFORE trigger runs.
*/
CREATE OR REPLACE FUNCTION tr_attachment_uses_sort_order() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
BEGIN
    IF NEW.sort_order IS NULL THEN
        NEW.sort_order := 1000 + NEW.id_attachment_use;
    END IF;
    RETURN NEW;
END;
$$;
