-- migrate:up

-- Drop characters. elements replaces it: a person is one kind of element,
-- alongside places, things, ephemera and anything else a story keeps track of.
--
-- The table is empty, and the one thing that depends on it is the foreign key
-- from hands.id_character, which is dropped first by name rather than swept
-- away with CASCADE. hands.id_character itself stays: it is empty on every row,
-- and whether a hand belongs to an element is a question for when hands are
-- built. story_players.id_character never had a foreign key and is left alone
-- for the same reason.

ALTER TABLE IF EXISTS hands DROP CONSTRAINT IF EXISTS hands_characters_id_character_fk;

DO
$$
    DECLARE
        v_dependents text;
    BEGIN
        IF to_regclass('characters') IS NULL THEN
            RAISE NOTICE 'characters is already gone; skipping drop.';
            RETURN;
        END IF;

        -- Anything still pointing at the table would make the DROP fail with a
        -- message about the first one only, so name them all instead.
        SELECT string_agg(conrelid::regclass || '.' || conname, ', ')
        INTO v_dependents
        FROM pg_constraint
        WHERE confrelid = 'characters'::regclass;

        IF v_dependents IS NOT NULL THEN
            RAISE EXCEPTION 'characters is still referenced by %; drop those first.', v_dependents;
        END IF;

        IF EXISTS (SELECT 1 FROM characters) THEN
            RAISE EXCEPTION 'characters holds rows; move them before dropping the table.';
        END IF;

        DROP TABLE characters;
    END
$$;

-- Purge the characters row from _tables and refresh hands' recorded
-- foreign-key dependencies, which still name characters.id_character.
CALL _p_update_tables();

-- migrate:down

