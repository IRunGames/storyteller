-- migrate:up
-- Rename s_card_type to s_card_types.
--
-- The plural half of the same tidy-up as
-- 20260911161844_rename_s_user_type_to_s_user_types.sql:
-- s_hand_types and s_statuses are plural, so the two remaining singular s_
-- lookups follow.
--
-- This table carries more baggage than s_user_type. It was _card_type before
-- an earlier rename to s_card_type, and that rename moved the table only, so
-- its primary key, its sequence and the inbound foreign key from cards all
-- still spell the original _card_type. Renaming them here means nothing in
-- the catalogue names a table that has not existed for two renames.
--
-- The inbound foreign key is renamed to fk_cards_id_card_type, the
-- fk_<table>_<column> form that _p_update_tables_user_ids.sql and the newer
-- migrations use, rather than to a plural spelling of the old name.
--
-- Constraints, sequences and triggers all track their table by OID, so none
-- of these renames disturb the relationships they describe; only the names
-- change. The table is empty at the time of writing, but RENAME preserves
-- rows regardless.

DO
$$
    BEGIN
        IF to_regclass('s_card_types') IS NOT NULL THEN
            RAISE NOTICE 's_card_types already exists; skipping rename.';
            RETURN;
        END IF;

        IF to_regclass('s_card_type') IS NULL THEN
            RAISE EXCEPTION
                'Cannot rename s_card_type: neither it nor s_card_types exists.';
        END IF;

        ALTER TABLE s_card_type
            RENAME TO s_card_types;

        ALTER TABLE s_card_types
            RENAME CONSTRAINT _card_type_pk TO s_card_types_pk;

        -- The column default tracks the sequence by OID, so renaming the
        -- sequence does not disturb it.
        ALTER SEQUENCE _card_type_id_card_type_seq
            RENAME TO s_card_types_id_card_type_seq;

        -- The inbound foreign key lives on cards, not on the renamed table,
        -- so RENAME TO left it behind spelling _card_type twice over.
        ALTER TABLE cards
            RENAME CONSTRAINT cards__card_type_id_card_type_fk TO fk_cards_id_card_type;
    END
$$;

-- Keep the _tables metatable in step. Guarded because table_name is unique.
UPDATE _tables
SET table_name = 's_card_types'
WHERE table_name = 's_card_type'
  AND NOT EXISTS (SELECT 1 FROM _tables t2 WHERE t2.table_name = 's_card_types');

DELETE
FROM _tables
WHERE table_name = 's_card_type';

-- cards.foreign_key_dependencies still spells s_card_type. That column is
-- derived, not declared — _p_update_tables reads it back out of the catalogue
-- — so rather than rewriting the string here, let the procedure restate it.
-- The row identity above has to be done by hand first: a rename is the one
-- thing the procedure cannot infer, since it would see the old name gone and
-- the new name unknown, and drop and reinsert the row, losing the needs_*
-- flags set against it.
CALL _p_update_tables();

-- migrate:down

