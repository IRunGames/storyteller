-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    SET session_replication_role = 'replica';

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    DELETE FROM story_sessions WHERE id_story_session < 0;

    RAISE NOTICE '+++    [%] Seeding story_sessions', clock_timestamp();

    -- ------------------------------------------------------------
    -- No rows. This migration seeded the three recorded sittings of An Eastern
    -- King, a story of the storyteller@irun.games account. That account is
    -- made by signing in and no seed creates it, so the stories it owned were
    -- taken out of the seed data -- a database built from scratch had stories
    -- whose owner did not exist -- and their sittings went with them. None of
    -- the example stories that remain records a sitting, so nothing is seeded
    -- here; see db/seeds/seed_story_sessions.sql. The DELETE above is left in
    -- place so a rebuild still clears the table.
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    SET session_replication_role = 'origin';

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

