-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    SET session_replication_role = 'replica';

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    DELETE FROM games WHERE id_game < 0;

    RAISE NOTICE '+++    [%] Seeding games', clock_timestamp();

    -- ------------------------------------------------------------
    -- No rows. This migration seeded the campaigns listed under the Stories
    -- menu of https://rpg.irun.games, every one of them owned by the
    -- storyteller@irun.games user. That account is made by signing in and no
    -- seed creates it, so a database built from scratch had games whose owner
    -- did not exist and the first statement to run outside
    -- session_replication_role = 'replica' broke on the foreign key. Those
    -- games were taken out of the seed data and live only in the database
    -- they were entered in; the example games of db/seeds/seed_stories.sql
    -- arrive in 20260921220724_do_seed_games.sql, which re-seeds this table.
    -- The DELETE above is left in place so a rebuild still clears the table.
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    SET session_replication_role = 'origin';

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

