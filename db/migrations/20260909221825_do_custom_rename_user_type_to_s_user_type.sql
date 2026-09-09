-- migrate:up
-- Rename _user_type to s_user_type.
--
-- It is a static lookup table like s_card_type, s_hand_types and s_table_type,
-- so it belongs under the s_ prefix rather than the underscore prefix, which
-- this schema uses for internal machinery (_tables, _action_logs, _err).
--
-- create_foundation_tables.sql still creates it as _user_type: that file is a
-- one-time capture of the pre-dbmate schema, not a live definition, so it is
-- left as the historical record and this migration evolves it forward. A
-- database built from scratch creates _user_type and renames it here.
--
-- Nothing references the table by foreign key, and no application code names
-- it, so the rename is self-contained. users.id_user_type is a plain integer
-- column with no constraint pointing here, and keeps its name.

DO
$$
    BEGIN
        IF to_regclass('s_user_type') IS NOT NULL THEN
            RAISE NOTICE 's_user_type already exists; skipping rename.';
            RETURN;
        END IF;

        IF to_regclass('_user_type') IS NULL THEN
            RAISE EXCEPTION
                'Cannot rename _user_type: neither it nor s_user_type exists.';
        END IF;

        ALTER TABLE _user_type
            RENAME TO s_user_type;

        -- RENAME TO leaves constraint and index names untouched, so the
        -- primary key would keep reading _user_type_pk. Renaming the
        -- constraint renames its backing index with it.
        ALTER TABLE s_user_type
            RENAME CONSTRAINT _user_type_pk TO s_user_type_pk;
    END
$$;

-- Keep the _tables metatable in step. Guarded against an s_user_type row
-- already being present, since table_name is unique.
UPDATE _tables
SET table_name = 's_user_type'
WHERE table_name = '_user_type'
  AND NOT EXISTS (SELECT 1 FROM _tables t2 WHERE t2.table_name = 's_user_type');

DELETE
FROM _tables
WHERE table_name = '_user_type';

-- migrate:down

