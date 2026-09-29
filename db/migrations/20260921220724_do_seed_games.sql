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
    -- Seed data for `games`: the example campaigns run by the fixture users in
    -- db/seeds/seed_users.sql, so that seed must run first. Who plays in them
    -- is in db/seeds/seed_game_players.sql.
    --
    -- The campaigns listed under the Stories menu of https://rpg.irun.games
    -- were seeded here too, owned by the storyteller@irun.games user. That
    -- account is made by signing in and no seed creates it, so a database
    -- built from scratch had games whose owner did not exist; they have been
    -- taken out of the seed data and live only in the database they were
    -- entered in.
    --
    -- id_system points at db/seeds/seed_systems.sql, so that seed must run
    -- first. summary is NULL: these games have no page to take one from.
    -- image_url is the Wikimedia Commons cover of each Hogwarts staff game.
    -- is_looking_for_players is true for three of them (-17, -19, -20) so the
    -- Stories page has something to advertise.
    INSERT INTO games (id_game, game_title, id_system, image_url, summary, hours_played, is_active, is_looking_for_players,
                       last_played, id_created_by_user, id_updated_by_user)
    VALUES
        -- Fixture games owned by the seed users (no site page, so no image or summary)
        (-15, 'Vampire',               -10, NULL,
          NULL,
          0, true,  false, DEFAULT,            '00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000001'),
        (-16, 'D&D 5e',                 -2, NULL,
          NULL,
          0, false, false, DEFAULT,            '00000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000002'),
        -- Hogwarts staff games: each staff member runs a different system.
        -- Covers are 1920px renditions of Wikimedia Commons photos (CC BY 2.0
        -- and CC BY-SA, attribution on each file's Commons page): the castle
        -- model, the Great Hall, Diagon Alley and Hagrid's hut at the Warner
        -- Bros studio tour, and the Glenfinnan Viaduct of the Hogwarts Express.
        (-17, 'The Order of the Phoenix',    -69, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/11/Hogwarts_Castle_Model_%2840395351793%29.jpg/1920px-Hogwarts_Castle_Model_%2840395351793%29.jpg',
          NULL,
          0, true,  true,  DEFAULT,            '00000000-0000-7000-8000-000000000003', '00000000-0000-7000-8000-000000000003'),
        (-18, 'The Chamber Below',            -4, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/be/Hogwart%E2%80%98s_Great_Hall%2C_Warner_Bros_Harry_Potter_Studio%2C_London_01.jpg/1920px-Hogwart%E2%80%98s_Great_Hall%2C_Warner_Bros_Harry_Potter_Studio%2C_London_01.jpg',
          NULL,
          0, true,  false, DEFAULT,            '00000000-0000-7000-8000-000000000004', '00000000-0000-7000-8000-000000000004'),
        (-19, 'Knockturn Alley',              -8, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/Diagon_Alley_%2846637637464%29.jpg/1920px-Diagon_Alley_%2846637637464%29.jpg',
          NULL,
          0, true,  true,  DEFAULT,            '00000000-0000-7000-8000-000000000005', '00000000-0000-7000-8000-000000000005'),
        (-20, 'Into the Forbidden Forest',   -19, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/03/Hagrids_Hut_%286973088454%29.jpg/1920px-Hagrids_Hut_%286973088454%29.jpg',
          NULL,
          0, true,  true,  DEFAULT,            '00000000-0000-7000-8000-000000000006', '00000000-0000-7000-8000-000000000006'),
        (-21, 'Beneath the Floorboards',     -83, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/17/Glenfinnan_Viaduct.jpg/1920px-Glenfinnan_Viaduct.jpg',
          NULL,
          0, true,  false, DEFAULT,            '00000000-0000-7000-8000-000000000007', '00000000-0000-7000-8000-000000000007');
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    SET session_replication_role = 'origin';

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

