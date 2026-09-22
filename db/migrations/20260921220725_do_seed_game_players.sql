-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    SET session_replication_role = 'replica';

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    DELETE FROM game_players WHERE id_game_player < 0;

    RAISE NOTICE '+++    [%] Seeding game_players', clock_timestamp();

    -- ------------------------------------------------------------
    -- Seed data for `game_players`: who plays in the seed games that are not
    -- solo storyteller fixtures. The owner of a game is its id_created_by_user
    -- on `games` and does not get a game_players row.
    --
    -- id_game points at db/seeds/seed_games.sql and id_user at
    -- db/seeds/seed_users.sql (plus the storyteller@irun.games account), so
    -- both of those seeds must run first.
    --
    -- Each Hogwarts staff game (-17 to -21) seats four players: one other
    -- staff member and three students, so staff appear on both sides.
    INSERT INTO game_players (id_game_player, id_game, id_user)
    VALUES
        -- Vampire (-15), owned by PalmDave: PaulKhash and Pol play
        ( -1, -15, '00000000-0000-7000-8000-000000000002'),
        ( -2, -15, '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        -- D&D 5e (-16), owned by PaulKhash: PalmDave plays
        ( -3, -16, '00000000-0000-7000-8000-000000000001'),
        -- The Order of the Phoenix (-17), run by Dumbledore: McGonagall, Harry, Hermione, Ron
        ( -4, -17, '00000000-0000-7000-8000-000000000004'),
        ( -5, -17, '00000000-0000-7000-8000-000000000008'),
        ( -6, -17, '00000000-0000-7000-8000-000000000009'),
        ( -7, -17, '00000000-0000-7000-8000-000000000010'),
        -- The Chamber Below (-18), run by McGonagall: Snape, Neville, Luna, Ginny
        ( -8, -18, '00000000-0000-7000-8000-000000000005'),
        ( -9, -18, '00000000-0000-7000-8000-000000000011'),
        (-10, -18, '00000000-0000-7000-8000-000000000012'),
        (-11, -18, '00000000-0000-7000-8000-000000000013'),
        -- Knockturn Alley (-19), run by Snape: Flitwick, Harry, Draco, Cho
        (-12, -19, '00000000-0000-7000-8000-000000000007'),
        (-13, -19, '00000000-0000-7000-8000-000000000008'),
        (-14, -19, '00000000-0000-7000-8000-000000000014'),
        (-15, -19, '00000000-0000-7000-8000-000000000015'),
        -- Into the Forbidden Forest (-20), run by Hagrid: Dumbledore, Ron, Cedric, Seamus
        (-16, -20, '00000000-0000-7000-8000-000000000003'),
        (-17, -20, '00000000-0000-7000-8000-000000000010'),
        (-18, -20, '00000000-0000-7000-8000-000000000016'),
        (-19, -20, '00000000-0000-7000-8000-000000000017'),
        -- Beneath the Floorboards (-21), run by Flitwick: Hagrid, Hermione, Luna, Ginny
        (-20, -21, '00000000-0000-7000-8000-000000000006'),
        (-21, -21, '00000000-0000-7000-8000-000000000009'),
        (-22, -21, '00000000-0000-7000-8000-000000000012'),
        (-23, -21, '00000000-0000-7000-8000-000000000013');
    -- ------------------------------------------------------------
    GET DIAGNOSTICS row_count = ROW_COUNT;

    RAISE NOTICE '>>>    [%] Rows inserted: %', CLOCK_TIMESTAMP(), row_count;

    -- ------------------------------------------------------------
    SET session_replication_role = 'origin';

    RAISE NOTICE '[%] DONE SEEDING', clock_timestamp();
END $$;

-- migrate:down

