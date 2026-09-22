    -- Seed data for `news`: the three placeholder announcements the home page
    -- shipped with, posted by the storyteller@irun.games user. starts_at is
    -- the day each was written; none of them expires.
    INSERT INTO news (id_news, title, body, starts_at, expires_at, id_created_by_user, id_updated_by_user)
    VALUES
        (-1, 'Five new tables open at Hogwarts',
         'The Hogwarts staff have each opened a story on a different system, from Pendragon to Mausritter, and three of them are looking for players.',
         '2026-09-21', NULL, '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-2, 'Favorites come to the Stories page',
         'Heart a story anywhere and it rises to the top of your Stories page, and now to your home page too.',
         '2026-09-14', NULL, '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-3, 'Play at the table is next',
         'The Play button on your own stories will open the table, where the storyteller and the players share the session live. Watch this space.',
         '2026-09-07', NULL, '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9');
