/*
Deletes a parent's attachments when the parent goes. One function attached to
all three parents: the kind and the parent's primary key name arrive through
TG_ARGV, so adding a kind is an enum value and an attach statement, never an
edit to this body.

OLD has a different key name on each parent, so the value is read generically
rather than named.

The blobs those rows point at are left to the sweep, which is the only thing
that talks to Vercel Blob.
*/
CREATE OR REPLACE FUNCTION tr_attachments_delete_for_parent() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
BEGIN
    DELETE FROM attachments
    WHERE kind = TG_ARGV[0]::attachments_kind
      AND external_id = (to_jsonb(OLD) ->> TG_ARGV[1])::integer;
    RETURN OLD;
END;
$$;
