    -- Seed data for `attachments`: the covers of the example stories in
    -- db/seeds/seed_stories.sql, which must run first. They were addresses
    -- typed into a column of the story itself, stories.image_url, until
    -- db/migrations/20260928192937_move_image_urls_to_attachments.sql copied
    -- that column into rows like these and dropped it.
    --
    -- external_id is the parent's id and kind says which table to read it
    -- against; there is no foreign key, so a picture is only ever as good as
    -- the parent it names.
    --
    -- Every row is tagged 'cover': each is the one picture its story shows, and
    -- the app only puts an attachment on a card or a page when it carries
    -- that tag (20261001171738_tag_attachment_covers.sql).
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
                             is_uploaded, sort_order, tags, ready_at,
                             created_at, updated_at,
                             id_created_by_user, id_updated_by_user)
    VALUES
        (-11, 'STORY', -17, 'READY',  -- The Order of the Phoenix
         'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/11/Hogwarts_Castle_Model_%2840395351793%29.jpg/1920px-Hogwarts_Castle_Model_%2840395351793%29.jpg',
         FALSE, 0, '{cover}', NOW(), DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000003', '00000000-0000-7000-8000-000000000003'),
        (-12, 'STORY', -18, 'READY',  -- The Chamber Below
         'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/be/Hogwart%E2%80%98s_Great_Hall%2C_Warner_Bros_Harry_Potter_Studio%2C_London_01.jpg/1920px-Hogwart%E2%80%98s_Great_Hall%2C_Warner_Bros_Harry_Potter_Studio%2C_London_01.jpg',
         FALSE, 0, '{cover}', NOW(), DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000004', '00000000-0000-7000-8000-000000000004'),
        (-13, 'STORY', -19, 'READY',  -- Knockturn Alley
         'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/Diagon_Alley_%2846637637464%29.jpg/1920px-Diagon_Alley_%2846637637464%29.jpg',
         FALSE, 0, '{cover}', NOW(), DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000005', '00000000-0000-7000-8000-000000000005'),
        (-14, 'STORY', -20, 'READY',  -- Into the Forbidden Forest
         'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/03/Hagrids_Hut_%286973088454%29.jpg/1920px-Hagrids_Hut_%286973088454%29.jpg',
         FALSE, 0, '{cover}', NOW(), DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000006', '00000000-0000-7000-8000-000000000006'),
        (-15, 'STORY', -21, 'READY',  -- Beneath the Floorboards
         'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/17/Glenfinnan_Viaduct.jpg/1920px-Glenfinnan_Viaduct.jpg',
         FALSE, 0, '{cover}', NOW(), DEFAULT, DEFAULT,
         '00000000-0000-7000-8000-000000000007', '00000000-0000-7000-8000-000000000007');
