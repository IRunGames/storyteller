-- migrate:up
-- Rename s_table_type to _table_types.
--
-- It describes kinds of table (table_prefix, needs_create, needs_update,
-- needs_create_user, needs_update_user), so it belongs with the metatable
-- machinery under the underscore prefix alongside _tables, rather than under
-- s_, which this schema uses for static lookups the application reads
-- (s_card_type, s_hand_types, s_statuses, s_user_type).
--
-- Runs after drop_s_tables.sql, which removes the only foreign key that
-- pointed here. The rename would work regardless — a foreign key tracks the
-- table by OID, not by name — but dropping first leaves nothing dangling.
--
-- Carries data (3 rows at the time of writing); RENAME preserves it.

DO
$$
    BEGIN
        IF to_regclass('_table_types') IS NOT NULL THEN
            RAISE NOTICE '_table_types already exists; skipping rename.';
            RETURN;
        END IF;

        IF to_regclass('s_table_type') IS NULL THEN
            RAISE EXCEPTION
                'Cannot rename s_table_type: neither it nor _table_types exists.';
        END IF;

        ALTER TABLE s_table_type
            RENAME TO _table_types;

        -- RENAME TO renames neither constraints nor sequences, so both would
        -- keep the old name. Renaming the constraint renames its index too;
        -- the column default tracks the sequence by OID, so renaming the
        -- sequence does not disturb it.
        ALTER TABLE _table_types
            RENAME CONSTRAINT s_table_type_pk TO _table_types_pk;

        ALTER SEQUENCE s_table_type_id_table_type_seq
            RENAME TO _table_types_id_table_type_seq;
    END
$$;

-- Keep the _tables metatable in step. Guarded because table_name is unique.
UPDATE _tables
SET table_name = '_table_types'
WHERE table_name = 's_table_type'
  AND NOT EXISTS (SELECT 1 FROM _tables t2 WHERE t2.table_name = '_table_types');

DELETE
FROM _tables
WHERE table_name = 's_table_type';

-- migrate:down

