-- migrate:up
-- Point users.id_user_type at s_user_types.
--
-- The column already exists — create_auth_tables.sql declares it as
-- integer NOT NULL DEFAULT 1 — but nothing constrained it, so any integer at
-- all was accepted. The ADD COLUMN below is a no-op on an existing database
-- and only matters if the column is ever dropped or the auth tables are
-- rebuilt without it.
--
-- The default moves from 1 to -1. s_user_types is hand-seeded with negative
-- ids (-1 Unpaid Player, -2 Unpaid Storyteller, -3 Paid Storyteller,
-- -100 Administrator), following the convention in db/README.md that seed
-- data uses negative ids, so 1 named no row at all. Adding the foreign key
-- while leaving the default at 1 would have left every insert that relies on
-- the default failing, which is exactly the mistake the constraint exists to
-- catch. -1, Unpaid Player, is the least-privileged row and the right landing
-- spot for a new account.
--
-- users is empty at the time of writing, so there is nothing to backfill; the
-- UPDATE below covers a database where rows arrived first, and runs before
-- the constraint so the constraint validates cleanly.
--
-- The column is integer and s_user_types.id_user_type is bigint. Postgres
-- allows a foreign key across the two — the comparison is what has to work,
-- not the storage width — and integer is the wider-than-necessary choice
-- already for a four-row lookup, so the mismatch is left alone rather than
-- rewriting the column on both sides.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS id_user_type INTEGER NOT NULL DEFAULT -1;

ALTER TABLE users
    ALTER COLUMN id_user_type SET DEFAULT -1;

-- Land any row whose type does not name an s_user_types row on Unpaid Player,
-- so the constraint below has nothing to reject.
UPDATE users u
SET id_user_type = -1
WHERE NOT EXISTS (SELECT 1
                  FROM s_user_types t
                  WHERE t.id_user_type = u.id_user_type);

-- _constraint_exists and _ensure_foreign_key are the house helpers from
-- _foreign_key_helper.sql, the same pair _p_update_tables_user_ids.sql and
-- _p_update_tables_archives.sql use, so this migration does not hand-roll a
-- pg_constraint lookup of its own.
--
-- _ensure_foreign_key derives the constraint name as fk_<table>_<column>,
-- which is fk_users_id_user_type here, so the name does not need stating.
--
-- ON DELETE RESTRICT is passed explicitly: the helper defaults to SET NULL,
-- which cannot work against a NOT NULL column. ON UPDATE CASCADE comes from
-- _add_foreign_key_constraint's own default, which _ensure_foreign_key does
-- not expose. Together they say a type's id may be corrected, but a type that
-- users still point at must not vanish out from under them.
DO
$$
    BEGIN
        IF NOT _constraint_exists('users', 'fk_users_id_user_type') THEN
            PERFORM _ensure_foreign_key(
                    p_table_name := 'users',
                    p_column_name := 'id_user_type',
                    p_referenced_table := 's_user_types',
                    p_referenced_column := 'id_user_type',
                    p_on_delete := 'RESTRICT'
                    );

            -- _add_foreign_key_constraint, which _ensure_foreign_key delegates
            -- to, catches WHEN OTHERS and downgrades a genuine failure to a
            -- WARNING. Without this check a migration that never created the
            -- constraint would still be recorded as applied.
            IF NOT _constraint_exists('users', 'fk_users_id_user_type') THEN
                RAISE EXCEPTION
                    'Failed to add fk_users_id_user_type to users; see the warning above.';
            END IF;
        END IF;
    END
$$;

-- _p_update_fk_indexes creates this on its next run; creating it here means
-- the foreign key is backed from the moment it exists. Same name the
-- procedure would choose, so the run finds it already in place.
CREATE INDEX IF NOT EXISTS idx_fk_users_id_user_type ON users (id_user_type);

-- foreign_key_dependencies and primary_key_dependants are derived:
-- _p_update_tables reads them back out of the catalogue rather than being told
-- what they are. Now that the constraint exists, one call rebuilds both sides
-- of it — users gains s_user_types.id_user_type, s_user_types gains
-- users.id_user_type — with no list of names to keep correct by hand here.
--
-- The call is whole-schema rather than targeted, but it writes no DDL, only
-- _tables, and its ON CONFLICT clause refreshes the derived has_* columns
-- while leaving the hand-set needs_* flags alone.
CALL _p_update_tables();

-- migrate:down

