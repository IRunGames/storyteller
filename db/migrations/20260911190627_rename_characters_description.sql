-- migrate:up
-- Rename characters.chracter_description to characters.description.
--
-- The original name was a typo ("chracter"). create_foundation_tables.sql
-- still declares it misspelled at line 385: that file is a one-time capture of
-- the pre-dbmate schema, not a live definition, so it stays as the historical
-- record and this migration evolves it forward.
--
-- The new name drops the entity prefix rather than correcting it to
-- character_description. That is what was asked for, and it is worth noting
-- the schema is of two minds here: characters.character_name, games.game_title
-- and hands.hand_title carry the prefix, while _table_types.description and
-- s_card_types.details do not. Nothing breaks either way.
--
-- The table is empty and nothing selects the column: no view or rule depends
-- on it (checked against pg_depend), no routine names it, and the Drizzle
-- schema models only the better-auth tables, not characters.

DO
$$
    BEGIN
        IF _column_exists('characters', 'description') THEN
            RAISE NOTICE 'characters.description already exists; skipping rename.';
            RETURN;
        END IF;

        IF NOT _column_exists('characters', 'chracter_description') THEN
            RAISE EXCEPTION
                'Cannot rename characters.chracter_description: neither it nor description exists.';
        END IF;

        ALTER TABLE characters
            RENAME COLUMN chracter_description TO description;
    END
$$;

-- migrate:down

