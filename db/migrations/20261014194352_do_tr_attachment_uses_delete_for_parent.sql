-- migrate:up
DO $migrate$
BEGIN
    RAISE NOTICE '[%] START CREATE OR REPLACE FUNCTION', clock_timestamp();

    DROP FUNCTION IF EXISTS tr_attachment_uses_delete_for_parent;

    -- ------------------------------------------------------------
/*
Deletes a holder's uses when the holder goes. One function attached to all
four holders: the kind and the holder's primary key name arrive through
TG_ARGV, so adding a kind is an enum value and an attach statement, never an
edit to this body.

OLD has a different key name on each holder, so the value is read
generically rather than named.

Only the uses go. The attachments themselves are the story's, and stay in
its pool until the story goes (attachments.id_story cascades) or someone
deletes them.
*/
CREATE OR REPLACE FUNCTION tr_attachment_uses_delete_for_parent() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
BEGIN
    DELETE FROM attachment_uses
    WHERE kind = TG_ARGV[0]::attachment_uses_kind
      AND external_id = (to_jsonb(OLD) ->> TG_ARGV[1])::integer;
    RETURN OLD;
END;
$$;
    -- ------------------------------------------------------------

    RAISE NOTICE '[%] DONE MAKE_FUNCTION.SH', clock_timestamp();
END $migrate$;

-- migrate:down

