-- migrate:up
-- Realign any sequence-backed column whose sequence has fallen behind.
--
-- Rows seeded with explicit ids do not advance the owning sequence, so the
-- next nextval() returns a value that already exists and the insert fails on
-- the primary key. Two tables were in that state when this was written:
--
--   _table_types.id_table_type   sequence 1, max id 3
--   s_hand_types.id_hand_type    sequence 1, max id 8
--
-- The work is done by _realign_sequences(), so the same repair is available
-- ad hoc later rather than living only inside a migration. Called with no
-- argument it sweeps every table in the schema.
--
-- Only ever moves a sequence forward, so this is idempotent and a no-op on a
-- database built from scratch, where these tables are empty.

DO
$$
    DECLARE
        repaired INT;
    BEGIN
        SELECT count(*) INTO repaired FROM _realign_sequences();
        RAISE NOTICE 'realign_sequences: % sequence(s) realigned', repaired;
    END
$$;

-- migrate:down

