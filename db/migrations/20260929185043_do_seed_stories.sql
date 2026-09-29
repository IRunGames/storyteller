-- migrate:up
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    RAISE NOTICE '[%] START SEEDING', clock_timestamp();
    SET session_replication_role = 'replica';

    RAISE NOTICE '+++    [%] clearing records', clock_timestamp();

    DELETE FROM stories WHERE id_story < 0;

    RAISE NOTICE '+++    [%] Seeding stories', clock_timestamp();

    -- ------------------------------------------------------------
    -- Seed data for `stories`: the example campaigns run by the fixture users
    -- in db/seeds/seed_users.sql, so that seed must run first. Who plays in
    -- them is in db/seeds/seed_story_players.sql.
    --
    -- The campaigns of https://rpg.irun.games used to be seeded here too,
    -- owned by the storyteller@irun.games account. That account is made by
    -- signing in and no seed creates it, so a database built from scratch had
    -- stories whose owner did not exist; they have been taken out of the seed
    -- data and live only in the database they were entered in.
    --
    -- id_system points at db/seeds/seed_systems.sql, so that seed must run
    -- first. summary is NULL: these stories have no page to take one from.
    -- hours_played is 0 and last_played keeps the column default, since none
    -- of them records a sitting. is_looking_for_players is true for three of
    -- the Hogwarts stories (-17, -19, -20) so the Stories page has something
    -- to advertise.
    INSERT INTO stories (id_story, title, id_system, summary, hours_played, is_active, is_looking_for_players,
                       last_played, id_created_by_user, id_updated_by_user)
    VALUES
        -- Fixture stories owned by the seed users (no site page, so no summary)
        (-15, 'Vampire',               -10,
          NULL,
          0, true,  false, DEFAULT,            '00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000001'),
        (-16, 'D&D 5e',                 -2,
          NULL,
          0, false, false, DEFAULT,            '00000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000002'),
        -- Hogwarts staff stories: each staff member runs a different system.
        -- Their covers, and the attribution the Wikimedia photos carry, are in
        -- db/seeds/seed_attachments.sql.
        (-17, 'The Order of the Phoenix',    -69,
          NULL,
          0, true,  true,  DEFAULT,            '00000000-0000-7000-8000-000000000003', '00000000-0000-7000-8000-000000000003'),
        (-18, 'The Chamber Below',            -4,
          NULL,
          0, true,  false, DEFAULT,            '00000000-0000-7000-8000-000000000004', '00000000-0000-7000-8000-000000000004'),
        (-19, 'Knockturn Alley',              -8,
          NULL,
          0, true,  true,  DEFAULT,            '00000000-0000-7000-8000-000000000005', '00000000-0000-7000-8000-000000000005'),
        (-20, 'Into the Forbidden Forest',   -19,
          NULL,
          0, true,  true,  DEFAULT,            '00000000-0000-7000-8000-000000000006', '00000000-0000-7000-8000-000000000006'),
        (-21, 'Beneath the Floorboards',     -83,
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

