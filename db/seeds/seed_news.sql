    -- Seed data for `news`: the three placeholder announcements the home page
    -- shipped with, posted by PalmDave Quist (db/seeds/seed_s_users.sql), a
    -- fixture storyteller, since the real storyteller@irun.games account that
    -- originally authored them is made by signing in and no seed creates it.
    -- starts_at is the day each was written; none of them expires.
    INSERT INTO news (id_news, title, body, starts_at, expires_at, id_created_by_user, id_updated_by_user)
    VALUES
        (-1, 'Five new tables open at Hogwarts',
         'The Hogwarts staff have each opened a story on a different system, from Pendragon to Mausritter, and three of them are looking for players.',
         '2026-09-21', NULL, '00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000001'),
        (-2, 'Favorites come to the Stories page',
         'Heart a story anywhere and it rises to the top of your Stories page, and now to your home page too.',
         '2026-09-14', NULL, '00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000001'),
        (-3, 'Play at the table is next',
         'The Play button on your own stories will open the table, where the storyteller and the players share the session live. Watch this space.',
         '2026-09-07', NULL, '00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000001');
