    -- Seed data for `attachments`: the pictures the stories and the sittings
    -- carried before they had an attachments table. Each was an address typed
    -- into a column of its own: stories.image_url and story_sessions.image_link.
    -- Those columns were copied into rows like these and then dropped by
    -- db/migrations/20260928192937_move_image_urls_to_attachments.sql. The
    -- parents are in db/seeds/seed_stories.sql and
    -- db/seeds/seed_story_sessions.sql, so both those seeds must run first.
    --
    -- external_id is the parent's id and kind says which table to read it
    -- against; there is no foreign key, so a picture is only ever as good as
    -- the parent it names.
    --
    -- Every row is is_uploaded = FALSE and status READY: Vercel Blob has never
    -- been wired up, so each of these is a link to a picture someone else
    -- hosts rather than a file we hold. ready_at is written out because the
    -- seed runs with triggers off and the status timestamp trigger is not
    -- there to set it; it matches created_at, which takes the default.
    --
    -- The Hogwarts staff stories (-17 to -21) take their covers from Wikimedia
    -- Commons: 1920px renditions under CC BY 2.0 and CC BY-SA, attribution on
    -- each file's Commons page. They are the castle model, the Great Hall,
    -- Diagon Alley and Hagrid's hut at the Warner Bros studio tour, and the
    -- Glenfinnan Viaduct of the Hogwarts Express.
    INSERT INTO attachments (id_attachment, kind, external_id, status, url,
                             is_uploaded, sort_order, ready_at,
                             created_at, updated_at,
                             id_created_by_user, id_updated_by_user)
    VALUES
        -- The stories' covers, in the order db/seeds/seed_stories.sql lists them.
        ( -1, 'STORY',  -1, 'READY',  -- An Eastern King
         'https://rpg.irun.games/images/arcodd/an-eastern-king/an-eastern-king.png',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -2, 'STORY',  -3, 'READY',  -- Last Train Out
         'https://rpg.irun.games/_astro/lto.D2boiODh_kSUkl.webp',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -3, 'STORY',  -4, 'READY',  -- The Endless Caravan
         'https://rpg.irun.games/_astro/Caravan.CzLLI-AL_2bqp8z.webp',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -4, 'STORY',  -5, 'READY',  -- In the Eye Of...
         'https://rpg.irun.games/images/exalted/in-the-eye-of/starfall.jpg',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -5, 'STORY',  -6, 'READY',  -- A Time for Masks
         'https://rpg.irun.games/images/a-time-for-masks/40337142-0b5d-472b-908e-43fb64ee1cb8.jpg',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -6, 'STORY',  -7, 'READY',  -- Kaliphate
         'https://rpg.irun.games/images/invisible-sun/embers-leap/InvisibleSunLogo.jpg',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -7, 'STORY', -10, 'READY',  -- Psychoneira
         'https://rpg.irun.games/images/psychoneira/psychoneira.jpg',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -8, 'STORY', -11, 'READY',  -- True Sight
         'https://rpg.irun.games/images/true-sight/5376500817_f27ae1c0ef_z-300x300.jpg',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        ( -9, 'STORY', -12, 'READY',  -- Resurrection (WY)
         'https://rpg.irun.games/images/numenera/amber-spires/Parc-guell-spires-1024x768.jpg',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-10, 'STORY', -14, 'READY',  -- Silent Running
         'https://rpg.irun.games/images/numenera/silent-running/Screenshot-2024-01-27-at-11.58.39-1.png',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-11, 'STORY', -17, 'READY',  -- The Order of the Phoenix
         'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/11/Hogwarts_Castle_Model_%2840395351793%29.jpg/1920px-Hogwarts_Castle_Model_%2840395351793%29.jpg',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000003', '00000000-0000-7000-8000-000000000003'),
        (-12, 'STORY', -18, 'READY',  -- Hogwarts
         'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/be/Hogwart%E2%80%98s_Great_Hall%2C_Warner_Bros_Harry_Potter_Studio%2C_London_01.jpg/1920px-Hogwart%E2%80%98s_Great_Hall%2C_Warner_Bros_Harry_Potter_Studio%2C_London_01.jpg',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000004', '00000000-0000-7000-8000-000000000004'),
        (-13, 'STORY', -19, 'READY',  -- Knockturn Alley
         'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/Diagon_Alley_%2846637637464%29.jpg/1920px-Diagon_Alley_%2846637637464%29.jpg',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000005', '00000000-0000-7000-8000-000000000005'),
        (-14, 'STORY', -20, 'READY',  -- Into the Forbidden Forest
         'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/03/Hagrids_Hut_%286973088454%29.jpg/1920px-Hagrids_Hut_%286973088454%29.jpg',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000006', '00000000-0000-7000-8000-000000000006'),
        (-15, 'STORY', -21, 'READY',  -- Beneath the Floorboards
         'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/17/Glenfinnan_Viaduct.jpg/1920px-Glenfinnan_Viaduct.jpg',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000007', '00000000-0000-7000-8000-000000000007'),
        (-16, 'STORY', -22, 'READY',  -- Something Wicked
         'https://rpg.irun.games/_astro/something-wicked.BDFq7VyR_2qTJPB.webp',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        -- The three recorded sittings of An Eastern King: each write-up's hero image.
        (-17, 'STORY_SESSION',  -1, 'READY',  -- Wayfinding
         'https://rpg.irun.games/_astro/dun-acyl.BGOlVFjn_1MpSVf.webp',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-18, 'STORY_SESSION',  -2, 'READY',  -- Bog and River
         'https://rpg.irun.games/_astro/dark-bog.BnOcZFfu_Z1vDcI6.webp',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9'),
        (-19, 'STORY_SESSION',  -3, 'READY',  -- Kildealg
         'https://rpg.irun.games/_astro/kildealg.oS5ci0KU_p2HGI.webp',
         FALSE, 0, NOW(), DEFAULT, DEFAULT,
         '01a0b60c-8938-7a0d-ab2b-34e12ce284c9', '01a0b60c-8938-7a0d-ab2b-34e12ce284c9');
