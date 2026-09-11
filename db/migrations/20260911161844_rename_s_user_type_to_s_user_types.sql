-- migrate:up
-- Rename s_user_type to s_user_types.
--
-- The s_ lookups are inconsistently pluralised: s_hand_types and s_statuses
-- are plural, s_user_type and s_card_type are singular. A lookup table holds
-- many types, so plural wins. This migration and its sibling
-- 20260911161845_rename_s_card_type_to_s_card_types.sql settle the remaining two.
--
-- The table was _user_type until 20260909221825 renamed it to s_user_type;
-- create_foundation_tables.sql still creates it under the original name, as a
-- one-time capture of the pre-dbmate schema rather than a live definition, so
-- a database built from scratch passes through both renames in order.
--
-- Nothing references the table by foreign key yet, and no application code
-- names it, so the rename is self-contained. The foreign key from
-- users.id_user_type is added afterwards, by
-- 20260911161847_add_users_id_user_type_fk.sql, so that it is created against
-- the final name.

DO
$$
    BEGIN
        IF to_regclass('s_user_types') IS NOT NULL THEN
            RAISE NOTICE 's_user_types already exists; skipping rename.';
            RETURN;
        END IF;

        IF to_regclass('s_user_type') IS NULL THEN
            RAISE EXCEPTION
                'Cannot rename s_user_type: neither it nor s_user_types exists.';
        END IF;

        ALTER TABLE s_user_type
            RENAME TO s_user_types;

        -- RENAME TO leaves constraint names untouched, so the primary key
        -- would keep reading s_user_type_pk. Renaming the constraint renames
        -- its backing index with it. There is no sequence: id_user_type has
        -- no default and its rows are hand-seeded with negative ids.
        ALTER TABLE s_user_types
            RENAME CONSTRAINT s_user_type_pk TO s_user_types_pk;
    END
$$;

-- Keep the _tables metatable in step. Guarded against an s_user_types row
-- already being present, since table_name is unique.
UPDATE _tables
SET table_name = 's_user_types'
WHERE table_name = 's_user_type'
  AND NOT EXISTS (SELECT 1 FROM _tables t2 WHERE t2.table_name = 's_user_types');

DELETE
FROM _tables
WHERE table_name = 's_user_type';

-- migrate:down

