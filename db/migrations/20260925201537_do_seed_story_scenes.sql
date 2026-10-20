-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    -- Foreign keys to and from the table off, its triggers off; _seed_end
    -- puts them back and checks every row (functions/_seed_begin.sql says why).
    PERFORM _seed_begin('story_scenes');

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    DELETE FROM story_scenes WHERE id_story_scene < 0;

    RAISE NOTICE '+++    [%] Seeding story_scenes', clock_timestamp();

    -- ------------------------------------------------------------
    -- No rows. This migration seeded the twenty-one scenes of An Eastern King,
    -- a story of the storyteller@irun.games account. That account is made by
    -- signing in and no seed creates it, so the stories it owned were taken
    -- out of the seed data -- a database built from scratch had stories whose
    -- owner did not exist -- and the sittings and the scenes that hung off
    -- them went with them. None of the example stories that remain has scenes,
    -- so nothing is seeded here; see db/seeds/seed_story_scenes.sql. The
    -- DELETE above is left in place so a rebuild still clears the table.
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    PERFORM _seed_end('story_scenes');

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

